import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

test("fork distribution has matching source UI, launch config and content-addressed build ID", async () => {
  const root = resolve("plugins/codex-kanban-plugin");
  const sourceConfig = JSON.parse(await readFile(".mcp.json", "utf8"))
    .mcpServers["codex-taskboard"];
  const config = JSON.parse(await readFile(join(root, ".mcp.json"), "utf8"))
    .mcpServers["codex-taskboard"];
  const server = await readFile(join(root, "runtime/server/index.mjs"));
  const ui = await readFile(join(root, "runtime/ui/index.html"));
  const icon = await readFile(join(root, "assets/icon.svg"));
  const buildId = createHash("sha256")
    .update(server)
    .update(ui)
    .update(icon)
    .digest("hex");
  assert.equal(config.env.TASKBOARD_BUILD_ID, buildId);
  assert.deepEqual(config.env_vars, sourceConfig.env_vars);
  assert.ok(config.env_vars.includes("TASKBOARD_SSH_SESSIONS"));
  assert.ok(config.env_vars.includes("TASKBOARD_SSH_ACTIONS"));
  assert.deepEqual(config.args, ["./scripts/start-mcp.sh"]);
  assert.deepEqual(ui, await readFile("dist/ui/index.html"));
  assert.match(ui.toString(), /SSH navigation is disabled/);
  assert.match(ui.toString(), /auto-answer pending questions/);
  assert.match(ui.toString(), /Waited for/);
  assert.match(ui.toString(), /Was waited on by/);
  assert.match(ui.toString(), /Thread Git metadata/);
  assert.match(
    ui.toString(),
    /not the remote directory's current branch, HEAD or worktree/,
  );
  assert.deepEqual(
    await readFile(join(root, "scripts/start-mcp.sh")),
    await readFile("scripts/start-mcp.sh"),
  );
  assert.deepEqual(
    await readFile(join(root, "SSH-SESSIONS.md")),
    await readFile("SSH-SESSIONS.md"),
  );
  assert.deepEqual(
    await readFile(join(root, "SSH-PROTOCOL-RESEARCH.md")),
    await readFile("SSH-PROTOCOL-RESEARCH.md"),
  );
  assert.match(server.toString(), /TASKBOARD_SSH_SESSIONS/);
  assert.match(server.toString(), /TASKBOARD_SSH_ACTIONS/);
  assert.match(server.toString(), /function withSshMonitoring/);
  assert.match(server.toString(), /function sshSnapshotTurn/);
  assert.match(server.toString(), /function sshSnapshotGitInfo/);
  assert.match(server.toString(), /Number\.isSafeInteger\(key\d*\)/);
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(
    pkg.dependencies,
    undefined,
    "Distribution is self-contained, no install required",
  );
  const licenses = JSON.parse(
    await readFile(join(root, "licenses/index.json"), "utf8"),
  );
  assert.ok(
    !licenses.some((entry: { package: string }) => entry.package === "jsdom"),
  );
  const catalog = JSON.parse(
    await readFile(".agents/plugins/marketplace.json", "utf8"),
  );
  assert.deepEqual(catalog.plugins[0].source, {
    source: "git-subdir",
    url: "https://github.com/moyusir233/codex-kanban-plugin.git",
    path: "./plugins/codex-kanban-plugin",
    ref: "feat/ssh-session-observer",
  });
  // Offline artifacts are ignored by Git; verify them when packaging has produced them.
  const offline = "releases/marketplace/plugins/codex-kanban-plugin";
  if (existsSync(offline)) {
    for (const path of [
      ".mcp.json",
      "runtime/server/index.mjs",
      "runtime/ui/index.html",
      "SSH-SESSIONS.md",
      "SSH-PROTOCOL-RESEARCH.md",
    ]) {
      assert.deepEqual(
        await readFile(join(offline, path)),
        await readFile(join(root, path)),
        path,
      );
    }
    const localCatalog = JSON.parse(
      await readFile(
        "releases/marketplace/.agents/plugins/marketplace.json",
        "utf8",
      ),
    );
    assert.deepEqual(localCatalog.plugins[0].source, {
      source: "local",
      path: "./plugins/codex-kanban-plugin",
    });
  }
  const zip = "releases/codex-kanban-plugin-" + pkg.version + ".zip";
  if (existsSync(zip)) {
    for (const path of [
      ".mcp.json",
      "runtime/server/index.mjs",
      "runtime/ui/index.html",
      "SSH-SESSIONS.md",
      "SSH-PROTOCOL-RESEARCH.md",
    ]) {
      assert.deepEqual(
        execFileSync("/usr/bin/unzip", ["-p", zip, path], {
          maxBuffer: 8 * 1024 * 1024,
        }),
        await readFile(join(root, path)),
        path,
      );
    }
  }
});
