import assert from "node:assert/strict";
import { test } from "node:test";
import { access, chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { probeNativeCatalog } from "../diagnostics/desktop-host-probe/native-catalog";
import type { ProbePolicy } from "../diagnostics/desktop-host-probe/probe";

const caller = "c0000000-0000-4000-8000-000000000001";
const meta = {
  "x-codex-turn-metadata": {
    thread_id: caller,
    turn_id: "synthetic-private-turn",
  },
  "openai/toolCallId": "synthetic-private-call",
};
async function fixture(reply: "success" | "reject" | "close" = "success") {
  const home = await mkdtemp(join(tmpdir(), "native-catalog-"));
  const pipe = join(home, "native.sock");
  const policy: ProbePolicy = {
    version: 1,
    callerHostId: "local",
    callerThreadId: caller,
    confirmation: "SYNTHETIC_PRESENCE_CONFIRMATION",
    reportPath: join(home, "presence.json"),
    nativeCatalog: {
      confirmation: "SYNTHETIC_NATIVE_CONFIRMATION",
      attemptPath: join(home, "attempt.json"),
      reportPath: join(home, "native.json"),
      timeoutMs: 10000,
    },
  };
  const sockets = new Set<Socket>();
  const requests: any[] = [];
  let connections = 0;
  const server = createServer((socket) => {
    connections++;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    if (reply === "close") {
      socket.end();
      return;
    }
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4 || buffer.length < 4 + buffer.readUInt32LE())
        return;
      const request = JSON.parse(
        buffer.subarray(4, 4 + buffer.readUInt32LE()).toString(),
      );
      requests.push(request);
      const result =
        reply === "reject"
          ? { error: { code: -32000, message: "synthetic-private-error-body" } }
          : {
              result: {
                tools: [
                  {
                    name: "read_thread",
                    namespace: "codex_app",
                    description: "synthetic-private-description",
                    inputSchema: {
                      type: "object",
                      properties: {
                        hostId: { type: "string" },
                        threadId: { type: "string" },
                      },
                    },
                  },
                  {
                    name: "list_threads",
                    namespace: "codex_app",
                    inputSchema: { type: "object" },
                  },
                ],
              },
            };
      const body = Buffer.from(
        JSON.stringify({ id: request.id, jsonrpc: "2.0", ...result }),
      );
      const header = Buffer.alloc(4);
      header.writeUInt32LE(body.length);
      socket.write(header.subarray(0, 2));
      socket.write(Buffer.concat([header.subarray(2), body]));
    });
  });
  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(pipe, ok);
  });
  await chmod(pipe, 0o600);
  return {
    home,
    pipe,
    policy,
    requests,
    connections: () => connections,
    async cleanup() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((ok) => server.close(() => ok()));
      await rm(home, { recursive: true, force: true });
    },
  };
}

test("native catalog requires designated executor fields and a separate grant before any connection", async () => {
  const f = await fixture();
  try {
    const input = { confirmation: f.policy.nativeCatalog!.confirmation };
    for (const [policy, args, metadata] of [
      [{ ...f.policy, nativeCatalog: undefined }, input, meta],
      [f.policy, { confirmation: f.policy.confirmation }, meta],
      [f.policy, input, {}],
      [f.policy, input, { threadId: caller }],
      [f.policy, input, { ...meta, hostId: "ssh-fixture" }],
      [
        f.policy,
        input,
        { ...meta, threadId: "c0000000-0000-4000-8000-000000000002" },
      ],
    ] as const) {
      const result = await probeNativeCatalog(policy, args, metadata, f.pipe);
      assert.equal(result.admitted, false);
      assert.equal(result.nativeConnections, 0);
    }
    await assert.rejects(access(f.policy.nativeCatalog!.attemptPath));
    assert.equal(f.connections(), 0);
  } finally {
    await f.cleanup();
  }
});

test("native experiment sends exactly tools/list, blocks session reads, sanitizes output and never replays across invocations", async () => {
  const f = await fixture();
  try {
    const input = { confirmation: f.policy.nativeCatalog!.confirmation };
    const result = await probeNativeCatalog(f.policy, input, meta, f.pipe);
    assert.equal(result.nativeCatalogAccessVerified, true);
    assert.equal(result.nativePeerAdmissionVerified, true);
    assert.equal(result.nativeServiceAccessVerified, false);
    assert.equal(result.remoteReadAttempted, false);
    assert.equal(result.nativeRpcCalls, 1);
    assert.equal(result.readThreadDefinitionPresent, true);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].method, "tools/list");
    assert.deepEqual(f.requests[0].params, { threadStartKind: "all" });
    assert.equal(
      Object.keys(f.requests[0]).sort().join(","),
      "id,jsonrpc,method,params",
    );
    const replay = await probeNativeCatalog(
      f.policy,
      input,
      { ...meta, "openai/toolCallId": "another-real-fixture-call" },
      f.pipe,
    );
    assert.equal(replay.admitted, false);
    assert.equal(replay.reason, "attempt-already-used-or-unavailable");
    assert.equal(f.connections(), 1);
    const evidence =
      JSON.stringify(result) +
      (await readFile(f.policy.nativeCatalog!.attemptPath, "utf8"));
    for (const hidden of [
      caller,
      "synthetic-private-turn",
      "synthetic-private-call",
      "synthetic-private-description",
      f.pipe,
      input.confirmation,
    ])
      assert.ok(!evidence.includes(hidden));
  } finally {
    await f.cleanup();
  }
});

test("native rejection/close fail closed without error-body disclosure or a tools/call fallback", async () => {
  for (const mode of ["reject", "close"] as const) {
    const f = await fixture(mode);
    try {
      const result = await probeNativeCatalog(
        f.policy,
        { confirmation: f.policy.nativeCatalog!.confirmation },
        meta,
        f.pipe,
      );
      assert.equal(result.nativePeerAdmissionVerified, false);
      assert.equal(result.nativeCatalogAccessVerified, false);
      assert.equal(result.nativeServiceAccessVerified, false);
      assert.ok(
        !JSON.stringify(result).includes("synthetic-private-error-body"),
      );
      assert.ok(f.requests.every((request) => request.method === "tools/list"));
      assert.equal(f.connections(), 1);
    } finally {
      await f.cleanup();
    }
  }
});
