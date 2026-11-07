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
  // Registration is the ordinary-session trust boundary, not a runtime signal.
  assert.equal(unknown.kind, "user");
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

test("registered ordinary sessions pass board filters while subagents remain excluded", async () => {
  const { matchesFilters, DEFAULT_FILTERS } =
    await import("../ui/board-filters");
  const ordinary = sshSessionThread(target);
  assert.equal(matchesFilters(ordinary, DEFAULT_FILTERS), true);
  const agent = sshSessionThread(target, {
    revision: 1,
    ownerClientId: "fixture",
    state: { source: { subAgent: { parentThreadId: "parent" } } },
  });
  assert.equal(agent.kind, "agent");
  assert.equal(matchesFilters(agent, DEFAULT_FILTERS), false);
  assert.equal(
    matchesFilters({ ...ordinary, kind: "unknown" }, DEFAULT_FILTERS),
    false,
  );
});

test("remote collaboration modes accept local-compatible string and object shapes only", () => {
  for (const [shape, expected] of [
    ["plan", "plan"],
    ["default", "default"],
    [{ mode: "plan", settings: { model: "fixture" } }, "plan"],
    [{ mode: "default" }, "default"],
    [undefined, null],
    [null, null],
    [{ mode: "future" }, null],
    [{ settings: {} }, null],
    ["future", null],
  ] as const) {
    assert.equal(
      sshSessionThread(target, {
        revision: 1,
        ownerClientId: "fixture",
        state: { latestCollaborationMode: shape },
      }).collaborationMode,
      expected,
    );
  }
});

test("SSH display reuses known structured Desktop questions and turn failures, never actions or invented usage", () => {
  const conversation = (state: any) => ({
    revision: 1,
    ownerClientId: "fixture",
    state,
  });
  const question = {
    id: "q",
    type: "agentMessage",
    questions: [{ title: "Read-only question?" }],
    text: "PRIVATE_ASSISTANT_BODY",
  };
  const turn = { id: "t", status: "completed", items: [question] };
  const state = {
    threadRuntimeStatus: { type: "idle" },
    turns: [turn],
    requests: [{ id: "approval", command: "PRIVATE_COMMAND" }],
  };
  const waiting = sshSessionThread(target, conversation(state));
  assert.equal(columnFor(waiting), "waiting");
  assert.equal(waiting.waitingQuestion, "Read-only question?");
  assert.equal(waiting.waitingSince, null);
  assert.equal(waiting.turnUsage, null);
  assert.equal(waiting.lastUserMessageAt, null);
  assert.equal(JSON.stringify(waiting).includes("PRIVATE"), false);
  const answered = sshSessionThread(
    target,
    conversation({
      ...state,
      turns: [
        turn,
        {
          id: "reply",
          status: "inProgress",
          items: [
            { type: "userMessage", content: [{ text: "Fixture reply" }] },
          ],
        },
      ],
    }),
  );
  assert.equal(answered.pendingUserInput, false);
  assert.equal(answered.waitingQuestion, null);
  const failed = sshSessionThread(
    target,
    conversation({ ...state, turns: [{ ...turn, status: "failed" }] }),
  );
  assert.equal(columnFor(failed), "error");
  assert.equal(failed.pendingUserInput, false);
  assert.equal(failed.waitingQuestion, null);
  assert.ok(failed.error);
  const malformed = sshSessionThread(
    target,
    conversation({ ...state, turns: [{ ...turn, items: {} }] }),
  );
  assert.equal(malformed.waitingQuestion, null);
  const lost = sshSessionThread(target);
  assert.equal(lost.pendingUserInput, false);
  assert.equal(lost.waitingQuestion, null);
  assert.equal(lost.error, null);
  assert.equal(lost.runtime, null);
});

test("SSH actions require explicit registered pairs and never opt in implicitly", async () => {
  const { sshActionTargets } = await import("../server/ssh-sessions");
  assert.deepEqual(sshActionTargets(undefined, [target]), []);
  assert.deepEqual(sshActionTargets(JSON.stringify([target]), [target]), [
    target,
  ]);
  assert.throws(() => sshActionTargets(JSON.stringify([target]), []), /subset/);
  assert.throws(
    () =>
      sshActionTargets(JSON.stringify([{ ...target, hostId: "another" }]), [
        target,
      ]),
    /subset/,
  );
});
