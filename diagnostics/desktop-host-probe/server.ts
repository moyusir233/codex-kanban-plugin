import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { inspectExecutor, probePolicySchema } from "./probe.js";
import { probeNativeCatalog } from "./native-catalog.js";
import { probeHostCatalog } from "./host-catalog.js";

const policy = probePolicySchema.parse(
  JSON.parse(
    await readFile(
      fileURLToPath(new URL("./probe-policy.json", import.meta.url)),
      "utf8",
    ),
  ),
);
const name = "kanban_desktop_executor_probe";
const catalogName = "kanban_desktop_native_catalog_probe";
const hostCatalogName = "kanban_desktop_host_catalog_probe";
const server = new Server(
  { name: "kanban-desktop-host-probe", version: "0.0.1" },
  {
    capabilities: { tools: {} },
    instructions:
      "Temporary scoped diagnostics, not full SSH support. Use only the user-designated local caller and separately granted operation/confirmation. Metadata probe never connects; native catalog only lists tool definitions; host catalog only lists the configured host's history metadata. Never supply caller identities as arguments.",
  },
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name,
      description:
        "Inspect only executor metadata presence for the designated local test caller. No native service connection, remote reads, discovery, execution or approval. Requires the user's one-test confirmation string.",
      inputSchema: {
        type: "object",
        properties: { confirmation: { type: "string" } },
        required: ["confirmation"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    ...(policy.nativeCatalog
      ? [
          {
            name: catalogName,
            description:
              "Separately authorized single native tools/list for this disposable local caller. No session listing, read_thread, arbitrary RPC, execution or approval. Requires the native-catalog confirmation.",
            inputSchema: {
              type: "object" as const,
              properties: { confirmation: { type: "string" } },
              required: ["confirmation"],
              additionalProperties: false,
            },
            annotations: {
              readOnlyHint: true,
              destructiveHint: false,
              openWorldHint: false,
            },
          },
        ]
      : []),
    ...(policy.hostCatalog
      ? [
          {
            name: hostCatalogName,
            description:
              "One separately approved exact-host history metadata list, result limit 10. May include private directory metadata in memory; returns only counts/binding, never titles, cwd, summaries, IDs, cursor or turn history. No other host, resume, execution or approval. Requires the host-catalog confirmation.",
            inputSchema: {
              type: "object" as const,
              properties: { confirmation: { type: "string" } },
              required: ["confirmation"],
              additionalProperties: false,
            },
            annotations: {
              readOnlyHint: true,
              destructiveHint: false,
              openWorldHint: false,
            },
          },
        ]
      : []),
  ],
}));
let admittedCalls = 0;
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  if (request.params.name === hostCatalogName && policy.hostCatalog) {
    const summary = await probeHostCatalog(
      policy,
      request.params.arguments,
      request.params._meta,
      extra.signal,
    );
    if (summary.attemptConsumed === true && summary.admitted === true) {
      try {
        await writeFile(
          policy.hostCatalog.reportPath,
          JSON.stringify(
            { recordedAt: new Date().toISOString(), ...summary },
            null,
            2,
          ) + "\n",
          { mode: 0o600, flag: "wx" },
        );
      } catch {
        /* Never disclose a path or raw response. Preserve first evidence. */
      }
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify(summary) }],
      structuredContent: summary,
      isError: summary.hostCatalogAccessVerified !== true,
    };
  }
  if (request.params.name === catalogName && policy.nativeCatalog) {
    const summary = await probeNativeCatalog(
      policy,
      request.params.arguments,
      request.params._meta,
      process.env.CODEX_APP_TOOLS_PIPE_PATH,
    );
    try {
      if (summary.attemptConsumed === true && summary.admitted === true)
        await writeFile(
          policy.nativeCatalog.reportPath,
          JSON.stringify(
            { recordedAt: new Date().toISOString(), ...summary },
            null,
            2,
          ) + "\n",
          { mode: 0o600, flag: "wx" },
        );
    } catch {
      /* Never log private paths or the raw response. */
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify(summary) }],
      structuredContent: summary,
      isError: !(
        "nativeCatalogAccessVerified" in summary &&
        summary.nativeCatalogAccessVerified
      ),
    };
  }
  const summary =
    request.params.name === name && admittedCalls < 3
      ? inspectExecutor(
          policy,
          request.params.arguments,
          request.params._meta,
          typeof process.env.CODEX_APP_TOOLS_PIPE_PATH === "string" &&
            process.env.CODEX_APP_TOOLS_PIPE_PATH.length > 0,
        )
      : {
          admitted: false,
          reason: "unknown-tool-or-probe-limit",
          nativeServiceAccessVerified: false,
          nativeConnections: 0,
          nativeRpcCalls: 0,
        };
  if (summary.admitted) {
    admittedCalls++;
    // Only allowlisted booleans/statuses go to this designated test-owned file.
    try {
      await writeFile(
        policy.reportPath,
        JSON.stringify(
          { recordedAt: new Date().toISOString(), ...summary },
          null,
          2,
        ) + "\n",
        { mode: 0o600 },
      );
    } catch {
      /* Return the same presence-only result; never print private paths. */
    }
  }
  return {
    content: [{ type: "text", text: JSON.stringify(summary) }],
    structuredContent: summary,
    isError: !summary.admitted,
  };
});
await server.connect(new StdioServerTransport());
process.stdin.once("end", () => {
  void server.close();
});
