// Development-only, explicit local output. Does not install or modify Desktop.
import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "tsup";

const args = process.argv.slice(2);
if (
  ![4, 6, 10].includes(args.length) ||
  args[0] !== "--caller" ||
  args[2] !== "--output" ||
  !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(args[1]) ||
  !isAbsolute(args[3]) ||
  (args.length > 4 &&
    (!["--catalog-for", "--desktop-runtime-for", "--host-catalog-for"].includes(
      args[4],
    ) ||
      !isAbsolute(args[5]))) ||
  (args[4] === "--host-catalog-for"
    ? args.length !== 10 ||
      args[6] !== "--host" ||
      !args[7] ||
      args[7].length > 200 ||
      /[\x00-\x1f\x7f*]/.test(args[7]) ||
      ["local", "durable"].includes(args[7]) ||
      args[8] !== "--interest" ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(args[9])
    : args.length === 10)
)
  throw new Error(
    "Usage: node scripts/package-desktop-host-probe.mjs --caller <designated-local-UUID> --output <new-absolute-directory> [--catalog-for|--desktop-runtime-for <prior-own-probe-plan>]",
  );
const root = fileURLToPath(new URL("..", import.meta.url));
const output = resolve(args[3]);
const hostMode = args[4] === "--host-catalog-for";
const desktopRuntime = args[4] === "--desktop-runtime-for" || hostMode;
let previous;
let previousPolicy;
if (args.length > 4) {
  previous = JSON.parse(await readFile(args[5], "utf8"));
  const match = /^codex-kanban-host-probe-([a-f0-9]{24})$/.exec(
    previous.pluginName,
  );
  if (
    !match ||
    previous.marketplaceName !== `kanban-host-probe-${match[1]}` ||
    previous.selector !== `${previous.pluginName}@${previous.marketplaceName}`
  )
    throw new Error(
      "Only a prior uniquely named diagnostic probe may be upgraded.",
    );
  const manifest = JSON.parse(
    await readFile(join(previous.plugin, ".codex-plugin/plugin.json"), "utf8"),
  );
  const policy = JSON.parse(
    await readFile(join(previous.plugin, "runtime/probe-policy.json"), "utf8"),
  );
  previousPolicy = policy;
  if (
    manifest.name !== previous.pluginName ||
    manifest.version !==
      (hostMode ? "0.0.3" : desktopRuntime ? "0.0.2" : "0.0.1") ||
    policy.callerHostId !== "local" ||
    policy.callerThreadId !== args[1] ||
    (hostMode && policy.nativeCatalog?.desktopRuntimeRequired !== true)
  )
    throw new Error(
      "The prior probe identity, version and designated local caller must match.",
    );
}
// Refuse an existing output: it might belong to the user or a prior installation.
await mkdir(output, { mode: 0o700 });
const suffix = randomBytes(12).toString("hex");
const pluginName = previous?.pluginName ?? `codex-kanban-host-probe-${suffix}`;
const marketplaceName =
  previous?.marketplaceName ?? `kanban-host-probe-${suffix}`;
const version = hostMode
  ? "0.0.4"
  : desktopRuntime
    ? "0.0.3"
    : previous
      ? "0.0.2"
      : "0.0.1";
const marketplace = join(output, "marketplace");
const plugin = join(marketplace, "plugins", pluginName);
await mkdir(join(plugin, ".codex-plugin"), { recursive: true });
await mkdir(join(marketplace, ".agents/plugins"), { recursive: true });
await mkdir(join(plugin, "runtime"));
const confirmation = `KANBAN_HOST_PROBE_${suffix}`;
const reportPath = join(output, "presence-result.json");
const nativeCatalog = hostMode
  ? previousPolicy.nativeCatalog
  : previous
    ? {
        confirmation: `KANBAN_NATIVE_CATALOG_${suffix}`,
        attemptPath: join(output, "native-catalog-attempt.json"),
        reportPath: join(output, "native-catalog-result.json"),
        timeoutMs: 10000,
        ...(desktopRuntime ? { desktopRuntimeRequired: true } : {}),
      }
    : undefined;
const hostCatalog = hostMode
  ? {
      confirmation: `KANBAN_HOST_CATALOG_${suffix}`,
      attemptPath: join(output, "host-catalog-attempt.json"),
      reportPath: join(output, "host-catalog-result.json"),
      hostId: args[7],
      interestThreadId: args[9],
      limit: 10,
      timeoutMs: 15000,
    }
  : undefined;
await build({
  config: false,
  entry: { server: join(root, "diagnostics/desktop-host-probe/server.ts") },
  outDir: join(plugin, "runtime"),
  format: ["esm"],
  outExtension: () => ({ js: ".mjs" }),
  platform: "node",
  target: "node22",
  noExternal: [/.*/],
  splitting: false,
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});
const files = [
  [
    join(plugin, "runtime/probe-policy.json"),
    {
      version: 1,
      callerHostId: "local",
      callerThreadId: args[1],
      confirmation,
      reportPath,
      ...(nativeCatalog ? { nativeCatalog } : {}),
      ...(hostCatalog ? { hostCatalog } : {}),
    },
  ],
  [
    join(plugin, ".codex-plugin/plugin.json"),
    {
      name: pluginName,
      version,
      description: hostMode
        ? "Temporary single connected-host directory metadata probe; counts only, no turn history or actions."
        : previous
          ? "Temporary Kanban single native tools/list probe; no session reads or arbitrary RPC."
          : "Temporary Kanban executor metadata presence probe; no native connections or session reads.",
      license: "MIT",
      requires_local_executor: true,
      mcpServers: "./.mcp.json",
      interface: {
        displayName: "Kanban Host Probe (Temporary)",
        shortDescription:
          "Presence-only diagnostic for one designated local test conversation.",
        category: "Developer Tools",
        capabilities: ["Read"],
      },
    },
  ],
  [
    join(plugin, ".mcp.json"),
    {
      mcpServers: {
        kanban_host_probe: {
          command: desktopRuntime ? "/bin/sh" : process.execPath,
          args: desktopRuntime
            ? ["./scripts/launch-desktop-runtime.sh", "./runtime/server.mjs"]
            : ["./runtime/server.mjs"],
          cwd: ".",
          env_vars: [
            "CODEX_APP_TOOLS_PIPE_PATH",
            ...(desktopRuntime ? ["CODEX_MCP_NODE_PATH"] : []),
          ],
          startup_timeout_sec: 15,
          tool_timeout_sec: previous ? 20 : 10,
        },
      },
    },
  ],
  [
    join(marketplace, ".agents/plugins/marketplace.json"),
    {
      name: marketplaceName,
      plugins: [
        {
          name: pluginName,
          source: { source: "local", path: `./plugins/${pluginName}` },
        },
      ],
    },
  ],
];
for (const [path, value] of files)
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
if (desktopRuntime) {
  await mkdir(join(plugin, "scripts"));
  await cp(
    join(root, "diagnostics/desktop-host-probe/launch-desktop-runtime.sh"),
    join(plugin, "scripts/launch-desktop-runtime.sh"),
  );
}
await cp(join(root, "LICENSE"), join(plugin, "LICENSE"));
await cp(
  join(root, "plugins/codex-kanban-plugin/licenses"),
  join(plugin, "licenses"),
  { recursive: true },
);
const result = {
  pluginName,
  marketplaceName,
  selector: `${pluginName}@${marketplaceName}`,
  marketplace,
  plugin,
  confirmation,
  reportPath,
  version,
  ...(hostCatalog ? { hostCatalog } : {}),
  ...(nativeCatalog
    ? {
        nativeCatalog,
        upgradeFrom: args[5],
        sourcePluginToUpdate: previous.sourcePluginToUpdate ?? previous.plugin,
      }
    : {}),
  rollback: {
    removePluginArgs: [
      "plugin",
      "remove",
      `${pluginName}@${marketplaceName}`,
      "--json",
    ],
    removeMarketplaceArgs: [
      "plugin",
      "marketplace",
      "remove",
      marketplaceName,
      "--json",
    ],
  },
};
await writeFile(
  join(output, "installation-plan.json"),
  JSON.stringify(result, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(JSON.stringify(result));
