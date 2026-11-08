import assert from "node:assert/strict";
import { test } from "node:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DesktopHostCatalog,
  DesktopCatalogError,
} from "../server/desktop-host-catalog";

const caller = "c0000000-0000-4000-8000-000000000001";
const thread = "d0000000-0000-4000-8000-000000000001";
const host = "ssh-fixture-a";
const meta = {
  "x-codex-turn-metadata": { thread_id: caller, turn_id: "synthetic-turn" },
  "openai/toolCallId": "synthetic-call",
};
const tool = {
  name: "list_threads",
  namespace: "codex_app",
  inputSchema: {
    type: "object",
    properties: {
      mode: {},
      source: {},
      hostId: {},
      archived: {},
      cursor: {},
      limit: {},
    },
    required: [],
  },
};
type Mode =
  | "ok"
  | "host-mismatch"
  | "duplicate"
  | "tool-unavailable"
  | "not-connected"
  | "hang"
  | "bad-body";
async function fixture(mode: Mode = "ok") {
  const home = await mkdtemp(join(tmpdir(), "host-catalog-"));
  const pipe = join(home, "native.sock");
  const requests: any[] = [];
  const sockets = new Set<Socket>();
  let connections = 0;
  let cancelled!: () => void;
  const cancellation = new Promise<void>((resolve) => {
    cancelled = resolve;
  });
  const native = createServer((socket) => {
    connections++;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    let buffer = Buffer.alloc(0);
    const send = (id: unknown, result: unknown) => {
      const body = Buffer.from(JSON.stringify({ id, jsonrpc: "2.0", result }));
      const h = Buffer.alloc(4);
      h.writeUInt32LE(body.length);
      socket.write(h.subarray(0, 2));
      socket.write(Buffer.concat([h.subarray(2), body]));
    };
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4 && buffer.length >= 4 + buffer.readUInt32LE()) {
        const size = buffer.readUInt32LE();
        const request = JSON.parse(buffer.subarray(4, 4 + size).toString());
        buffer = buffer.subarray(4 + size);
        requests.push(request);
        if (request.method === "tools/list")
          send(request.id, {
            tools: mode === "tool-unavailable" ? [] : [tool],
          });
        else if (request.method === "tools/cancel") {
          cancelled();
          socket.end();
        } else if (request.method === "tools/call") {
          if (mode === "hang") continue;
          if (mode === "not-connected") {
            send(request.id, {
              success: false,
              contentItems: [
                {
                  type: "inputText",
                  text: `No connected Codex thread host found for hostId: ${host}`,
                },
              ],
            });
            continue;
          }
          if (mode === "bad-body") {
            send(request.id, {
              success: true,
              contentItems: [
                { type: "inputText", text: '{"synthetic-secret-body":' },
              ],
            });
            continue;
          }
          const row = {
            id: thread,
            hostId: mode === "host-mismatch" ? "ssh-fixture-b" : host,
            kind: "codex",
            title: "Synthetic title",
            cwd: "/remote/not/a/local/checkout",
            status: "idle",
            updatedAt: 123,
            projectId: "synthetic-private-other-host-project",
            summary: "synthetic-private-summary",
            unexpected: "synthetic-private-extra",
          };
          send(request.id, {
            success: true,
            contentItems: [
              {
                type: "inputText",
                text: JSON.stringify({
                  threads: mode === "duplicate" ? [row, row] : [row],
                  nextCursor: "synthetic-next-cursor",
                }),
              },
            ],
          });
        }
      }
    });
  });
  await new Promise<void>((ok, fail) => {
    native.once("error", fail);
    native.listen(pipe, ok);
  });
  await chmod(pipe, 0o600);
  const options = {
    allowedHosts: [host, "ssh-fixture-b"],
    allowedLocalCallers: [caller],
    pipePath: pipe,
    desktopRuntime: process.execPath,
    verifyProtocol: async () => true,
  };
  return {
    home,
    pipe,
    options,
    requests,
    cancellation,
    connections: () => connections,
    async cleanup() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((ok) => native.close(() => ok()));
      await rm(home, { recursive: true, force: true });
    },
  };
}

test("host catalog routes executor metadata to one exact history host and drops unrelated annotations/body", async () => {
  const f = await fixture();
  try {
    const catalog = new DesktopHostCatalog(f.options);
    const page = await catalog.read(meta, { hostId: host, limit: 10 });
    assert.deepEqual(
      f.requests.map((request) => request.method),
      ["tools/list", "tools/call"],
    );
    const call = f.requests[1].params;
    assert.equal(call.callerSource, "codex");
    assert.equal(call.hostId, "local");
    assert.equal(call.threadId, caller);
    assert.equal(call.turnId, "synthetic-turn");
    assert.equal(call.callId, "synthetic-call");
    assert.equal(call.namespace, "codex_app");
    assert.equal(call.tool, "list_threads");
    assert.deepEqual(call.arguments, {
      mode: "history",
      source: "codex",
      hostId: host,
      archived: false,
      limit: 10,
    });
    assert.equal(page.sessions[0].hostId, host);
    assert.equal(page.sessions[0].id, thread);
    assert.equal(page.sessions[0].cwd, "/remote/not/a/local/checkout");
    assert.equal(page.sessions[0].listedState, "idle");
    assert.equal(page.sessions[0].updatedAtSeconds, 123);
    assert.equal(page.runtimeFreshness, "not-established");
    assert.deepEqual(page.nextCursor, {
      hostId: host,
      value: "synthetic-next-cursor",
    });
    for (const hidden of [
      "synthetic-private-other-host-project",
      "synthetic-private-summary",
      "synthetic-private-extra",
      caller,
      "synthetic-turn",
      "synthetic-call",
    ])
      assert.ok(!JSON.stringify(page).includes(hidden));
    await assert.rejects(
      catalog.read(meta, { hostId: "ssh-fixture-b", limit: 10 }),
      (error) =>
        error instanceof DesktopCatalogError &&
        error.code === "duplicate-invocation",
    );
    assert.equal(f.connections(), 1);
  } finally {
    await f.cleanup();
  }
});

test("host/cursor/caller/protocol admission rejects before any native request", async () => {
  const f = await fixture();
  try {
    for (const [metadata, input] of [
      [meta, { hostId: "not-authorized", limit: 10 }],
      [
        meta,
        {
          hostId: host,
          limit: 10,
          cursor: { hostId: "ssh-fixture-b", value: "cursor" },
        },
      ],
      [{}, { hostId: host, limit: 10 }],
      [
        { ...meta, hostId: "ssh-fixture-b" },
        { hostId: host, limit: 10 },
      ],
      [{ threadId: caller }, { hostId: host, limit: 10 }],
      [
        { ...meta, threadId: thread },
        { hostId: host, limit: 10 },
      ],
      [meta, { hostId: host, limit: 51 }],
      [meta, { hostId: host, limit: 10, method: "read_thread" }],
    ] as const)
      await assert.rejects(
        new DesktopHostCatalog(f.options).read(metadata, input),
        DesktopCatalogError,
      );
    await assert.rejects(
      new DesktopHostCatalog({
        ...f.options,
        verifyProtocol: async () => false,
      }).read(meta, { hostId: host, limit: 10 }),
      (error) =>
        error instanceof DesktopCatalogError &&
        error.code === "desktop-protocol-unverified",
    );
    assert.equal(f.connections(), 0);
    assert.equal(f.requests.length, 0);
  } finally {
    await f.cleanup();
  }
});

test("host mismatch, duplicate identity, unavailable method and malformed native result never fall back", async () => {
  for (const mode of [
    "host-mismatch",
    "duplicate",
    "tool-unavailable",
    "bad-body",
    "not-connected",
  ] as const) {
    const f = await fixture(mode);
    try {
      await assert.rejects(
        new DesktopHostCatalog(f.options).read(meta, {
          hostId: host,
          limit: 10,
        }),
        (error) => {
          assert.ok(error instanceof DesktopCatalogError);
          assert.ok(!String(error).includes("synthetic-secret-body"));
          if (mode === "not-connected")
            assert.equal(error.code, "target-host-not-connected");
          return true;
        },
      );
      assert.ok(f.requests.length <= 2);
      assert.ok(
        f.requests.every(
          (request) =>
            request.method === "tools/list" ||
            (request.method === "tools/call" &&
              request.params.tool === "list_threads" &&
              request.params.arguments.hostId === host),
        ),
      );
    } finally {
      await f.cleanup();
    }
  }
});

test(
  "timeout/cancellation only cancels its own pending tool, with no request replay or interrupt",
  { timeout: 5000 },
  async () => {
    const f = await fixture("hang");
    try {
      const catalog = new DesktopHostCatalog({ ...f.options, timeoutMs: 200 });
      await assert.rejects(
        catalog.read(meta, { hostId: host, limit: 10 }),
        (error) =>
          error instanceof DesktopCatalogError &&
          error.code === "timeout-no-retry" &&
          error.transport.cancelRequests === 1,
      );
      await f.cancellation;
      assert.deepEqual(
        f.requests.map((request) => request.method),
        ["tools/list", "tools/call", "tools/cancel"],
      );
      assert.equal(f.requests[2].id, f.requests[1].id);
      await assert.rejects(
        catalog.read(meta, { hostId: host, limit: 10 }),
        DesktopCatalogError,
      );
      assert.equal(f.connections(), 1);
    } finally {
      await f.cleanup();
    }
  },
);
