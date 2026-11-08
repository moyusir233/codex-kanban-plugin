import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fixtureEnv } from "./fixture-env";
import {
  inspectExecutor,
  type ProbePolicy,
} from "../diagnostics/desktop-host-probe/probe";

const caller = "c0000000-0000-4000-8000-000000000001";
const policy: ProbePolicy = {
  version: 1,
  callerHostId: "local",
  callerThreadId: caller,
  confirmation: "SYNTHETIC_HOST_PROBE_CONFIRMATION",
  reportPath: "/synthetic/probe-report.json",
};
const input = { confirmation: policy.confirmation };
const meta = {
  "x-codex-turn-metadata": JSON.stringify({
    thread_id: caller,
    turn_id: "synthetic-private-turn",
  }),
  "openai/toolCallId": "synthetic-private-call",
  "openai/hostId": "local",
};

test("executor probe admits only the designated caller and returns presence, never raw identities or trust", () => {
  const result = inspectExecutor(policy, input, meta, true);
  assert.equal(result.admitted, true);
  if (!result.admitted) return;
  assert.equal(result.executorTurnMetadataProvided, true);
  assert.equal(result.turnIdProvided, true);
  assert.equal(result.toolCallIdProvided, true);
  assert.equal(result.pipeEnvironmentProvided, true);
  assert.equal(result.callerHostEvidence, "explicit-local");
  assert.equal(result.metadataAuthenticityVerified, false);
  assert.equal(result.nativePeerAdmissionVerified, false);
  assert.equal(result.nativeServiceAccessVerified, false);
  assert.equal(result.nativeConnections, 0);
  assert.equal(result.nativeRpcCalls, 0);
  const text = JSON.stringify(result);
  for (const secret of [
    caller,
    "synthetic-private-turn",
    "synthetic-private-call",
    policy.confirmation,
    policy.reportPath,
  ])
    assert.ok(!text.includes(secret));
});

test("executor probe rejects missing, contradictory, nonlocal or argument-supplied callers", () => {
  for (const [args, metadata] of [
    [{}, meta],
    [{ ...input, threadId: caller }, {}],
    [input, {}],
    [input, { threadId: "c0000000-0000-4000-8000-000000000002" }],
    [input, { ...meta, threadId: "c0000000-0000-4000-8000-000000000002" }],
    [input, { ...meta, threadId: 12 }],
    [input, { ...meta, hostId: "ssh-fixture" }],
    [input, { ...meta, "x-codex-turn-metadata": "not-json" }],
    [input, { ...meta, "x-codex-turn-metadata": "x".repeat(4097) }],
    [input, { ...meta, turnId: "different-turn" }],
    [input, { ...meta, callId: "different-call" }],
    [input, Object.create({ threadId: caller })],
  ]) {
    const result = inspectExecutor(policy, args, metadata, true);
    assert.equal(result.admitted, false);
    assert.equal(result.nativeConnections, 0);
    assert.equal(result.nativeRpcCalls, 0);
    assert.ok(!JSON.stringify(result).includes(caller));
  }
});

test("missing host/turn/call evidence stays missing without a generated identity or native grant", () => {
  const result = inspectExecutor(policy, input, { threadId: caller }, false);
  assert.equal(result.admitted, true);
  if (!result.admitted) return;
  assert.equal(result.callerHostEvidence, "not-provided");
  assert.equal(result.turnIdProvided, false);
  assert.equal(result.toolCallIdProvided, false);
  assert.equal(result.pipeEnvironmentProvided, false);
  assert.equal(result.nativeServiceAccessVerified, false);
});

async function packagedFixture() {
  const home = await mkdtemp(join(tmpdir(), "kanban-host-probe-"));
  const output = join(home, "package");
  try {
    execFileSync(
      process.execPath,
      [
        resolve("scripts/package-desktop-host-probe.mjs"),
        "--caller",
        caller,
        "--output",
        output,
      ],
      {
        cwd: resolve("."),
        env: fixtureEnv(home),
        timeout: 30000,
        stdio: "pipe",
      },
    );
    const plan = JSON.parse(
      await readFile(join(output, "installation-plan.json"), "utf8"),
    );
    assert.match(plan.pluginName, /^codex-kanban-host-probe-[a-f0-9]{24}$/);
    assert.match(plan.marketplaceName, /^kanban-host-probe-[a-f0-9]{24}$/);
    const config = JSON.parse(
      await readFile(join(plan.plugin, ".mcp.json"), "utf8"),
    ).mcpServers.kanban_host_probe;
    assert.deepEqual(config.env_vars, ["CODEX_APP_TOOLS_PIPE_PATH"]);
    assert.equal(config.command, process.execPath);
    assert.deepEqual(config.args, ["./runtime/server.mjs"]);
    return { home, output, plan, config };
  } catch (error) {
    await rm(home, { recursive: true, force: true });
    throw error;
  }
}

async function nativeMcpStatus(cli: string, home: string) {
  const child = spawn(cli, ["app-server"], {
    env: fixtureEnv(home),
    cwd: home,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  child.stderr.on("data", () => {});
  const pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  createInterface({ input: child.stdout }).on("line", (line) => {
    const message = JSON.parse(line);
    const waiter = pending.get(message.id);
    if (!waiter || message.method) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
  });
  let nextId = 0;
  const request = (method: string, params: object) =>
    new Promise<any>((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Fixture ${method} timed out`));
      }, 10000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  try {
    await request("initialize", {
      clientInfo: { name: "isolated_probe_registration", version: "1" },
      capabilities: { experimentalApi: true },
    });
    child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
    return await request("mcpServerStatus/list", {
      limit: 100,
      detail: "full",
    });
  } finally {
    for (const waiter of pending.values()) clearTimeout(waiter.timer);
    child.stdin.end();
    if (child.exitCode === null && child.signalCode === null) {
      const force = setTimeout(() => child.kill("SIGTERM"), 3000);
      await exited;
      clearTimeout(force);
    }
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
  }
}

test(
  "packaged ordinary MCP probe never attaches even to an available synthetic native pipe",
  { timeout: 40000 },
  async () => {
    const f = await packagedFixture();
    let nativeConnections = 0;
    const native = createServer((socket) => {
      nativeConnections++;
      socket.destroy();
    });
    const socketPath = join(f.home, "native.sock");
    await new Promise<void>((ok, fail) => {
      native.once("error", fail);
      native.listen(socketPath, ok);
    });
    const transport = new StdioClientTransport({
      command: f.config.command,
      args: f.config.args,
      cwd: f.plan.plugin,
      env: Object.fromEntries(
        Object.entries(
          fixtureEnv(f.home, { CODEX_APP_TOOLS_PIPE_PATH: socketPath }),
        ).filter((entry): entry is [string, string] => entry[1] !== undefined),
      ),
      stderr: "pipe",
    });
    transport.stderr?.on("data", () => {});
    const client = new Client({
      name: "synthetic-host-probe-test",
      version: "1",
    });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      assert.equal(tools.tools.length, 1);
      assert.equal(tools.tools[0].name, "kanban_desktop_executor_probe");
      const call = (metadata?: Record<string, unknown>) =>
        client.callTool({
          name: "kanban_desktop_executor_probe",
          arguments: { confirmation: f.plan.confirmation },
          ...(metadata ? { _meta: metadata } : {}),
        });
      assert.equal((await call()).isError, true);
      assert.equal(
        (await call({ threadId: "c0000000-0000-4000-8000-000000000002" }))
          .isError,
        true,
      );
      await assert.rejects(access(f.plan.reportPath));
      for (let index = 0; index < 3; index++) {
        const result = await call(meta);
        assert.equal(result.isError, false);
        const summary = result.structuredContent as any;
        assert.equal(summary.pipeEnvironmentProvided, true);
        assert.equal(summary.nativeConnections, 0);
        assert.equal(summary.nativeRpcCalls, 0);
        assert.equal(summary.nativeServiceAccessVerified, false);
      }
      assert.equal(
        (await call(meta)).isError,
        true,
        "Admitted calls are bounded per process",
      );
      const report = await readFile(f.plan.reportPath, "utf8");
      for (const hidden of [
        caller,
        "synthetic-private-turn",
        "synthetic-private-call",
        socketPath,
        f.plan.confirmation,
      ])
        assert.ok(!report.includes(hidden));
      assert.equal(nativeConnections, 0);
      assert.throws(
        () =>
          execFileSync(
            process.execPath,
            [
              resolve("scripts/package-desktop-host-probe.mjs"),
              "--caller",
              caller,
              "--output",
              f.output,
            ],
            { env: fixtureEnv(f.home), timeout: 10000, stdio: "pipe" },
          ),
        "An existing output must never be overwritten",
      );
    } finally {
      await client.close();
      await new Promise<void>((ok) => native.close(() => ok()));
      await rm(f.home, { recursive: true, force: true });
    }
  },
);

test(
  "catalog probe MCP forwards only its one authorized definition request and preserves the first sanitized report",
  { timeout: 40000 },
  async () => {
    const f = await packagedFixture();
    const output = join(f.home, "native-package");
    const requests: any[] = [];
    const sockets = new Set<import("node:net").Socket>();
    const native = createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("error", () => {});
      let buffer = Buffer.alloc(0);
      socket.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length < 4 || buffer.length < 4 + buffer.readUInt32LE())
          return;
        const request = JSON.parse(
          buffer.subarray(4, 4 + buffer.readUInt32LE()).toString(),
        );
        requests.push(request);
        const body = Buffer.from(
          JSON.stringify({
            id: request.id,
            jsonrpc: "2.0",
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
                    required: ["threadId"],
                  },
                },
              ],
            },
          }),
        );
        const header = Buffer.alloc(4);
        header.writeUInt32LE(body.length);
        socket.end(Buffer.concat([header, body]));
      });
    });
    const pipe = join(f.home, "catalog.sock");
    await new Promise<void>((ok, fail) => {
      native.once("error", fail);
      native.listen(pipe, ok);
    });
    await chmod(pipe, 0o600);
    let client: Client | undefined;
    try {
      execFileSync(
        process.execPath,
        [
          resolve("scripts/package-desktop-host-probe.mjs"),
          "--caller",
          caller,
          "--output",
          output,
          "--catalog-for",
          join(f.output, "installation-plan.json"),
        ],
        { env: fixtureEnv(f.home), timeout: 30000, stdio: "pipe" },
      );
      const plan = JSON.parse(
        await readFile(join(output, "installation-plan.json"), "utf8"),
      );
      const config = JSON.parse(
        await readFile(join(plan.plugin, ".mcp.json"), "utf8"),
      ).mcpServers.kanban_host_probe;
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        cwd: plan.plugin,
        env: Object.fromEntries(
          Object.entries(
            fixtureEnv(f.home, { CODEX_APP_TOOLS_PIPE_PATH: pipe }),
          ).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
          ),
        ),
        stderr: "pipe",
      });
      transport.stderr?.on("data", () => {});
      client = new Client({
        name: "synthetic-native-catalog-mcp",
        version: "1",
      });
      await client.connect(transport);
      const call = () =>
        client!.callTool({
          name: "kanban_desktop_native_catalog_probe",
          arguments: { confirmation: plan.nativeCatalog.confirmation },
          _meta: meta,
        });
      const result = await call();
      assert.equal(result.isError, false);
      assert.equal(
        (result.structuredContent as any).nativeCatalogAccessVerified,
        true,
      );
      assert.equal(
        (result.structuredContent as any).nativeServiceAccessVerified,
        false,
      );
      assert.deepEqual((result.structuredContent as any).definitions, [
        {
          name: "read_thread",
          namespace: "codex_app",
          argumentKeys: ["hostId", "threadId"],
          required: ["threadId"],
        },
      ]);
      const report = await readFile(plan.nativeCatalog.reportPath, "utf8");
      assert.equal((await call()).isError, true);
      assert.equal(
        await readFile(plan.nativeCatalog.reportPath, "utf8"),
        report,
        "A denied replay must not erase original evidence",
      );
      assert.equal(requests.length, 1);
      assert.equal(requests[0].method, "tools/list");
      for (const hidden of [
        caller,
        "synthetic-private-turn",
        "synthetic-private-call",
        "synthetic-private-description",
        pipe,
      ])
        assert.ok(!report.includes(hidden));
    } finally {
      await client?.close();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((ok) => native.close(() => ok()));
      await rm(f.home, { recursive: true, force: true });
    }
  },
);

test(
  "native CLI installs and removes only the isolated probe, retaining a fixture Kanban installation",
  { timeout: 45000 },
  async (t) => {
    const cli =
      process.env.TASKBOARD_CODEX_CLI ??
      "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex";
    try {
      await access(cli);
    } catch {
      return t.skip("bundled CLI unavailable");
    }
    const f = await packagedFixture();
    const env = fixtureEnv(f.home);
    const run = (args: string[]) =>
      JSON.parse(
        execFileSync(cli, args, {
          env,
          cwd: f.home,
          encoding: "utf8",
          timeout: 15000,
        }),
      );
    try {
      const catalogPath = join(
        f.plan.marketplace,
        ".agents/plugins/marketplace.json",
      );
      const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
      await cp(
        resolve("plugins/codex-kanban-plugin"),
        join(f.plan.marketplace, "plugins/codex-kanban-plugin"),
        { recursive: true },
      );
      catalog.plugins.push({
        name: "codex-kanban-plugin",
        source: { source: "local", path: "./plugins/codex-kanban-plugin" },
      });
      await writeFile(catalogPath, JSON.stringify(catalog));
      run(["plugin", "marketplace", "add", f.plan.marketplace, "--json"]);
      const original = run([
        "plugin",
        "add",
        `codex-kanban-plugin@${f.plan.marketplaceName}`,
        "--json",
      ]);
      const originalConfigPath = join(original.installedPath, ".mcp.json");
      const originalConfig = await readFile(originalConfigPath);
      const originalServerPath = join(
        original.installedPath,
        "runtime/server/index.mjs",
      );
      const originalServer = await readFile(originalServerPath);
      const added = run(["plugin", "add", f.plan.selector, "--json"]);
      assert.notEqual(added.installedPath, original.installedPath);
      assert.ok(
        added.installedPath.startsWith(f.home) ||
          added.installedPath.startsWith(`/private${f.home}`),
      );
      assert.equal(
        JSON.parse(
          await readFile(
            join(added.installedPath, ".codex-plugin/plugin.json"),
            "utf8",
          ),
        ).name,
        f.plan.pluginName,
      );
      const status = await nativeMcpStatus(cli, f.home);
      const probe = status.data.find(
        (server: any) => server.name === "kanban_host_probe",
      );
      assert.ok(
        probe,
        "The installed probe must register its exact MCP server",
      );
      assert.equal(probe.toolsError, null);
      assert.deepEqual(Object.keys(probe.tools), [
        "kanban_desktop_executor_probe",
      ]);
      const upgradeOutput = join(f.home, "catalog-package");
      execFileSync(
        process.execPath,
        [
          resolve("scripts/package-desktop-host-probe.mjs"),
          "--caller",
          caller,
          "--output",
          upgradeOutput,
          "--catalog-for",
          join(f.output, "installation-plan.json"),
        ],
        { env, cwd: resolve("."), timeout: 30000, stdio: "pipe" },
      );
      const upgrade = JSON.parse(
        await readFile(join(upgradeOutput, "installation-plan.json"), "utf8"),
      );
      assert.equal(upgrade.selector, f.plan.selector);
      assert.equal(upgrade.version, "0.0.2");
      assert.ok(upgrade.nativeCatalog.confirmation !== f.plan.confirmation);
      for (const path of [
        ".mcp.json",
        ".codex-plugin/plugin.json",
        "runtime/server.mjs",
        "runtime/probe-policy.json",
      ])
        await cp(join(upgrade.plugin, path), join(f.plan.plugin, path));
      run(f.plan.rollback.removePluginArgs);
      await assert.rejects(access(added.installedPath));
      const upgraded = run(["plugin", "add", f.plan.selector, "--json"]);
      assert.notEqual(upgraded.installedPath, added.installedPath);
      assert.equal(
        JSON.parse(
          await readFile(
            join(upgraded.installedPath, ".codex-plugin/plugin.json"),
            "utf8",
          ),
        ).version,
        "0.0.2",
      );
      const upgradedStatus = await nativeMcpStatus(cli, f.home);
      const upgradedProbe = upgradedStatus.data.find(
        (server: any) => server.name === "kanban_host_probe",
      );
      assert.equal(upgradedProbe.toolsError, null);
      assert.deepEqual(Object.keys(upgradedProbe.tools).sort(), [
        "kanban_desktop_executor_probe",
        "kanban_desktop_native_catalog_probe",
      ]);
      run(f.plan.rollback.removePluginArgs);
      await assert.rejects(access(upgraded.installedPath));
      const desktopOutput = join(f.home, "desktop-runtime-package");
      execFileSync(
        process.execPath,
        [
          resolve("scripts/package-desktop-host-probe.mjs"),
          "--caller",
          caller,
          "--output",
          desktopOutput,
          "--desktop-runtime-for",
          join(upgradeOutput, "installation-plan.json"),
        ],
        { env, cwd: resolve("."), timeout: 30000, stdio: "pipe" },
      );
      const desktopPlan = JSON.parse(
        await readFile(join(desktopOutput, "installation-plan.json"), "utf8"),
      );
      assert.equal(desktopPlan.selector, f.plan.selector);
      assert.equal(desktopPlan.version, "0.0.3");
      assert.equal(desktopPlan.nativeCatalog.desktopRuntimeRequired, true);
      for (const path of [
        ".mcp.json",
        ".codex-plugin/plugin.json",
        "runtime/server.mjs",
        "runtime/probe-policy.json",
      ])
        await cp(join(desktopPlan.plugin, path), join(f.plan.plugin, path));
      await mkdir(join(f.plan.plugin, "scripts"));
      await cp(
        join(desktopPlan.plugin, "scripts/launch-desktop-runtime.sh"),
        join(f.plan.plugin, "scripts/launch-desktop-runtime.sh"),
      );
      const desktopAdded = run(["plugin", "add", f.plan.selector, "--json"]);
      assert.equal(
        JSON.parse(
          await readFile(
            join(desktopAdded.installedPath, ".codex-plugin/plugin.json"),
            "utf8",
          ),
        ).version,
        "0.0.3",
      );
      const desktopConfig = JSON.parse(
        await readFile(join(desktopAdded.installedPath, ".mcp.json"), "utf8"),
      ).mcpServers.kanban_host_probe;
      assert.equal(desktopConfig.command, "/bin/sh");
      assert.deepEqual(desktopConfig.env_vars, [
        "CODEX_APP_TOOLS_PIPE_PATH",
        "CODEX_MCP_NODE_PATH",
      ]);
      const desktopStatus = await nativeMcpStatus(cli, f.home);
      assert.equal(
        desktopStatus.data.find(
          (server: any) => server.name === "kanban_host_probe",
        ).toolsError,
        null,
      );
      await assert.rejects(access(desktopPlan.nativeCatalog.attemptPath));
      run(f.plan.rollback.removePluginArgs);
      await assert.rejects(access(desktopAdded.installedPath));
      const hostOutput = join(f.home, "host-catalog-package");
      const interest = "d0000000-0000-4000-8000-000000000001";
      execFileSync(
        process.execPath,
        [
          resolve("scripts/package-desktop-host-probe.mjs"),
          "--caller",
          caller,
          "--output",
          hostOutput,
          "--host-catalog-for",
          join(desktopOutput, "installation-plan.json"),
          "--host",
          "ssh-fixture-host",
          "--interest",
          interest,
        ],
        { env, cwd: resolve("."), timeout: 30000, stdio: "pipe" },
      );
      const hostPlan = JSON.parse(
        await readFile(join(hostOutput, "installation-plan.json"), "utf8"),
      );
      assert.equal(hostPlan.selector, f.plan.selector);
      assert.equal(hostPlan.version, "0.0.4");
      assert.equal(hostPlan.hostCatalog.hostId, "ssh-fixture-host");
      assert.equal(hostPlan.hostCatalog.limit, 10);
      assert.deepEqual(
        hostPlan.nativeCatalog,
        desktopPlan.nativeCatalog,
        "Do not silently grant another prior catalog attempt",
      );
      for (const path of [
        ".mcp.json",
        ".codex-plugin/plugin.json",
        "runtime/server.mjs",
        "runtime/probe-policy.json",
        "scripts/launch-desktop-runtime.sh",
      ])
        await cp(join(hostPlan.plugin, path), join(f.plan.plugin, path));
      const hostAdded = run(["plugin", "add", f.plan.selector, "--json"]);
      assert.equal(
        JSON.parse(
          await readFile(
            join(hostAdded.installedPath, ".codex-plugin/plugin.json"),
            "utf8",
          ),
        ).version,
        "0.0.4",
      );
      const hostStatus = await nativeMcpStatus(cli, f.home);
      const hostProbe = hostStatus.data.find(
        (server: any) => server.name === "kanban_host_probe",
      );
      assert.equal(hostProbe.toolsError, null);
      assert.deepEqual(Object.keys(hostProbe.tools).sort(), [
        "kanban_desktop_executor_probe",
        "kanban_desktop_host_catalog_probe",
        "kanban_desktop_native_catalog_probe",
      ]);
      await assert.rejects(access(hostPlan.hostCatalog.attemptPath));
      const directConfig = JSON.parse(await readFile(join(hostAdded.installedPath, ".mcp.json"), "utf8")).mcpServers.kanban_host_probe;
      const direct = new StdioClientTransport({ command: directConfig.command, args: directConfig.args,
        cwd: hostAdded.installedPath,
        env: Object.fromEntries(Object.entries(fixtureEnv(f.home)).filter((entry): entry is [string, string] => entry[1] !== undefined)), stderr: "pipe" });
      direct.stderr?.on("data", () => {});
      const directClient = new Client({ name: "isolated-host-handler-smoke", version: "1" });
      try {
        await directClient.connect(direct);
        const called = await directClient.callTool({ name: "kanban_desktop_host_catalog_probe", arguments: { confirmation: hostPlan.hostCatalog.confirmation }, _meta: meta });
        assert.equal(called.isError, true, "This fixture intentionally has no native pipe");
        assert.equal((called.structuredContent as any).reason, "desktop-environment-required");
        assert.equal((called.structuredContent as any).attemptConsumed, true);
        assert.equal((called.structuredContent as any).nativeRpcRequests, 0);
        const receipt = JSON.parse(await readFile(hostPlan.hostCatalog.reportPath, "utf8"));
        assert.equal(receipt.reason, "desktop-environment-required");
      } finally { await directClient.close(); }
      run(f.plan.rollback.removePluginArgs);
      await assert.rejects(access(hostAdded.installedPath));
      assert.deepEqual(await readFile(originalConfigPath), originalConfig);
      assert.deepEqual(await readFile(originalServerPath), originalServer);
      run(f.plan.rollback.removeMarketplaceArgs);
    } finally {
      await rm(f.home, { recursive: true, force: true });
    }
  },
);
