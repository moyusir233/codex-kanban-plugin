import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fixtureEnv } from "./fixture-env";

test("normal startup strips staged native transport while opt-in directly execs only its supplied runtime", async () => {
  const home = await mkdtemp(join(tmpdir(), "catalog-start-"));
  try {
    const root = join(home, "plugin");
    await mkdir(join(root, "scripts"), { recursive: true });
    await copyFile(
      resolve("scripts/start-mcp.sh"),
      join(root, "scripts/start-mcp.sh"),
    );
    await writeFile(
      join(root, "entry.mjs"),
      "console.log(JSON.stringify({pid:process.pid,exec:process.execPath,pipe:!!process.env.CODEX_APP_TOOLS_PIPE_PATH,runtime:!!process.env.CODEX_MCP_NODE_PATH,caller:process.env.CODEX_THREAD_ID,trust:process.env.CODEX_BROWSER_USE_PEER_AUTHORIZATION}));",
    );
    const base = fixtureEnv(home, {
      CODEX_APP_TOOLS_PIPE_PATH: join(home, "synthetic-never-connect.sock"),
      CODEX_THREAD_ID: "synthetic-do-not-borrow",
      CODEX_BROWSER_USE_PEER_AUTHORIZATION: "1",
    });
    const run = (env: NodeJS.ProcessEnv) =>
      spawnSync("/bin/sh", [join(root, "scripts/start-mcp.sh"), "entry.mjs"], {
        env,
        encoding: "utf8",
        timeout: 10000,
      });
    const normal = run(base);
    assert.equal(normal.status, 0, normal.stderr);
    const n = JSON.parse(normal.stdout);
    assert.equal(n.pipe, false);
    assert.equal(n.runtime, false);
    assert.equal(n.caller, undefined);
    assert.equal(n.trust, undefined);
    const enabled = run({
      ...base,
      TASKBOARD_DESKTOP_CATALOG: "synthetic-policy-presence",
    });
    assert.equal(enabled.status, 0, enabled.stderr);
    const e = JSON.parse(enabled.stdout);
    assert.equal(e.pipe, true);
    assert.equal(e.runtime, true);
    assert.equal(e.caller, undefined);
    assert.equal(e.trust, undefined);
    assert.equal(e.pid, enabled.pid);
    const absent: NodeJS.ProcessEnv = {
      ...base,
      TASKBOARD_DESKTOP_CATALOG: "synthetic-policy-presence",
    };
    delete absent.CODEX_MCP_NODE_PATH;
    const denied = run(absent);
    assert.notEqual(denied.status, 0);
    assert.equal(denied.stdout, "");
    assert.ok(!denied.stderr.includes("Installing Node"));
    const incompatible = run({
      ...base,
      TASKBOARD_DESKTOP_CATALOG: "synthetic-policy-presence",
      CODEX_MCP_NODE_PATH: "/usr/bin/false",
    });
    assert.notEqual(incompatible.status, 0);
    assert.equal(incompatible.stdout, "");
    await writeFile(
      join(root, "scripts/desktop-cli.mjs"),
      "console.log(JSON.stringify({pipe:!!process.env.CODEX_APP_TOOLS_PIPE_PATH,caller:process.env.CODEX_THREAD_ID,origin:process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE}));",
    );
    const legacy = spawnSync(
      "/bin/sh",
      [join(root, "scripts/start-mcp.sh"), "scripts/desktop-cli.mjs"],
      {
        env: {
          ...base,
          CODEX_INTERNAL_ORIGINATOR_OVERRIDE: "codex_latex_preview",
          TASKBOARD_DESKTOP_CATALOG: "not-a-board-invocation",
          CODEX_MCP_NODE_PATH: "/usr/bin/false",
        },
        encoding: "utf8",
        timeout: 10000,
      },
    );
    assert.equal(legacy.status, 0, legacy.stderr);
    assert.deepEqual(JSON.parse(legacy.stdout), {
      pipe: true,
      caller: "synthetic-do-not-borrow",
      origin: "codex_latex_preview",
    });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
