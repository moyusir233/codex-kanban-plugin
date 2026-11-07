import assert from "node:assert/strict";
import { test } from "node:test";
import { sshTurnTiming } from "../server/ssh-turn-timing";
import { sshSessionThread } from "../server/ssh-sessions";
import { sessionKey } from "../shared/session-identity";
import type { Snapshot } from "../shared/types";
import { elapsedMs } from "../ui/card-metrics";
import { cachedSnapshot, reconcileSnapshot } from "../ui/snapshot-cache";

const observedAt = "2026-11-07T08:00:05.000Z";
const start = Date.parse("2026-11-07T08:00:00.000Z");
const turn = {
  turnId: "fixture-turn",
  status: "inProgress",
  turnStartedAtMs: start,
  durationMs: null,
  items: [],
};
const target = {
  hostId: "fixture-host",
  threadId: "00000000-0000-4000-8000-000000000001",
};

test("snapshot timing uses only validated milliseconds, not inferred usage or input", () => {
  const state = {
    threadRuntimeStatus: { type: "active" },
    turns: [
      {
        ...turn,
        params: { input: [{ type: "text", text: "PRIVATE_CONTEXT" }] },
        items: [{ type: "agentMessage", text: "PRIVATE_OUTPUT" }],
        finalAssistantStartedAtMs: start + 1000,
        tokens: 123,
      },
    ],
    latestTokenUsageInfo: {
      total: { totalTokens: 999 },
      last: { totalTokens: 123 },
    },
    rolloutPath: "/REMOTE_NOT_LOCAL",
  };
  assert.deepEqual(sshTurnTiming(state, observedAt), {
    id: turn.turnId,
    status: "inProgress",
    startedAt: new Date(start).toISOString(),
    completedAt: null,
    updatedAt: observedAt,
    durationMs: null,
    tokens: null,
    userInput: null,
  });
  const mapped = sshSessionThread(target, {
    state,
    revision: 1,
    ownerClientId: "fixture",
  });
  assert.equal(mapped.lastUserMessageAt, null);
  assert.equal(mapped.git, null);
  assert.doesNotMatch(JSON.stringify(mapped), /PRIVATE_|REMOTE_NOT_LOCAL/);
});

test("terminal elapsed time requires duration, never observation or final-answer time", () => {
  for (const status of ["completed", "interrupted"]) {
    const timing = sshTurnTiming(
      { turns: [{ ...turn, status, durationMs: 1250 }] },
      observedAt,
    )!;
    assert.equal(timing.durationMs, 1250);
    assert.equal(timing.completedAt, null);
    assert.equal(elapsedMs({ turnUsage: timing } as any, start + 1e8), 1250);
    for (const durationMs of [
      undefined,
      null,
      -1,
      Infinity,
      NaN,
      1.5,
      "1250",
      Number.MAX_SAFE_INTEGER + 1,
    ])
      assert.equal(
        sshTurnTiming(
          {
            turns: [
              {
                ...turn,
                status,
                durationMs,
                finalAssistantStartedAtMs: start + 1250,
              },
            ],
          },
          observedAt,
        ),
        null,
      );
  }
  assert.equal(
    sshTurnTiming(
      {
        turns: [
          {
            ...turn,
            status: "completed",
            turnStartedAtMs: null,
            durationMs: 0,
          },
        ],
      },
      observedAt,
    )?.durationMs,
    0,
  );
  assert.equal(
    sshTurnTiming(
      {
        threadRuntimeStatus: { type: "active" },
        turns: [{ ...turn, durationMs: 3000 }],
      },
      observedAt,
    )?.durationMs,
    null,
  );
});

test("missing, malformed and future protocol shapes stay unknown", () => {
  for (const state of [
    undefined,
    {},
    { turns: [] },
    { turns: [{ ...turn, status: "failed" }] },
    { turns: [{ ...turn, status: "future" }] },
    { turns: [{ ...turn, turnId: "" }] },
    { turns: [{ ...turn, items: {} }] },
    { turns: [turn, { turnId: null, status: "inProgress", items: [] }] },
    { turns: [turn, null] },
    {
      turnHistory: {
        kind: "canonical",
        history: {
          islands: [{ entries: {}, newerBoundary: { status: "exhausted" } }],
        },
      },
    },
    { threadRuntimeStatus: { type: "idle" }, turns: [turn] },
    { threadRuntimeStatus: { type: "notLoaded" }, turns: [turn] },
    {
      threadRuntimeStatus: { type: "active" },
      turns: [{ ...turn, turnStartedAtMs: start + 10000 }],
    },
  ])
    assert.equal(sshTurnTiming(state, observedAt), null);
  for (const turnStartedAtMs of [
    undefined,
    null,
    "2026-11-07",
    String(start),
    -1,
    NaN,
    Infinity,
    1.5,
    Number.MAX_SAFE_INTEGER,
  ])
    assert.equal(
      sshTurnTiming(
        {
          threadRuntimeStatus: { type: "active" },
          turns: [{ ...turn, turnStartedAtMs }],
        },
        observedAt,
      ),
      null,
    );
  assert.equal(sshTurnTiming({ turns: [turn] }, "not a date"), null);
});

test("canonical history must reach the latest boundary and live overlay wins", () => {
  const state = {
    turnHistory: {
      kind: "canonical",
      history: {
        islands: [
          {
            entries: [{ value: "entry" }],
            newerBoundary: { status: "exhausted" },
          },
        ],
        entitiesByKey: {
          entry: { ...turn, durationMs: 1000, status: "completed" },
        },
      },
    },
    turns: [{ ...turn, durationMs: 2500, status: "completed" }],
  };
  assert.equal(sshTurnTiming(state, observedAt)?.durationMs, 2500);
  assert.equal(
    sshTurnTiming({ ...state, turns: [] }, observedAt)?.durationMs,
    1000,
  );
  state.turnHistory.history.islands[0].entries.push({ value: "missing" });
  assert.equal(sshTurnTiming(state, observedAt), null);
  state.turnHistory.history.islands[0].entries.pop();
  state.turnHistory.history.islands[0].newerBoundary.status = "available";
  assert.equal(sshTurnTiming(state, observedAt), null);
  state.turnHistory.history.islands[0].newerBoundary.status = "future";
  assert.equal(sshTurnTiming(state, observedAt), null);
});

test("host-scoped timing is cleared on loss/cache and restored only by a live snapshot", () => {
  const thread = sshSessionThread(target, {
    state: {
      title: "Fixture remote title",
      cwd: "/REMOTE",
      turns: [turn],
      threadRuntimeStatus: { type: "active" },
    },
    revision: 1,
    ownerClientId: "fixture",
  });
  thread.turnUsage = sshTurnTiming(
    { threadRuntimeStatus: { type: "active" }, turns: [turn] },
    observedAt,
  );
  const local = { ...thread, hostId: "local", title: "Local" };
  const other = {
    ...thread,
    hostId: "fixture-other",
    title: "Other",
    turnUsage: { ...thread.turnUsage!, durationMs: 777 },
  };
  const snapshot = {
    schemaVersion: 1,
    generatedAt: observedAt,
    threads: [local, thread, other],
    sources: { metadata: true },
    connection: {},
  } as Snapshot;
  assert.equal(elapsedMs(thread, start + 5000), 5000);
  const cached = cachedSnapshot(snapshot);
  assert.equal(cached.threads[0].turnUsage, local.turnUsage);
  assert.equal(cached.threads[1].turnUsage, null);
  assert.equal(cached.threads[2].turnUsage, null);
  const lost = reconcileSnapshot(snapshot, {
    ...snapshot,
    threads: [local, sshSessionThread(target), other],
  });
  assert.equal(lost.threads[1].turnUsage, null);
  assert.equal(lost.threads[1].title, thread.title);
  assert.equal(lost.threads[1].fresh, false);
  assert.equal(elapsedMs(lost.threads[1], start + 1e8), null);
  assert.equal(lost.threads[2].turnUsage?.durationMs, 777);
  const restored = reconcileSnapshot(lost, snapshot);
  assert.equal(restored.threads[1].turnUsage, thread.turnUsage);
  assert.notEqual(
    sessionKey(restored.threads[0]),
    sessionKey(restored.threads[1]),
  );
});
