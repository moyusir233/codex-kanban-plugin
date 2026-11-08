/** Request metadata assertions only; this parser does not authenticate a caller. */
export type ExecutorInvocation = {
  threadId: string;
  turnId?: string;
  callId?: string;
  hostId?: string;
  turnMetadataProvided: boolean;
};
type Value = Record<string, unknown>;
const record = (value: unknown): Value | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Value)
    : undefined;
const own = (value: Value | undefined, key: string): unknown =>
  value && Object.hasOwn(value, key) ? value[key] : undefined;
function identity(values: unknown[]) {
  const supplied = values.filter((value) => value !== undefined);
  if (
    supplied.some(
      (value) =>
        typeof value !== "string" ||
        !value.trim() ||
        value !== value.trim() ||
        value.length > 1000,
    )
  )
    return { invalid: true, value: undefined };
  const distinct = new Set(supplied as string[]);
  return { invalid: distinct.size > 1, value: distinct.values().next().value };
}

export function readExecutorInvocation(
  meta: unknown,
): { ok: true; context: ExecutorInvocation } | { ok: false; reason: string } {
  const metadata = record(meta);
  let rawTurn = own(metadata, "x-codex-turn-metadata");
  if (typeof rawTurn === "string") {
    if (rawTurn.length > 4096)
      return { ok: false, reason: "invalid-turn-metadata" };
    try {
      rawTurn = JSON.parse(rawTurn);
    } catch {
      return { ok: false, reason: "invalid-turn-metadata" };
    }
  }
  const turn = record(rawTurn);
  if (rawTurn !== undefined && !turn)
    return { ok: false, reason: "invalid-turn-metadata" };
  const fields = (keys: string[]) => keys.map((key) => own(metadata, key));
  const nested = (key: string) => own(record(own(metadata, key)), "id");
  const thread = identity([
    ...fields([
      "openai/threadId",
      "openai/thread_id",
      "codexThreadId",
      "codex_thread_id",
      "threadId",
      "thread_id",
    ]),
    own(turn, "thread_id"),
    nested("thread"),
  ]);
  if (thread.invalid)
    return { ok: false, reason: "conflicting-caller-metadata" };
  if (!thread.value) return { ok: false, reason: "caller-metadata-required" };
  const host = identity(
    fields([
      "openai/hostId",
      "openai/host_id",
      "codexHostId",
      "codex_host_id",
      "hostId",
      "host_id",
    ]),
  );
  if (host.invalid) return { ok: false, reason: "caller-host-not-local" };
  const turnId = identity([
    ...fields([
      "openai/turnId",
      "openai/turn_id",
      "codexTurnId",
      "codex_turn_id",
      "turnId",
      "turn_id",
    ]),
    own(turn, "turn_id"),
    nested("turn"),
  ]);
  const call = identity([
    ...fields([
      "openai/toolCallId",
      "openai/tool_call_id",
      "codexCallId",
      "codex_call_id",
      "callId",
      "call_id",
    ]),
    nested("call"),
  ]);
  if (turnId.invalid || call.invalid)
    return { ok: false, reason: "conflicting-execution-metadata" };
  return {
    ok: true,
    context: {
      threadId: thread.value,
      turnId: turnId.value,
      callId: call.value,
      hostId: host.value,
      turnMetadataProvided: rawTurn !== undefined,
    },
  };
}
