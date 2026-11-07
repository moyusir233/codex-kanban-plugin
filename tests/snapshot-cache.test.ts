import assert from "node:assert/strict";
import { test } from "node:test";
import { columnFor, needsAttention, type Snapshot } from "../shared/types";
import { matchesFilters, matchesQuery } from "../ui/board-filters";
import { sshSessionThread } from "../server/ssh-sessions";
import {
  cachedSnapshot,
  clearSnapshotCache,
  readSnapshotCache,
  reconcileSnapshot,
  SNAPSHOT_CACHE_KEY,
  writeSnapshotCache,
} from "../ui/snapshot-cache";

/** 模拟宿主重新创建页面后仍可访问的存储，不触碰用户浏览器数据。 */
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

function snapshot(): Snapshot {
  return {
    schemaVersion: 1,
    generatedAt: "2026-10-30T08:00:00.000Z",
    syncingThreads: false,
    connection: {
      state: "connected",
      endpoint: "ipc:///desktop.sock",
      since: "2026-10-30T07:00:00.000Z",
      message: null,
    },
    sources: {
      metadata: true,
      unread: true,
      unreadReason: "客户端记录",
      metadataError: null,
      unreadOptions: [],
      unreadSelection: null,
    },
    threads: [
      {
        id: "conversation",
        title: "现有对话",
        cwd: "/workspace",
        project: "workspace",
        kind: "user",
        updatedAt: "2026-10-30T08:00:00.000Z",
        lastUserMessageAt: "2026-10-30T07:59:00.000Z",
        model: "model",
        reasoningEffort: "high",
        collaborationMode: "plan",
        goalStatus: "active",
        turnUsage: null,
        unread: true,
        runtime: { type: "active", activeFlags: ["waitingOnApproval"] },
        runtimeAt: "2026-10-30T08:00:00.000Z",
        fresh: true,
        error: null,
        pendingUserInput: true,
        waitingQuestion: "PRIVATE_QUESTION",
        waitingSince: "2026-10-30T08:00:00.000Z",
      },
    ],
    confirmations: {
      available: true,
      requests: [
        {
          id: "request",
          threadId: "conversation",
          kind: "command",
          reason: "PRIVATE_REASON",
          command: "PRIVATE_COMMAND",
          cwd: null,
          details: "PRIVATE_DIFF",
          decisions: ["accept"],
          questions: [],
        },
      ],
    },
  };
}

test("a recreated view restores its last successful list as stale without confirmation content", () => {
  const storage = memoryStorage();
  const original = snapshot();
  writeSnapshotCache(storage, original, null);
  const restored = readSnapshotCache({ getItem: storage.getItem }, null)!;
  assert.equal(restored.threads[0].title, "现有对话");
  assert.deepEqual(restored.threads[0].runtime, original.threads[0].runtime);
  assert.equal(restored.threads[0].fresh, false);
  assert.equal(restored.threads[0].cachedColumn, "waiting");
  assert.equal(restored.cached, true);
  assert.equal(restored.threads[0].pendingUserInput, false);
  assert.equal(restored.threads[0].waitingQuestion, null);
  assert.equal(restored.threads[0].waitingSince, null);
  assert.deepEqual(restored.confirmations, { available: false, requests: [] });
  assert.equal(restored.connection.state, "connecting");
  assert.equal(restored.connection.since, null);
  assert.equal(original.threads[0].fresh, true);
  assert.equal(original.confirmations?.requests.length, 1);
  assert.doesNotMatch(storage.getItem(SNAPSHOT_CACHE_KEY)!, /PRIVATE_/);
});

test("temporary empty or unavailable metadata cannot overwrite the successful list", () => {
  const storage = memoryStorage();
  const original = snapshot();
  writeSnapshotCache(storage, original, null);
  writeSnapshotCache(storage, { ...original, threads: [] }, null);
  writeSnapshotCache(
    storage,
    { ...original, sources: { ...original.sources, metadata: false } },
    null,
  );
  assert.equal(readSnapshotCache(storage, null)?.threads[0].title, "现有对话");
  const next = snapshot();
  next.threads[0].title = "最新列表";
  writeSnapshotCache(storage, next, null);
  assert.equal(readSnapshotCache(storage, null)?.threads[0].title, "最新列表");
});

test("cached data only restores for its explicitly selected unread source", () => {
  const storage = memoryStorage();
  writeSnapshotCache(storage, snapshot(), "source-a");
  assert.equal(readSnapshotCache(storage, null), null);
  assert.equal(readSnapshotCache(storage, "source-b"), null);
  assert.equal(readSnapshotCache(storage, "source-a")?.threads.length, 1);
  writeSnapshotCache(storage, snapshot(), "source-b");
  assert.equal(readSnapshotCache(storage, "source-a"), null);
  assert.equal(readSnapshotCache(storage, "source-b")?.threads.length, 1);
});

test("corrupt storage and unusable cache shapes fall back to normal loading", () => {
  const storage = memoryStorage();
  for (const value of [
    "{broken",
    "null",
    '"old-value"',
    JSON.stringify({
      selection: null,
      snapshot: {
        schemaVersion: 1,
        threads: [{}],
        sources: {},
        connection: {},
      },
    }),
  ]) {
    storage.setItem(SNAPSHOT_CACHE_KEY, value);
    assert.equal(readSnapshotCache(storage, null), null);
  }
  assert.equal(
    readSnapshotCache(
      {
        getItem() {
          throw new Error("Blocked storage");
        },
      },
      null,
    ),
    null,
  );
  assert.doesNotThrow(() =>
    writeSnapshotCache(
      {
        setItem() {
          throw new Error("Quota exceeded");
        },
      },
      snapshot(),
      null,
    ),
  );
});

test("stale conversion clears pending actions without modifying the live snapshot", () => {
  const original = snapshot();
  const stale = cachedSnapshot(original);
  assert.notEqual(stale, original);
  assert.notEqual(stale.threads[0], original.threads[0]);
  assert.equal(original.connection.state, "connected");
  assert.equal(original.threads[0].waitingQuestion, "PRIVATE_QUESTION");
  assert.equal(stale.syncingThreads, false);
  assert.equal(stale.connection.message, null);
});

test("restored waiting columns are not presented as current requests for attention", () => {
  const storage = memoryStorage();
  const original = snapshot();
  original.threads[0].unread = false;
  original.threads[0].runtime = { type: "idle" };
  assert.equal(columnFor(original.threads[0]), "waiting");
  writeSnapshotCache(storage, original, null);

  const restored = readSnapshotCache(storage, null)!;
  for (const cached of [cachedSnapshot(original), restored]) {
    const thread = cached.threads[0];
    assert.equal(thread.pendingUserInput, false);
    assert.equal(thread.waitingQuestion, null);
    assert.equal(columnFor(thread), "unknown");
    assert.equal(needsAttention(thread), false);
    assert.equal(matchesFilters(thread, { state: ["waiting"] }), false);
    assert.deepEqual(cached.confirmations?.requests, []);
  }
});

test("a connected transport cannot revive cached waiting before that thread becomes fresh", () => {
  const previous = snapshot();
  previous.threads[0].unread = false;
  previous.threads[0].runtime = { type: "idle" };
  let shown = cachedSnapshot(previous);
  const next = snapshot();
  next.threads[0] = {
    ...next.threads[0],
    unread: false,
    fresh: false,
    runtime: null,
    runtimeAt: null,
    pendingUserInput: false,
    waitingQuestion: null,
    waitingSince: null,
  };
  next.confirmations = { available: false, requests: [] };

  // 全局连接成功不能证明某条对话仍在等待，连续轮询也不能恢复旧请求。
  for (let poll = 0; poll < 3; poll++) {
    shown = reconcileSnapshot(shown, next);
    assert.equal(shown.connection.state, "connected");
    assert.equal(shown.threads[0].fresh, false);
    assert.equal(shown.threads[0].pendingUserInput, false);
    assert.equal(columnFor(shown.threads[0]), "unknown");
    assert.equal(needsAttention(shown.threads[0]), false);
    assert.deepEqual(shown.confirmations?.requests, []);
  }

  const waiting = {
    ...next,
    threads: [
      {
        ...previous.threads[0],
        fresh: true,
      },
    ],
  };
  shown = reconcileSnapshot(shown, waiting);
  assert.equal(columnFor(shown.threads[0]), "waiting");
  assert.equal(needsAttention(shown.threads[0]), true);
  assert.equal(shown.threads[0].cachedColumn, undefined);

  shown = reconcileSnapshot(shown, {
    ...next,
    threads: [{ ...next.threads[0], fresh: true, runtime: { type: "idle" } }],
  });
  assert.equal(columnFor(shown.threads[0]), "idle");
  assert.equal(needsAttention(shown.threads[0]), false);
  assert.equal(shown.threads[0].cachedColumn, undefined);
});

test("an authoritative empty directory can explicitly clear the previous cached list", () => {
  const storage = memoryStorage();
  writeSnapshotCache(storage, snapshot(), null);
  clearSnapshotCache(storage);
  assert.equal(readSnapshotCache(storage, null), null);
  assert.doesNotThrow(() =>
    clearSnapshotCache({
      removeItem() {
        throw new Error("Blocked storage");
      },
    }),
  );
});

test("returning to a running filter retains the known column while its live subscription reconnects", () => {
  const previous = snapshot();
  previous.threads[0].runtime = { type: "active", activeFlags: [] };
  previous.threads[0].pendingUserInput = false;
  const next = snapshot();
  next.threads[0] = {
    ...next.threads[0],
    title: "更新后的标题",
    fresh: false,
    runtime: null,
    runtimeAt: null,
  };
  next.syncingThreads = true;
  const merged = reconcileSnapshot(previous, next);
  assert.equal(merged.cached, true);
  assert.equal(merged.threads[0].cachedColumn, "running");
  assert.equal(matchesFilters(merged.threads[0], { state: ["running"] }), true);
  assert.equal(merged.threads[0].fresh, false);
  assert.equal(merged.threads[0].title, "更新后的标题");
  assert.deepEqual(merged.threads[0].runtime, previous.threads[0].runtime);
  assert.equal(merged.threads[0].runtimeAt, previous.threads[0].runtimeAt);
  assert.equal(merged.syncingThreads, false);
  assert.equal(merged.connection, next.connection);
  assert.deepEqual(merged.confirmations?.requests, []);
});

test("fresh states and explicit unloaded states replace their corresponding cached columns", () => {
  const previous = cachedSnapshot(snapshot());
  const next = snapshot();
  next.threads[0] = {
    ...next.threads[0],
    runtime: { type: "idle" },
    pendingUserInput: false,
  };
  const fresh = reconcileSnapshot(previous, next);
  assert.equal(fresh.cached, false);
  assert.equal(fresh.threads[0].cachedColumn, undefined);
  assert.equal(fresh.threads[0].fresh, true);
  assert.equal(fresh.threads[0].runtime?.type, "idle");
  assert.equal(fresh.confirmations?.requests.length, 1);
  next.threads[0] = {
    ...next.threads[0],
    runtime: { type: "notLoaded" },
    fresh: false,
  };
  const unloaded = reconcileSnapshot(previous, next);
  assert.equal(unloaded.cached, false);
  assert.equal(unloaded.threads[0].cachedColumn, undefined);
  assert.equal(unloaded.threads[0].runtime?.type, "notLoaded");
  assert.deepEqual(unloaded.confirmations?.requests, []);
});

test("metadata failure keeps the previous list and source error but a successful empty directory clears it", () => {
  const previous = snapshot();
  const unavailable = snapshot();
  unavailable.threads = [];
  unavailable.sources = {
    ...unavailable.sources,
    metadata: false,
    metadataError: "目录暂不可读",
  };
  const fallback = reconcileSnapshot(previous, unavailable);
  assert.equal(fallback.threads.length, 1);
  assert.equal(fallback.cached, true);
  assert.equal(fallback.sources.metadataError, "目录暂不可读");
  assert.deepEqual(fallback.confirmations, { available: false, requests: [] });
  const empty = {
    ...unavailable,
    sources: { ...unavailable.sources, metadata: true },
  };
  assert.equal(reconcileSnapshot(previous, empty), empty);
  assert.equal(reconcileSnapshot(null, unavailable), unavailable);
});

test("reconciliation uses conversation identity and never labels previously unknown threads as cached", () => {
  const previous = snapshot();
  previous.threads[0] = { ...previous.threads[0], fresh: false, runtime: null };
  const next = snapshot();
  next.threads[0] = { ...next.threads[0], fresh: false, runtime: null };
  assert.equal(
    reconcileSnapshot(previous, next).threads[0].cachedColumn,
    undefined,
  );
  const old = cachedSnapshot(snapshot());
  next.threads[0] = { ...next.threads[0], id: "different-conversation" };
  assert.equal(reconcileSnapshot(old, next).threads[0].cachedColumn, undefined);
});

test("reconciliation retains only newly verified confirmation requests, never the cached pending action", () => {
  const previous = cachedSnapshot(snapshot());
  const next = snapshot();
  const second = { ...next.threads[0], id: "second", fresh: false };
  next.threads.push(second);
  next.confirmations!.requests.push({
    ...next.confirmations!.requests[0],
    id: "second-request",
    threadId: "second",
  });
  const merged = reconcileSnapshot(previous, next);
  assert.deepEqual(
    merged.confirmations!.requests.map((request) => request.id),
    ["request"],
  );
  next.confirmations = undefined;
  assert.equal(reconcileSnapshot(previous, next).confirmations, undefined);
});

test("equal IDs on local and SSH hosts never share cached runtime or confirmations", () => {
  const previous = snapshot();
  previous.threads[0].runtime = { type: "active" };
  const next = snapshot();
  next.threads[0] = {
    ...next.threads[0],
    hostId: "fixture-ssh",
    fresh: false,
    runtime: null,
    pendingUserInput: false,
  };
  const merged = reconcileSnapshot(previous, next);
  assert.equal(merged.threads[0].runtime, null);
  assert.equal(columnFor(merged.threads[0]), "unknown");
  assert.deepEqual(merged.confirmations?.requests, []);
  next.threads[0].fresh = true;
  next.threads[0].runtime = { type: "active" };
  assert.equal(columnFor(cachedSnapshot(next).threads[0]), "unknown");
});

test("local metadata failure retains cached local cards without masking a fresh SSH card", () => {
  const previous = snapshot();
  const next = snapshot();
  next.sources.metadata = false;
  next.threads[0] = {
    ...next.threads[0],
    hostId: "fixture-ssh",
    runtime: { type: "idle" },
    pendingUserInput: false,
  };
  const merged = reconcileSnapshot(previous, next);
  assert.equal(merged.threads.length, 2);
  assert.equal(merged.threads[0].hostId, undefined);
  assert.equal(merged.threads[0].fresh, false);
  assert.equal(merged.threads[1].hostId, "fixture-ssh");
  assert.equal(merged.threads[1].fresh, true);
  assert.equal(columnFor(merged.threads[1]), "idle");
});

for (const metadata of [true, false]) {
  test(
    "SSH display metadata survives repeated snapshot loss and filters; local metadata=" +
      metadata,
    () => {
      const target = {
        hostId: "fixture-ssh",
        threadId: "00000000-0000-4000-8000-000000000001",
      };
      const live = sshSessionThread(target, {
        revision: 1,
        ownerClientId: "fixture",
        state: {
          title: "Release fixture",
          cwd: "/remote/release",
          threadRuntimeStatus: {
            type: "active",
            activeFlags: ["waitingOnApproval"],
          },
          hasUnreadTurn: true,
        },
      });
      const previous = snapshot();
      previous.threads = [live];
      const next = snapshot();
      next.sources.metadata = metadata;
      next.threads = [sshSessionThread(target)];
      let merged = reconcileSnapshot(previous, next);
      for (let i = 0; i < 3; i++) {
        const thread = merged.threads[0];
        assert.equal(thread.title, live.title);
        assert.equal(thread.cwd, live.cwd);
        assert.equal(thread.project, live.project);
        assert.equal(thread.fresh, false);
        assert.equal(thread.runtime, null);
        assert.equal(thread.runtimeAt, null);
        assert.equal(thread.unread, null);
        assert.equal(thread.pendingUserInput, false);
        assert.equal(columnFor(thread), "unknown");
        assert.deepEqual(merged.confirmations?.requests, []);
        assert.ok(matchesFilters(thread, { project: [live.project] }));
        assert.ok(matchesQuery(thread, "Release fixture"));
        merged = reconcileSnapshot(merged, next);
      }
      const restored = snapshot();
      restored.threads = [
        {
          ...live,
          title: "Updated release",
          cwd: "/remote/new",
          project: "fixture-ssh · /remote/new",
          runtime: { type: "idle" },
        },
      ];
      const fresh = reconcileSnapshot(merged, restored).threads[0];
      assert.equal(fresh.title, "Updated release");
      assert.equal(fresh.cwd, "/remote/new");
      assert.equal(columnFor(fresh), "idle");
      // Same thread ID on another host must never inherit the old title/project.
      next.threads = [
        sshSessionThread({ ...target, hostId: "different-host" }),
      ];
      assert.notEqual(
        reconcileSnapshot(previous, next).threads[0].title,
        live.title,
      );
      next.threads = [];
      next.sources.metadata = true;
      assert.deepEqual(reconcileSnapshot(previous, next).threads, []);
      const cached = cachedSnapshot(previous);
      assert.equal(cached.threads[0].runtime, null);
      assert.deepEqual(cached.confirmations, {
        available: false,
        requests: [],
      });
    },
  );
}

test("observed remote subagents stay excluded while their snapshots are unavailable", () => {
  const target = {
    hostId: "fixture-ssh",
    threadId: "00000000-0000-4000-8000-000000000001",
  };
  const previous = snapshot();
  previous.threads = [
    sshSessionThread(target, {
      revision: 1,
      ownerClientId: "fixture",
      state: { source: { subAgent: { parentThreadId: "parent" } } },
    }),
  ];
  const next = snapshot();
  next.threads = [sshSessionThread(target)];
  assert.equal(
    matchesFilters(reconcileSnapshot(previous, next).threads[0], {}),
    false,
  );
});

test("remote confirmation capabilities are host-scoped, cleared on disconnect/cache and restored only explicitly", () => {
  const live = snapshot();
  const thread = live.threads[0];
  live.threads = [
    thread,
    { ...thread, hostId: "box-a", remoteActionsEnabled: true },
    { ...thread, hostId: "box-b", remoteActionsEnabled: false },
  ];
  const request = live.confirmations!.requests[0];
  live.confirmations!.requests = [
    request,
    { ...request, id: "a", hostId: "box-a" },
    { ...request, id: "b", hostId: "box-b" },
  ];
  assert.deepEqual(
    reconcileSnapshot(snapshot(), live).confirmations!.requests.map(
      (r) => r.id,
    ),
    [request.id, "a"],
  );
  const lost = structuredClone(live);
  lost.threads[1].fresh = false;
  const merged = reconcileSnapshot(live, lost);
  assert.equal(merged.threads[1].remoteActionsEnabled, false);
  assert.deepEqual(
    merged.confirmations!.requests.map((r) => r.id),
    [request.id],
  );
  assert.equal(cachedSnapshot(live).threads[1].remoteActionsEnabled, false);
  assert.deepEqual(cachedSnapshot(live).confirmations?.requests, []);
  assert.equal(
    reconcileSnapshot(merged, live).threads[1].remoteActionsEnabled,
    true,
  );
});
