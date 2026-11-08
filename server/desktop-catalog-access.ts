import { createHash } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { DesktopHostCatalog } from "./desktop-host-catalog.js";
import { readExecutorInvocation } from "../shared/executor-context.js";
import type {
  DesktopCatalogAvailability,
  DesktopCatalogPage,
} from "../shared/desktop-catalog.js";
import { displayTitle } from "./local-data.js";

const host = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (value) =>
      !["local", "durable"].includes(value) && !/[\x00-\x1f\x7f*]/.test(value),
  );
const policySchema = z
  .object({
    grantId: z.uuid(),
    hosts: z.array(host).min(1).max(50),
    localCallers: z.array(z.uuid()).min(1).max(50),
    expiresAt: z.iso.datetime(),
    pageSize: z.number().int().min(1).max(50).default(10),
    maxReads: z.number().int().min(1).max(100).default(1),
  })
  .strict();
export const desktopCatalogInput = z
  .object({
    hostId: host,
    limit: z.number().int().min(1).max(50).optional(),
    cursor: z
      .object({ hostId: host, value: z.string().min(1).max(10000) })
      .strict()
      .optional(),
  })
  .strict();
type CatalogReader = Pick<DesktopHostCatalog, "read">;
export class CatalogAccessError extends Error {
  constructor(readonly code: string) {
    super(`SSH directory unavailable (${code}). No retry was sent.`);
  }
}

/** Explicit expiring grants; no background reads or cached cross-caller data. */
export class DesktopCatalogAccess {
  private policy: z.infer<typeof policySchema>;
  private reader: CatalogReader;
  constructor(
    value: string,
    private readonly home: string,
    reader?: CatalogReader,
  ) {
    let data: unknown;
    try {
      if (value.length > 32768) throw new Error();
      data = JSON.parse(value);
    } catch {
      throw new Error("Invalid TASKBOARD_DESKTOP_CATALOG policy.");
    }
    const parsed = policySchema.safeParse(data);
    if (
      !parsed.success ||
      !Number.isFinite(Date.parse(parsed.data.expiresAt)) ||
      Date.parse(parsed.data.expiresAt) > Date.now() + 24 * 60 * 60 * 1000
    )
      throw new Error("Invalid TASKBOARD_DESKTOP_CATALOG policy.");
    this.policy = parsed.data;
    this.reader =
      reader ??
      new DesktopHostCatalog({
        allowedHosts: this.policy.hosts,
        allowedLocalCallers: this.policy.localCallers,
        pipePath: process.env.CODEX_APP_TOOLS_PIPE_PATH,
        desktopRuntime: process.env.CODEX_MCP_NODE_PATH,
      });
  }
  private caller(meta: unknown) {
    const parsed = readExecutorInvocation(meta);
    if (!parsed.ok) throw new CatalogAccessError("executor-context-required");
    const context = parsed.context;
    if (
      !this.policy.localCallers.includes(context.threadId) ||
      (context.hostId && context.hostId !== "local") ||
      !context.turnMetadataProvided ||
      !context.turnId ||
      !context.callId
    )
      throw new CatalogAccessError("caller-not-authorized");
    return context;
  }
  info(meta: unknown): DesktopCatalogAvailability | undefined {
    try {
      this.caller(meta);
    } catch {
      return undefined;
    }
    return {
      grantId: this.policy.grantId,
      scopeKey: createHash("sha256")
        .update(JSON.stringify(this.policy))
        .digest("hex"),
      hosts: [...new Set(this.policy.hosts)],
      pageSize: this.policy.pageSize,
      maxReads: this.policy.maxReads,
      expiresAt: this.policy.expiresAt,
      expired: Date.now() >= Date.parse(this.policy.expiresAt),
    };
  }
  async read(
    meta: unknown,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<DesktopCatalogPage> {
    const context = this.caller(meta);
    const parsed = desktopCatalogInput.safeParse(input);
    if (
      !parsed.success ||
      !this.policy.hosts.includes(parsed.data.hostId) ||
      (parsed.data.limit !== undefined &&
        parsed.data.limit > this.policy.pageSize) ||
      (parsed.data.cursor && parsed.data.cursor.hostId !== parsed.data.hostId)
    )
      throw new CatalogAccessError("host-page-not-authorized");
    if (Date.now() >= Date.parse(this.policy.expiresAt))
      throw new CatalogAccessError("grant-expired");
    if (signal?.aborted) throw new CatalogAccessError("caller-cancelled");
    const directory = join(
      this.home,
      "kanban",
      "desktop-catalog-grants",
      this.policy.grantId,
    );
    const key = createHash("sha256")
      .update(
        JSON.stringify([
          "local",
          context.threadId,
          context.turnId,
          context.callId,
        ]),
      )
      .digest("hex");
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
    } catch {
      throw new CatalogAccessError("budget-unavailable");
    }
    let claimed = false;
    for (let index = 0; index < this.policy.maxReads; index++) {
      try {
        const slot = await open(
          join(directory, `read-${index}.json`),
          "wx",
          0o600,
        );
        try {
          await slot.writeFile(JSON.stringify({ callHash: key }) + "\n");
        } finally {
          await slot.close();
        }
        claimed = true;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST")
          throw new CatalogAccessError("budget-unavailable");
        let used: unknown;
        try {
          const text = await readFile(
            join(directory, `read-${index}.json`),
            "utf8",
          );
          if (text.length > 256) throw new Error();
          used = JSON.parse(text);
        } catch {
          throw new CatalogAccessError("budget-ledger-unavailable");
        }
        const hash = (used as { callHash?: unknown })?.callHash;
        if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))
          throw new CatalogAccessError("budget-ledger-unavailable");
        if (hash === key) throw new CatalogAccessError("duplicate-call");
      }
    }
    if (!claimed) throw new CatalogAccessError("read-budget-exhausted");
    const page = await this.reader.read(
      meta,
      { ...parsed.data, limit: parsed.data.limit ?? this.policy.pageSize },
      signal,
    );
    if (signal?.aborted) throw new CatalogAccessError("caller-cancelled");
    if (Date.now() >= Date.parse(this.policy.expiresAt))
      throw new CatalogAccessError("grant-expired");
    return {
      ...page,
      sessions: page.sessions.map((session) => ({
        ...session,
        title: displayTitle(session.title, session.id),
      })),
    };
  }
}
