import assert from "node:assert/strict";
import { test } from "node:test";
import { sshSessionTargets, sshSessionThread } from "../server/ssh-sessions";
import { isLocalSession, sessionKey } from "../shared/session-identity";
import { columnFor } from "../shared/types";

const target = {
  hostId: "fixture-dev-box",
  threadId: "00000000-0000-4000-8000-000000000001",
};

test("SSH targets require explicit bounded validated pairs, never automatic discovery", () => {
  assert.deepEqual(sshSessionTargets(undefined), []);
  assert.deepEqual(sshSessionTargets(JSON.stringify([target, target])), [
    target,
  ]);
  for (const value of [
    "invalid",
    "{}",
    JSON.stringify([{ ...target, hostId: "local" }]),
    JSON.stringify([{ ...target, threadId: "/path" }]),
    JSON.stringify([{ ...target, extra: true }]),
    JSON.stringify(Array(51).fill(target)),
  ]) {
    assert.throws(() => sshSessionTargets(value));
  }
  assert.equal(sessionKey({ id: target.threadId }), target.threadId);
  assert.equal(
    sessionKey({ id: target.threadId, hostId: "local" }),
    target.threadId,
  );
  assert.notEqual(
    sessionKey({ id: target.threadId, hostId: target.hostId }),
    target.threadId,
  );
  assert.notEqual(
    sessionKey({ id: "b:c", hostId: "a" }),
    sessionKey({ id: "c", hostId: "a:b" }),
  );
  assert.equal(isLocalSession({ hostId: target.hostId }), false);
});

test("remote mapper preserves unknown fields and does not infer idle, completion, unread or paths", () => {
  const unknown = sshSessionThread(target);
  assert.equal(columnFor(unknown), "unknown");
  assert.equal(unknown.fresh, false);
  assert.equal(unknown.kind, "unknown");
  for (const field of [
    "runtime",
    "git",
    "unread",
    "goalStatus",
    "lastUserMessageAt",
    "turnUsage",
  ] as const)
    assert.equal(unknown[field], null);
  const state = sshSessionThread(target, {
    revision: 1,
    ownerClientId: "fixture",
    state: {
      cwd: "C:\remote\repo",
      threadRuntimeStatus: { type: "futureStatus" },
      updatedAt: 1e100,
      requests: [{ command: "PRIVATE" }],
    },
  });
  assert.equal(columnFor(state), "unknown");
  assert.equal(state.cwd, "C:\remote\repo");
  assert.equal(state.git, null);
  assert.equal(state.updatedAt, "");
  assert.equal(state.goalStatus, null);
  assert.ok(!JSON.stringify(state).includes("PRIVATE"));
});
