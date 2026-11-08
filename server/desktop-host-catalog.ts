import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { createConnection } from "node:net";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { readExecutorInvocation } from "../shared/executor-context.js";
import type {
  DesktopCatalogPage,
  DesktopCatalogSession,
} from "../shared/desktop-catalog.js";
export type {
  DesktopCatalogPage,
  DesktopCatalogSession,
  DesktopCatalogCursor,
} from "../shared/desktop-catalog.js";

// The checked installed handler's history branch binds one connected host.
// Other app versions must be revalidated, not admitted on a similar tool name.
export const DESKTOP_CATALOG_ASAR_SHA256 =
  "766faa8a3da8f6d6902c751d5b6b29395a6c5bf3c966ef7f8ca3f629d931df85";
const resources = "/Applications/ChatGPT.app/Contents/Resources";
async function installedProtocolVerified(runtime: string): Promise<boolean> {
  if (
    process.platform !== "darwin" ||
    !(await realpath(runtime)).startsWith(resources + "/")
  )
    return false;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(resources + "/app.asar"))
    hash.update(chunk);
  return hash.digest("hex") === DESKTOP_CATALOG_ASAR_SHA256;
}

type Options = {
  allowedHosts: readonly string[];
  allowedLocalCallers: readonly string[];
  pipePath: string | undefined;
  desktopRuntime: string | undefined;
  timeoutMs?: number;
  /** Synthetic socket fixtures only. No MCP/config field exposes this override. */
  verifyProtocol?: (runtime: string) => Promise<boolean>;
};
export class DesktopCatalogError extends Error {
  constructor(
    readonly code: string,
    readonly transport = { connections: 0, rpcRequests: 0, cancelRequests: 0 },
  ) {
    super(`Desktop host catalog unavailable (${code}).`);
  }
}
function fail(code: string): never {
  throw new DesktopCatalogError(code);
}
const requestSchema = z
  .object({
    hostId: z.string().min(1).max(200),
    limit: z.number().int().min(1).max(50),
    cursor: z
      .object({ hostId: z.string(), value: z.string().min(1).max(10000) })
      .strict()
      .optional(),
  })
  .strict();
const states = new Set(["active", "idle", "notLoaded", "systemError"]);

/** Exact-host history metadata only. No read_thread, wait, resume, remote filesystem or action relay. */
export class DesktopHostCatalog {
  private hosts: Set<string>;
  private callers: Set<string>;
  private seenCalls = new Set<string>();
  constructor(private readonly options: Options) {
    if (
      !options.allowedHosts.length ||
      options.allowedHosts.length > 50 ||
      !options.allowedLocalCallers.length ||
      options.allowedLocalCallers.length > 50 ||
      options.allowedHosts.some(
        (host) =>
          !host ||
          host.length > 200 ||
          ["local", "durable"].includes(host) ||
          /[\x00-\x1f\x7f*]/.test(host),
      ) ||
      options.allowedLocalCallers.some(
        (id) => !z.uuid().safeParse(id).success,
      ) ||
      (options.timeoutMs !== undefined &&
        (!Number.isInteger(options.timeoutMs) ||
          options.timeoutMs < 1 ||
          options.timeoutMs > 15000))
    )
      fail("invalid-scope");
    this.hosts = new Set(options.allowedHosts);
    this.callers = new Set(options.allowedLocalCallers);
  }

  async read(
    meta: unknown,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<DesktopCatalogPage> {
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) fail("invalid-request");
    const request = parsed.data;
    if (!this.hosts.has(request.hostId)) fail("host-not-authorized");
    if (request.cursor && request.cursor.hostId !== request.hostId)
      fail("cursor-host-mismatch");
    const invocation = readExecutorInvocation(meta);
    if (!invocation.ok) fail("executor-context-required");
    const caller = invocation.context;
    if (
      !this.callers.has(caller.threadId) ||
      (caller.hostId && caller.hostId !== "local") ||
      !caller.turnMetadataProvided ||
      !caller.turnId ||
      !caller.callId
    )
      fail("caller-not-authorized");
    const callKey = JSON.stringify([
      "local",
      caller.threadId,
      caller.turnId,
      caller.callId,
    ]);
    if (this.seenCalls.has(callKey)) fail("duplicate-invocation");
    if (this.seenCalls.size >= 1000) fail("invocation-budget-exhausted");
    this.seenCalls.add(callKey);
    if (signal?.aborted) fail("caller-cancelled");
    const { pipePath, desktopRuntime } = this.options;
    if (
      !pipePath ||
      !isAbsolute(pipePath) ||
      !desktopRuntime ||
      !isAbsolute(desktopRuntime)
    )
      fail("desktop-environment-required");
    try {
      if (
        (await realpath(desktopRuntime)) !== (await realpath(process.execPath))
      )
        fail("desktop-runtime-mismatch");
      if (
        !(await (this.options.verifyProtocol ?? installedProtocolVerified)(
          desktopRuntime,
        ))
      )
        fail("desktop-protocol-unverified");
      const info = await lstat(pipePath);
      if (
        !info.isSocket() ||
        info.uid !== process.getuid?.() ||
        (info.mode & 0o077) !== 0
      )
        fail("private-pipe-required");
    } catch (error) {
      if (error instanceof DesktopCatalogError) throw error;
      fail("desktop-environment-unavailable");
    }
    if (signal?.aborted) fail("caller-cancelled");

    return await new Promise<DesktopCatalogPage>((resolve, reject) => {
      const socket = createConnection(pipePath);
      const catalogId = randomUUID(),
        readId = randomUUID();
      let buffer = Buffer.alloc(0),
        phase: "catalog" | "read" = "catalog",
        finished = false,
        connected = false,
        rpcRequests = 0,
        cancelRequests = 0;
      const frame = (value: object) => {
        const body = Buffer.from(JSON.stringify(value));
        const header = Buffer.alloc(4);
        header.writeUInt32LE(body.length);
        return Buffer.concat([header, body]);
      };
      const send = (value: object) => {
        if (finished) return;
        rpcRequests++;
        socket.write(frame(value));
      };
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", aborted);
      };
      const stop = (code: string, cancel = false) => {
        if (finished) return;
        finished = true;
        cleanup();
        if (cancel && phase === "read" && socket.writable) {
          cancelRequests++;
          // Cancel only this probe's native request, never a Codex turn.
          socket.end(
            frame({ id: readId, jsonrpc: "2.0", method: "tools/cancel" }),
          );
          const force = setTimeout(() => socket.destroy(), 200);
          force.unref();
        } else socket.destroy();
        reject(
          new DesktopCatalogError(code, {
            connections: connected ? 1 : 0,
            rpcRequests,
            cancelRequests,
          }),
        );
      };
      const aborted = () => stop("caller-cancelled", true);
      const timer = setTimeout(
        () => stop("timeout-no-retry", true),
        this.options.timeoutMs ?? 15000,
      );
      signal?.addEventListener("abort", aborted, { once: true });
      socket.on("error", () => stop("native-transport-unavailable"));
      socket.on("close", () => stop("native-peer-closed"));
      socket.on("connect", () => {
        if (finished) {
          socket.destroy();
          return;
        }
        connected = true;
        if (signal?.aborted) {
          aborted();
          return;
        }
        send({
          id: catalogId,
          jsonrpc: "2.0",
          method: "tools/list",
          params: { threadStartKind: "all" },
        });
      });
      socket.on("data", (chunk) => {
        if (finished) return;
        buffer = Buffer.concat([buffer, chunk]);
        try {
          while (!finished && buffer.length >= 4) {
            const size = buffer.readUInt32LE();
            if (size > 8 * 1024 * 1024) {
              stop("response-too-large");
              return;
            }
            if (buffer.length < size + 4) return;
            const message = JSON.parse(buffer.subarray(4, size + 4).toString());
            buffer = buffer.subarray(size + 4);
            if (
              message.jsonrpc !== "2.0" ||
              message.id !== (phase === "catalog" ? catalogId : readId)
            )
              continue;
            if (message.error) {
              stop("native-request-rejected");
              return;
            }
            if (phase === "catalog") {
              const tools = message.result?.tools;
              const candidates = Array.isArray(tools)
                ? tools.filter((t) => t?.name === "list_threads")
                : [];
              const tool = candidates[0];
              const supported = [
                "mode",
                "source",
                "hostId",
                "archived",
                "limit",
                "cursor",
              ];
              if (
                candidates.length !== 1 ||
                tool.namespace !== "codex_app" ||
                !tool.inputSchema?.properties?.hostId ||
                !tool.inputSchema.properties.mode ||
                !tool.inputSchema.properties.source ||
                tool.inputSchema.required?.some(
                  (key: unknown) =>
                    typeof key !== "string" || !supported.includes(key),
                )
              ) {
                stop("history-tool-shape-unverified");
                return;
              }
              if (signal?.aborted) {
                aborted();
                return;
              }
              phase = "read";
              send({
                id: readId,
                jsonrpc: "2.0",
                method: "tools/call",
                params: {
                  callerSource: "codex",
                  hostId: "local",
                  threadId: caller.threadId,
                  turnId: caller.turnId,
                  callId: caller.callId,
                  namespace: "codex_app",
                  tool: "list_threads",
                  arguments: {
                    mode: "history",
                    source: "codex",
                    hostId: request.hostId,
                    archived: false,
                    limit: request.limit,
                    ...(request.cursor ? { cursor: request.cursor.value } : {}),
                  },
                },
              });
            } else {
              const result = message.result;
              if (result?.success === false) {
                const text = result.contentItems?.[0]?.text;
                stop(
                  text ===
                    `No connected Codex thread host found for hostId: ${request.hostId}`
                    ? "target-host-not-connected"
                    : "native-tool-call-unavailable",
                );
                return;
              }
              if (
                result?.success !== true ||
                !Array.isArray(result.contentItems) ||
                result.contentItems.length !== 1 ||
                result.contentItems[0]?.type !== "inputText" ||
                typeof result.contentItems[0].text !== "string" ||
                Buffer.byteLength(result.contentItems[0].text) > 1024 * 1024
              ) {
                stop("history-response-unverified");
                return;
              }
              const body = JSON.parse(result.contentItems[0].text);
              if (
                !Array.isArray(body.threads) ||
                body.threads.length > request.limit ||
                !(
                  body.nextCursor === null ||
                  (typeof body.nextCursor === "string" &&
                    body.nextCursor.length > 0 &&
                    body.nextCursor.length <= 10000)
                )
              ) {
                stop("history-page-unverified");
                return;
              }
              const seen = new Set<string>();
              const sessions: DesktopCatalogSession[] = [];
              for (const row of body.threads) {
                if (
                  row?.kind !== "codex" ||
                  row.hostId !== request.hostId ||
                  !z.uuid().safeParse(row.id).success ||
                  seen.has(row.id)
                ) {
                  stop("history-host-or-identity-mismatch");
                  return;
                }
                seen.add(row.id);
                sessions.push({
                  id: row.id,
                  hostId: request.hostId,
                  title:
                    typeof row.title === "string"
                      ? row.title.slice(0, 2000)
                      : null,
                  cwd:
                    typeof row.cwd === "string" &&
                    row.cwd.length <= 4096 &&
                    !/[\x00-\x1f\x7f]/.test(row.cwd)
                      ? row.cwd
                      : null,
                  listedState: states.has(row.status) ? row.status : null,
                  updatedAtSeconds:
                    typeof row.updatedAt === "number" &&
                    Number.isFinite(row.updatedAt) &&
                    row.updatedAt >= 0
                      ? row.updatedAt
                      : null,
                });
              }
              if (signal?.aborted) {
                aborted();
                return;
              }
              finished = true;
              cleanup();
              socket.end();
              resolve({
                source: "desktop-native:list_threads/history",
                hostId: request.hostId,
                sessions,
                nextCursor:
                  body.nextCursor === null
                    ? null
                    : { hostId: request.hostId, value: body.nextCursor },
                runtimeFreshness: "not-established",
                transport: { connections: 1, rpcRequests, cancelRequests },
              });
            }
          }
        } catch {
          stop("native-response-invalid");
        }
      });
    });
  }
}
