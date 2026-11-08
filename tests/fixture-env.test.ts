import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fixtureEnv } from "./fixture-env";

test("fixture subprocesses cannot inherit Desktop identity, transport, credentials or Node injection", async () => {
  const home = await mkdtemp(join(tmpdir(), "fixture-env-"));
  const poison = {
    CODEX_APP_TOOLS_PIPE_PATH: "/synthetic/do-not-connect.sock",
    CODEX_APP_TOOLS_CALLER_HOST_ID: "durable",
    CODEX_TASK_WORKSPACE_VERIFYING_IDENTITY: "synthetic-key",
    NODE_REPL_HOST_SERVICES_PIPE_PATH: "/synthetic/services.sock",
    CODEX_BROWSER_USE_PEER_AUTHORIZATION: "1",
    CODEX_THREAD_ID: "synthetic-business-thread",
    CODEX_SESSION_ID: "synthetic-business-session",
    CODEX_TOOL_CALL_ID: "synthetic-call",
    CODEX_INTERNAL_ORIGINATOR_OVERRIDE: "Codex Desktop",
    CODEX_APP_SERVER_WS_URL: "ws://127.0.0.1:1",
    TASKBOARD_WS_URL: "ws://127.0.0.1:1",
    TASKBOARD_SSH_SESSIONS: "synthetic-do-not-observe",
    TASKBOARD_SSH_ACTIONS: "synthetic-do-not-act",
    OPENAI_API_KEY: "synthetic-no-credential",
    SSH_AUTH_SOCK: "/synthetic/agent.sock",
    NODE_OPTIONS: "--require=/synthetic/do-not-load.cjs",
    NODE_PATH: "/synthetic/modules",
    DYLD_INSERT_LIBRARIES: "/synthetic/do-not-load.dylib",
    HTTPS_PROXY: "http://synthetic.invalid",
    TASKBOARD_TEST_MARKETPLACE_SOURCE: "https://synthetic.invalid",
  };
  const previous = Object.fromEntries(
    Object.keys(poison).map((key) => [key, process.env[key]]),
  );
  try {
    Object.assign(process.env, poison);
    const env = fixtureEnv(home);
    for (const key of Object.keys(poison))
      assert.equal(env[key], undefined, key);
    assert.equal(env.HOME, home);
    assert.equal(env.CODEX_HOME, home);
    assert.equal(env.CODEX_MCP_NODE_PATH, process.execPath);
    const child = spawnSync(
      process.execPath,
      ["-e", "console.log(JSON.stringify(process.env))"],
      { env, cwd: home, encoding: "utf8", timeout: 5000 },
    );
    assert.equal(child.status, 0, child.stderr);
    const actual = JSON.parse(child.stdout);
    for (const key of Object.keys(poison))
      assert.equal(actual[key], undefined, key);
    assert.equal(actual.HOME, home);
    assert.equal(actual.CODEX_HOME, home);
    const pipe = join(home, "fixture.sock");
    assert.equal(
      fixtureEnv(home, { CODEX_APP_TOOLS_PIPE_PATH: pipe })
        .CODEX_APP_TOOLS_PIPE_PATH,
      pipe,
      "An explicitly supplied synthetic pipe remains usable",
    );
    assert.throws(() => fixtureEnv("relative-home"), /absolute/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(home, { recursive: true, force: true });
  }
});
