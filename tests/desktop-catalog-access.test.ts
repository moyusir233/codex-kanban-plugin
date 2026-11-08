import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DesktopCatalogAccess } from "../server/desktop-catalog-access";
import type { DesktopCatalogPage } from "../shared/desktop-catalog";
import { cachedSnapshot } from "../ui/snapshot-cache";

const caller = "c0000000-0000-4000-8000-000000000001",
  host = "ssh-fixture";
const meta = {
  "x-codex-turn-metadata": { thread_id: caller, turn_id: "synthetic-turn" },
  "openai/toolCallId": "synthetic-call",
};
const base = {
  grantId: "e0000000-0000-4000-8000-000000000001",
  hosts: [host],
  localCallers: [caller],
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  maxReads: 1,
  pageSize: 10,
};
function page(): DesktopCatalogPage {
  return {
    source: "desktop-native:list_threads/history",
    hostId: host,
    sessions: [
      {
        id: "d0000000-0000-4000-8000-000000000001",
        hostId: host,
        title: "token=synthetic-private-credential",
        cwd: "/remote/only",
        listedState: "idle",
        updatedAtSeconds: 123,
      },
    ],
    nextCursor: null,
    runtimeFreshness: "not-established",
    transport: { connections: 1, rpcRequests: 2, cancelRequests: 0 },
  };
}

test("native directory grants are caller-bound, expire, reject wildcard scope and expose no private configuration", async () => {
  const home = await mkdtemp(join(tmpdir(), "catalog-access-"));
  let reads = 0;
  const reader = {
    read: async () => {
      reads++;
      return page();
    },
  };
  try {
    const access = new DesktopCatalogAccess(JSON.stringify(base), home, reader);
    assert.equal(access.info({}), undefined);
    assert.equal(access.info({ ...meta, hostId: "ssh-other" }), undefined);
    const info = access.info(meta)!;
    assert.deepEqual(info.hosts, [host]);
    assert.equal(info.expired, false);
    assert.ok(!JSON.stringify(info).includes(caller));
    for (const bad of [
      { ...base, hosts: ["*"] },
      { ...base, hosts: ["local"] },
      { ...base, localCallers: ["*"] },
      { ...base, expiresAt: new Date(Date.now() + 48 * 3600000).toISOString() },
      { ...base, unknown: true },
    ])
      assert.throws(
        () => new DesktopCatalogAccess(JSON.stringify(bad), home, reader),
      );
    for (const [metadata, input] of [
      [{}, { hostId: host }],
      [meta, { hostId: "other" }],
      [meta, { hostId: host, limit: 11 }],
      [meta, { hostId: host, cursor: { hostId: "other", value: "x" } }],
    ] as const)
      await assert.rejects(access.read(metadata, input));
    const expired = new DesktopCatalogAccess(
      JSON.stringify({
        ...base,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
      home,
      reader,
    );
    await assert.rejects(expired.read(meta, { hostId: host }), /grant-expired/);
    assert.equal(reads, 0);
    assert.deepEqual(await readdir(home), []);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("directory budget and duplicate-call markers persist across restarts; no implicit retries or data cache", async () => {
  const home = await mkdtemp(join(tmpdir(), "catalog-access-"));
  let reads = 0;
  const reader = {
    read: async () => {
      reads++;
      return page();
    },
  };
  try {
    const value = JSON.stringify(base);
    const access = new DesktopCatalogAccess(value, home, reader);
    const result = await access.read(meta, { hostId: host });
    assert.ok(
      !result.sessions[0].title!.includes("synthetic-private-credential"),
    );
    await assert.rejects(
      new DesktopCatalogAccess(value, home, reader).read(meta, {
        hostId: host,
      }),
      /duplicate-call/,
    );
    await assert.rejects(
      new DesktopCatalogAccess(value, home, reader).read(
        { ...meta, "openai/toolCallId": "new-call" },
        { hostId: host },
      ),
      /read-budget-exhausted/,
    );
    assert.equal(reads, 1);
    const entries = await readdir(
      join(home, "kanban", "desktop-catalog-grants", base.grantId),
    );
    assert.equal(entries.filter((name) => name.startsWith("read-")).length, 1);
    assert.ok(entries.every((name) => !name.includes(caller)));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("failed directory reads consume grants and caller capability never revives from snapshot cache", async () => {
  const home = await mkdtemp(join(tmpdir(), "catalog-access-"));
  let reads = 0;
  try {
    const access = new DesktopCatalogAccess(JSON.stringify(base), home, {
      read: async () => {
        reads++;
        throw new Error("synthetic-failure");
      },
    });
    await assert.rejects(access.read(meta, { hostId: host }));
    await assert.rejects(
      access.read(
        { ...meta, "openai/toolCallId": "next-call" },
        { hostId: host },
      ),
      /read-budget-exhausted/,
    );
    assert.equal(reads, 1);
    const cached = cachedSnapshot({
      schemaVersion: 1,
      generatedAt: "",
      threads: [],
      connection: {
        state: "connected",
        endpoint: "ipc://synthetic",
        since: null,
        message: null,
      },
      sources: {
        metadata: true,
        unread: false,
        unreadReason: "",
        metadataError: null,
        unreadOptions: [],
        unreadSelection: null,
        desktopCatalog: access.info(meta),
      },
    });
    assert.equal(cached.sources.desktopCatalog, undefined);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
