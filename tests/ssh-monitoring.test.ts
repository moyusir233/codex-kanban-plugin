import assert from "node:assert/strict";
import { test } from "node:test";
import { withSshMonitoring } from "../server/ssh-monitoring";
import { sshSessionThread } from "../server/ssh-sessions";
import { sessionKey } from "../shared/session-identity";
import type { Snapshot, Thread } from "../shared/types";
import { cachedSnapshot, reconcileSnapshot } from "../ui/snapshot-cache";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const target = (n: number, hostId = "fixture-a") => ({
  threadId: id(n),
  hostId,
});
const source = target(1);
const second = target(2);
const sameIdOtherHost = target(2, "fixture-b");
const wait = (targets: object[], polls = targets, dynamic = false): any => {
  const text = JSON.stringify({
    timedOut: true,
    wake: null,
    polls: polls.map((pair: any) => ({
      thread: {
        id: pair.threadId,
        hostId: pair.hostId ?? source.hostId,
        title: "PRIVATE_UNTRUSTED_TITLE",
      },
      latestAssistantMessage: { text: "PRIVATE_TOOL_RESULT" },
    })),
  });
  return {
    id: "fixture-wait",
    tool: "wait_threads",
    status: "completed",
    arguments: { targets, timeoutMs: 55000 },
    ...(dynamic
      ? {
          type: "dynamicToolCall",
          namespace: "codex_app",
          success: true,
          contentItems: [{ type: "inputText", text }],
        }
      : {
          type: "mcpToolCall",
          server: "codex_app",
          result: { content: [{ type: "text", text }], isError: false },
        }),
  };
};
const state = (item: any, status = "inProgress"): any => ({
  threadRuntimeStatus: { type: "active" },
  turns: [{ turnId: "fixture-turn", status, items: [item] }],
});
function fixture(input: any, extra: Thread[] = []) {
  const pairList = [source, second, sameIdOtherHost];
  const threads = pairList.map((pair, index) =>
    sshSessionThread(pair, {
      revision: 1,
      ownerClientId: "fixture",
      state: {
        title: `Trusted snapshot ${index}`,
        threadRuntimeStatus: { type: "active" },
      },
    }),
  );
  return {
    threads: [...threads, ...extra],
    states: new Map([[sessionKey(threads[0]), input]]),
  };
}
const links = (thread: Thread) => ({
  id: thread.id,
  hostId: thread.hostId,
  title: thread.title,
});
test("snapshot waits join exact requested/returned SSH pairs with live trusted titles and no local changes", () => {
  const local = {
    ...sshSessionThread(second),
    hostId: undefined,
    monitoring: [{ id: id(99), title: "Local reference" }],
    monitoredBy: [],
  };
  const f = fixture(
    state(
      wait(
        [second, sameIdOtherHost, target(99)],
        [second, sameIdOtherHost, target(99)],
      ),
    ),
    [local],
  );
  const output = withSshMonitoring(f.threads, f.states);
  assert.deepEqual(output[0].monitoring, [links(output[1]), links(output[2])]);
  assert.deepEqual(output[1].monitoredBy, [links(output[0])]);
  assert.deepEqual(output[2].monitoredBy, [links(output[0])]);
  assert.equal(output.at(-1), local);
  assert.equal(
    f.threads[0].monitoring,
    undefined,
    "Input snapshots are not mutated",
  );
  assert.doesNotMatch(
    JSON.stringify(output),
    /PRIVATE_|fixture-wait|fixture-turn/,
  );
  assert.equal(
    output.some((thread) => thread.id === id(99)),
    false,
    "Tool outputs cannot discover targets",
  );
});

test("omitted target host means the caller host, never local; partial success and deduplication preserve pairs", () => {
  const item = wait([{ threadId: second.threadId }, sameIdOtherHost], [second]);
  const f = fixture(state(item));
  f.states
    .get(sessionKey(f.threads[0]))
    .turns[0].items.push({ ...item, id: "another-wait" });
  const output = withSshMonitoring(f.threads, f.states);
  assert.deepEqual(output[0].monitoring, [links(output[1])]);
  assert.deepEqual(output[2].monitoredBy, []);
  for (const pair of [
    { ...second, hostId: "local" },
    sameIdOtherHost,
    source,
  ]) {
    const rejected = fixture(state(wait([second], [pair])));
    assert.deepEqual(
      withSshMonitoring(rejected.threads, rejected.states)[0].monitoring,
      [],
    );
  }
});

test("only completed successful recognized waits produce edges; immediate/failed/future/malformed evidence stays unavailable", () => {
  const base = wait([second]);
  const invalid = [
    { ...base, type: "McpToolCall" },
    { ...base, server: "other" },
    { ...base, tool: "read_thread" },
    { ...base, status: "failed" },
    { ...base, status: "inProgress" },
    { ...base, status: "future" },
    { ...base, error: {} },
    { ...base, error: "" },
    { ...base, error: false },
    { ...base, error: 0 },
    { ...base, result: { ...base.result, isError: true } },
    { ...base, result: { ...base.result, isError: "false" } },
    { ...base, arguments: { targets: [second], timeoutMs: 0 } },
    { ...base, arguments: { targets: [second], timeoutMs: -1 } },
    { ...base, arguments: { targets: [second], timeoutMs: 120001 } },
    { ...base, arguments: { targets: [second, second] } },
    { ...base, arguments: { targets: [second, source] } },
    {
      ...base,
      arguments: { targets: [{ ...source, hostId: "fixture-b" }] },
    },
    {
      ...base,
      arguments: { targets: [{ threadId: id(2), hostId: ["fixture-a"] }] },
    },
    { ...base, arguments: { targets: [second], extra: true } },
    { ...base, arguments: { targets: Array(9).fill(second) } },
    { ...base, result: null },
    { ...base, result: { content: Array(51).fill({ type: "image" }) } },
    { ...base, result: { content: [{ type: "text", text: "not JSON" }] } },
    {
      ...base,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              polls: [{ thread: { id: second.threadId } }],
            }),
          },
        ],
      },
    },
    {
      ...base,
      result: { content: [base.result.content[0], base.result.content[0]] },
    },
    {
      ...base,
      result: { content: [{ type: "text", text: "x".repeat(1048577) }] },
    },
    { ...wait([second], [second], true), success: null },
    { ...wait([second], [second], true), namespace: null },
    {
      ...base,
      arguments: { targets: [{ ...second, hostId: "x".repeat(201) }] },
    },
  ];
  for (const item of invalid) {
    const f = fixture(state(item));
    assert.deepEqual(withSshMonitoring(f.threads, f.states)[0].monitoring, []);
  }
  for (const status of ["inProgress", "completed", "interrupted"]) {
    const f = fixture(state(wait([second], [second], true), status));
    assert.deepEqual(withSshMonitoring(f.threads, f.states)[0].monitoring, [
      links(f.threads[1]),
    ]);
  }
  const immediate = wait([second]);
  delete immediate.arguments.timeoutMs;
  const defaultWait = fixture(state(immediate));
  assert.deepEqual(
    withSshMonitoring(defaultWait.threads, defaultWait.states)[0].monitoring,
    [links(defaultWait.threads[1])],
  );
  const incomplete = fixture(state(base));
  incomplete.states.get(sessionKey(incomplete.threads[0])).turns[0].turnId = "";
  assert.deepEqual(
    withSshMonitoring(incomplete.threads, incomplete.states)[0].monitoring,
    [],
  );
});

test("newest canonical boundary and live overlays prevent stale monitoring fallback", () => {
  const turn = state(wait([second])).turns[0];
  const input: any = {
    turnHistory: {
      kind: "canonical",
      history: {
        islands: [
          {
            entries: [{ value: "latest" }],
            newerBoundary: { status: "exhausted" },
          },
        ],
        entitiesByKey: { latest: turn },
      },
    },
  };
  const f = fixture(input);
  assert.deepEqual(withSshMonitoring(f.threads, f.states)[0].monitoring, [
    links(f.threads[1]),
  ]);
  for (const overlay of [
    [{ turnId: "next", status: "inProgress", items: [] }],
    [{ turnId: null, status: "inProgress", items: [] }],
    [null],
    [{ turnId: "next", status: "failed", items: [] }],
    [{ turnId: "next", status: "future", items: [] }],
    [{ turnId: "next", status: "inProgress", items: {} }],
  ]) {
    input.turns = overlay;
    assert.deepEqual(withSshMonitoring(f.threads, f.states)[0].monitoring, []);
  }
  delete input.turns;
  input.turnHistory.history.islands[0].newerBoundary.status = "available";
  assert.deepEqual(withSshMonitoring(f.threads, f.states)[0].monitoring, []);
  input.turnHistory.history.islands[0].newerBoundary.status = "exhausted";
  input.turnHistory.history.islands[0].entries.push({ value: "missing" });
  assert.deepEqual(withSshMonitoring(f.threads, f.states)[0].monitoring, []);
});

test("loss, unknown runtime, subagents and cache invalidate both directions; replacement restores only the live graph", () => {
  const f = fixture(state(wait([second])));
  const live = withSshMonitoring(f.threads, f.states);
  for (const overrides of [
    { fresh: false },
    { runtime: null },
    { kind: "agent" },
    { runtime: { type: "notLoaded" } },
  ]) {
    for (const index of [0, 1]) {
      const unavailable = [...live];
      unavailable[index] = { ...unavailable[index], ...overrides } as Thread;
      const output = withSshMonitoring(unavailable, f.states);
      assert.deepEqual(output[0].monitoring, []);
      assert.deepEqual(output[1].monitoredBy, []);
    }
  }
  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    threads: live,
    connection: {
      state: "connected",
      endpoint: "fixture",
      since: null,
      message: null,
    },
    sources: { metadata: true },
  } as Snapshot;
  const cache = cachedSnapshot(snapshot);
  assert.deepEqual(cache.threads[0].monitoring, []);
  assert.deepEqual(cache.threads[1].monitoredBy, []);
  const lost = reconcileSnapshot(snapshot, {
    ...snapshot,
    threads: cache.threads,
  });
  assert.deepEqual(lost.threads[0].monitoring, []);
  const replacement = reconcileSnapshot(lost, snapshot);
  assert.deepEqual(replacement.threads[0].monitoring, [links(live[1])]);
  assert.deepEqual(replacement.threads[1].monitoredBy, [links(live[0])]);
});
