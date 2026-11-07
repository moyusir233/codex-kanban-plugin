import assert from "node:assert/strict";
import { test } from "node:test";
import { sshSnapshotGitInfo } from "../server/ssh-git-info";
import { sshSessionThread } from "../server/ssh-sessions";
import { cachedSnapshot, reconcileSnapshot } from "../ui/snapshot-cache";
import type { Snapshot } from "../shared/types";

const sha = "a".repeat(40);
const target = {
  hostId: "fixture-git-host",
  threadId: "00000000-0000-4000-8000-000000000001",
};
const conversation = (state: any) => ({
  ownerClientId: "fixture",
  revision: 1,
  state,
});

test("snapshot Git info preserves explicit bounded metadata, never origin/path/current worktree claims", () => {
  const input = {
    branch: "fixture/release",
    sha,
    originUrl: "ssh://PRIVATE_CREDENTIAL@private-host/repo",
    isWorktree: true,
    cwd: "/PRIVATE_NOT_LOCAL",
    future: { secret: "PRIVATE" },
  };
  assert.deepEqual(sshSnapshotGitInfo(input), { branch: input.branch, sha });
  assert.deepEqual(sshSnapshotGitInfo({ branch: "feature/中文" }), {
    branch: "feature/中文",
    sha: null,
  });
  assert.deepEqual(sshSnapshotGitInfo({ branch: null, sha }), {
    branch: null,
    sha,
  });
  assert.deepEqual(sshSnapshotGitInfo({ sha: "B".repeat(64) }), {
    branch: null,
    sha: "B".repeat(64),
  });
  assert.equal(input.isWorktree, true);
  assert.doesNotMatch(
    JSON.stringify(sshSnapshotGitInfo(input)),
    /PRIVATE|origin|cwd|Worktree/,
  );
});

test("missing, malformed and unknown Git metadata remain unavailable without guessing detached HEAD", () => {
  for (const input of [
    undefined,
    null,
    {},
    [],
    "main",
    { originUrl: "https://fixture.invalid/repo" },
    { branch: null, sha: null },
    { branch: "" },
    { branch: "x".repeat(1025) },
    { branch: ["main"] },
    { branch: {} },
    { branch: "main\nprivate" },
    { branch: "main\u0000private" },
    { branch: "main\u2028private" },
    { branch: "main\u0085private" },
    { sha: "short" },
    { sha: "g".repeat(40) },
    { sha: 123 },
    { branch: "main", sha: "future-sha" },
  ])
    assert.equal(sshSnapshotGitInfo(input), null, JSON.stringify(input));
});

test("remote mapper exposes snapshot metadata only on loaded ordinary snapshots; local Git stays null", () => {
  const state = {
    gitInfo: { branch: "fixture/release", sha, originUrl: "PRIVATE" },
    threadRuntimeStatus: { type: "active" },
  };
  for (const type of ["active", "idle"]) {
    const mapped = sshSessionThread(
      target,
      conversation({
        ...state,
        threadRuntimeStatus: { type },
      }),
    );
    assert.deepEqual(mapped.snapshotGit, { branch: "fixture/release", sha });
    assert.equal(mapped.git, null);
    assert.equal(mapped.cwd, "");
    assert.doesNotMatch(JSON.stringify(mapped), /PRIVATE|originUrl|isWorktree/);
  }
  for (const type of [undefined, "notLoaded", "systemError", "future"])
    assert.equal(
      sshSessionThread(
        target,
        conversation({
          ...state,
          threadRuntimeStatus: { type },
        }),
      ).snapshotGit,
      null,
    );
  assert.equal(sshSessionThread(target).snapshotGit, null);
  assert.equal(
    sshSessionThread(
      target,
      conversation({
        ...state,
        source: { subAgent: { parentThreadId: target.threadId } },
      }),
    ).snapshotGit,
    null,
  );
});

test("cache/disconnect clears SSH Git metadata on both same-ID hosts; replacement never borrows local metadata", () => {
  const live = sshSessionThread(
    target,
    conversation({
      gitInfo: { branch: "fixture/main", sha },
      threadRuntimeStatus: { type: "idle" },
    }),
  );
  const other = {
    ...live,
    hostId: "fixture-other",
    snapshotGit: { branch: "fixture/other", sha: null },
  };
  const local = {
    ...live,
    hostId: undefined,
    snapshotGit: undefined,
    git: { branch: "local/main", isWorktree: true },
  };
  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    threads: [local, live, other],
    sources: { metadata: true },
    connection: {
      state: "connected",
      endpoint: "fixture",
      since: null,
      message: null,
    },
  } as Snapshot;
  const cached = cachedSnapshot(snapshot);
  assert.deepEqual(cached.threads[0].git, local.git);
  assert.equal(cached.threads[1].snapshotGit, null);
  assert.equal(cached.threads[2].snapshotGit, null);
  const lost = reconcileSnapshot(snapshot, {
    ...snapshot,
    threads: [local, sshSessionThread(target), { ...other, fresh: false }],
  });
  assert.equal(lost.threads[1].snapshotGit, null);
  assert.equal(lost.threads[2].snapshotGit, null);
  assert.deepEqual(lost.threads[0].git, local.git);
  const replacement = reconcileSnapshot(lost, {
    ...snapshot,
    threads: [
      local,
      { ...live, snapshotGit: { branch: null, sha } },
      { ...other, snapshotGit: null },
    ],
  });
  assert.deepEqual(replacement.threads[1].snapshotGit, { branch: null, sha });
  assert.equal(replacement.threads[2].snapshotGit, null);
  assert.equal(live.snapshotGit?.branch, "fixture/main");
});
