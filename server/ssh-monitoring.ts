import { z } from "zod";
import { isLocalSession, sessionKey } from "../shared/session-identity.js";
import type { Thread, ThreadLink } from "../shared/types.js";
import { sshSnapshotTurn } from "./ssh-snapshot-turn.js";

const sshWaitHostSchema = z.string().min(1).max(200);
const sshWaitArgumentsSchema = z
  .object({
    targets: z
      .array(
        z
          .object({
            threadId: z.uuid(),
            hostId: sshWaitHostSchema.optional(),
            afterCursor: z.string().min(1).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    timeoutMs: z.number().int().min(1).max(120000).optional(),
  })
  .strict();
const sshWaitResultSchema = z.object({
  timedOut: z.boolean(),
  wake: z.object({}).passthrough().nullable(),
  polls: z
    .array(
      z.object({ thread: z.object({ id: z.uuid(), hostId: sshWaitHostSchema }) }),
    )
    .max(8),
});

/** Positive wait evidence only; never derive relationships from prompts/results
 * alone, immediate polls, failed calls or a guessed host. Keep only pair keys. */
function waitTargets(item: any, source: Thread): string[] {
  if (
    item?.tool !== "wait_threads" ||
    item.status !== "completed" ||
    item.error != null
  )
    return [];
  let content: any[];
  let textType: string;
  if (item.type === "mcpToolCall" && item.server === "codex_app") {
    if (item.result?.isError != null && item.result.isError !== false)
      return [];
    content = item.result?.content;
    textType = "text";
  } else if (
    item.type === "dynamicToolCall" &&
    item.namespace === "codex_app" &&
    item.success === true
  ) {
    content = item.contentItems;
    textType = "inputText";
  } else return [];
  const args = sshWaitArgumentsSchema.safeParse(item.arguments);
  if (!args.success || !Array.isArray(content) || content.length > 50)
    return [];
  // The traced Desktop handler rejects its caller ID even on another host.
  if (args.data.targets.some((target) => target.threadId === source.id))
    return [];
  const parts = content.filter((part) => part?.type === textType);
  if (
    parts.length !== 1 ||
    typeof parts[0].text !== "string" ||
    parts[0].text.length > 1048576
  )
    return [];
  try {
    const result = sshWaitResultSchema.safeParse(JSON.parse(parts[0].text));
    if (!result.success) return [];
    const requested = args.data.targets.map((target) =>
      sessionKey({
        id: target.threadId,
        hostId: target.hostId ?? source.hostId,
      }),
    );
    if (new Set(requested).size !== requested.length) return [];
    const returned = new Set(
      result.data.polls.map((poll) =>
        sessionKey({ id: poll.thread.id, hostId: poll.thread.hostId }),
      ),
    );
    return requested.filter(
      (key) => key !== sessionKey(source) && returned.has(key),
    );
  } catch {
    return [];
  }
}

/** Add SSH-only graph edges between already registered, live ordinary cards.
 * Result bodies cannot register/observe targets or supply their title/runtime.
 * Local arrays and references remain untouched; no filesystem or RPC is used. */
export function withSshMonitoring(
  threads: Thread[],
  states: ReadonlyMap<string, any>,
): Thread[] {
  const current = new Map(
    threads
      .filter(
        (thread) =>
          !isLocalSession(thread) &&
          thread.fresh &&
          thread.kind === "user" &&
          ["active", "idle"].includes(thread.runtime?.type ?? ""),
      )
      .map((thread) => [sessionKey(thread), thread]),
  );
  const links = new Map<
    string,
    { monitoring: ThreadLink[]; monitoredBy: ThreadLink[] }
  >();
  const reference = (thread: Thread): ThreadLink => ({
    id: thread.id,
    hostId: thread.hostId,
    title: thread.title,
  });
  for (const [key, source] of current) {
    const turn = sshSnapshotTurn(states.get(key));
    const turnId = turn?.turnId ?? turn?.id;
    if (
      !turn ||
      typeof turnId !== "string" ||
      !turnId.length ||
      !["inProgress", "completed", "interrupted"].includes(turn.status)
    )
      continue;
    const targets = new Set<string>();
    for (const item of turn.items ?? [])
      for (const target of waitTargets(item, source))
        if (current.has(target)) targets.add(target);
    for (const targetKey of targets) {
      const outgoing = links.get(key) ?? { monitoring: [], monitoredBy: [] };
      const incoming = links.get(targetKey) ?? {
        monitoring: [],
        monitoredBy: [],
      };
      outgoing.monitoring.push(reference(current.get(targetKey)!));
      incoming.monitoredBy.push(reference(source));
      links.set(key, outgoing);
      links.set(targetKey, incoming);
    }
  }
  return threads.map((thread) => {
    if (isLocalSession(thread)) return thread;
    const relations = links.get(sessionKey(thread));
    return {
      ...thread,
      monitoring: relations?.monitoring ?? [],
      monitoredBy: relations?.monitoredBy ?? [],
    };
  });
}
