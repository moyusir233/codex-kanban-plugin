import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { probeNativeCatalog } from "../diagnostics/desktop-host-probe/native-catalog";
import type { ProbePolicy } from "../diagnostics/desktop-host-probe/probe";
import { fixtureEnv } from "./fixture-env";

test("Desktop runtime launcher directly execs only the injected compatible runtime, without PATH/app fallback", async () => {
  const home = await mkdtemp(join(tmpdir(), "probe-runtime-"));
  try {
    const entry = join(home, "entry.mjs");
    await writeFile(
      entry,
      "console.log(JSON.stringify({pid:process.pid,execPath:process.execPath}));",
    );
    const script = resolve(
      "diagnostics/desktop-host-probe/launch-desktop-runtime.sh",
    );
    const result = spawnSync("/bin/sh", [script, entry], {
      env: fixtureEnv(home),
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      JSON.parse(result.stdout).pid,
      result.pid,
      "exec must replace the shell, not add a Node ancestor",
    );
    assert.equal(JSON.parse(result.stdout).execPath, process.execPath);
    for (const runtime of [undefined, "node", "/usr/bin/false"]) {
      const env = fixtureEnv(home);
      if (runtime === undefined) delete env.CODEX_MCP_NODE_PATH;
      else env.CODEX_MCP_NODE_PATH = runtime;
      const denied = spawnSync("/bin/sh", [script, entry], {
        env,
        encoding: "utf8",
        timeout: 10000,
      });
      assert.notEqual(denied.status, 0);
      assert.equal(denied.stdout, "");
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("Desktop-runtime mode requires a real injected/process path match before a native connection", async () => {
  for (const runtime of ["", "/synthetic/nonexistent-node", process.execPath]) {
    const home = await mkdtemp(join(tmpdir(), "probe-runtime-"));
    const pipe = join(home, "native.sock");
    let connections = 0;
    const sockets = new Set<import("node:net").Socket>();
    const native = createServer((socket) => {
      connections++;
      sockets.add(socket);
      socket.on("close",()=>sockets.delete(socket));
      socket.on("error", () => {});
      socket.end();
    });
    await new Promise<void>((ok, fail) => {
      native.once("error", fail);
      native.listen(pipe, ok);
    });
    await chmod(pipe, 0o600);
    const caller = "c0000000-0000-4000-8000-000000000001";
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
        desktopRuntimeRequired: true,
      },
    };
    try {
      const result = await probeNativeCatalog(
        policy,
        { confirmation: policy.nativeCatalog!.confirmation },
        {
          "x-codex-turn-metadata": {
            thread_id: caller,
            turn_id: "synthetic-turn",
          },
          "openai/toolCallId": "synthetic-call",
        },
        pipe,
        runtime,
      );
      if (runtime === process.execPath) {
        assert.equal(result.desktopRuntimeMatched, true);
        assert.equal(connections, 1);
      } else {
        assert.equal(result.desktopRuntimeMatched, false);
        assert.equal(result.nativeCatalogAccessVerified, false);
        assert.equal(connections, 0);
      }
    } finally {
      for(const socket of sockets)socket.destroy();
      await new Promise<void>((ok) => native.close(() => ok()));
      await rm(home, { recursive: true, force: true });
    }
  }
});
