import { randomUUID } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import { createConnection, type Socket } from "node:net";
import { isAbsolute } from "node:path";
import { inspectExecutor, type ProbePolicy } from "./probe.js";

/** This experiment has deliberately NO tools/call, session read or RPC selector. */
export async function probeNativeCatalog(
  policy: ProbePolicy,
  input: unknown,
  meta: unknown,
  pipe: string | undefined,
  injectedRuntime: string | undefined = process.env.CODEX_MCP_NODE_PATH,
): Promise<Record<string, unknown>> {
  const denied = (reason: string) => ({
    admitted: false,
    reason,
    nativeConnections: 0,
    nativeRpcCalls: 0,
    nativePeerAdmissionVerified: false,
    nativeCatalogAccessVerified: false,
    nativeServiceAccessVerified: false,
    attemptConsumed: false,
  });
  if (!policy.nativeCatalog) return denied("native-catalog-not-authorized");
  const admission = inspectExecutor(
    { ...policy, confirmation: policy.nativeCatalog.confirmation },
    input,
    meta,
    !!pipe,
  );
  if (!admission.admitted) return denied(admission.reason);
  if (!admission.turnIdProvided || !admission.toolCallIdProvided)
    return denied("real-executor-turn-and-call-required");
  try {
    const claim = await open(policy.nativeCatalog.attemptPath, "wx", 0o600);
    try {
      await claim.writeFile(
        JSON.stringify({
          purpose: "single-native-tools-list",
          startedAt: new Date().toISOString(),
        }),
      );
    } finally {
      await claim.close();
    }
  } catch {
    return denied("attempt-already-used-or-unavailable");
  }
  const consumedFailure = (reason: string) => ({
    ...denied(reason),
    admitted: true,
    attemptConsumed: true,
    remoteReadAttempted: false,
  });
  let runtimeMatched: boolean | null = null;
  if (policy.nativeCatalog.desktopRuntimeRequired) {
    try {
      runtimeMatched =
        !!injectedRuntime &&
        isAbsolute(injectedRuntime) &&
        (await realpath(injectedRuntime)) ===
          (await realpath(process.execPath));
    } catch {
      runtimeMatched = false;
    }
    if (!runtimeMatched)
      return {
        ...consumedFailure("desktop-injected-runtime-not-matched"),
        desktopRuntimeMatched: false,
      };
  }
  if (!pipe || !isAbsolute(pipe) || pipe.includes("\0"))
    return consumedFailure("injected-pipe-unavailable");
  try {
    const info = await lstat(pipe);
    if (
      !info.isSocket() ||
      (info.mode & 0o077) !== 0 ||
      info.uid !== process.getuid?.()
    )
      return consumedFailure("injected-pipe-not-private-user-socket");
  } catch {
    return consumedFailure("injected-pipe-unavailable");
  }

  return await new Promise<Record<string, unknown>>((resolve) => {
    // This UUID is ONLY JSON-RPC correlation, never a caller/turn/tool-call ID.
    const id = randomUUID();
    let socket: Socket;
    try {
      socket = createConnection(pipe);
    } catch {
      resolve(consumedFailure("native-connection-unavailable-no-retry"));
      return;
    }
    let buffer = Buffer.alloc(0),
      connected = false,
      rpcSent = false,
      finished = false;
    const finish = (reason: string, extra: Record<string, unknown> = {}) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.destroy();
      resolve({
        admitted: true,
        attemptConsumed: true,
        scope: "single-native-tools-list-only",
        reason,
        nativeConnections: connected ? 1 : 0,
        nativeRpcCalls: rpcSent ? 1 : 0,
        metadataAuthenticityVerified: false,
        nativePeerAdmissionVerified: false,
        nativeCatalogAccessVerified: false,
        nativeServiceAccessVerified: false,
        remoteReadAttempted: false,
        desktopRuntimeMatched: runtimeMatched,
        readThreadBlockedReason:
          "installed-read-thread-can-fall-back-to-other-hosts",
        ...extra,
      });
    };
    const timer = setTimeout(
      () => finish("native-catalog-timeout-no-retry"),
      policy.nativeCatalog!.timeoutMs,
    );
    socket.on("connect", () => {
      connected = true;
      const body = Buffer.from(
        JSON.stringify({
          id,
          jsonrpc: "2.0",
          method: "tools/list",
          params: { threadStartKind: "all" },
        }),
      );
      const header = Buffer.alloc(4);
      header.writeUInt32LE(body.length);
      rpcSent = true;
      socket.write(Buffer.concat([header, body]));
    });
    socket.on("error", () =>
      finish("native-peer-or-transport-unavailable-no-retry"),
    );
    socket.on("close", () => finish("native-peer-closed-no-retry"));
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        while (buffer.length >= 4) {
          const size = buffer.readUInt32LE();
          if (size > 8 * 1024 * 1024) {
            finish("native-response-too-large");
            return;
          }
          if (buffer.length < size + 4) return;
          const message = JSON.parse(buffer.subarray(4, size + 4).toString());
          buffer = buffer.subarray(size + 4);
          if (message.id !== id || message.jsonrpc !== "2.0") continue;
          if (message.error) {
            finish("native-catalog-rejected");
            return;
          }
          const tools = message.result?.tools;
          if (
            !Array.isArray(tools) ||
            tools.length > 1000 ||
            tools.some(
              (t) =>
                !t ||
                typeof t.name !== "string" ||
                typeof t.namespace !== "string" ||
                !t.inputSchema,
            )
          ) {
            finish("native-catalog-shape-unverified");
            return;
          }
          const read = tools.filter((t) => t.name === "read_thread");
          const identifier = (value: unknown): value is string =>
            typeof value === "string" &&
            /^[a-zA-Z_][a-zA-Z0-9_:-]{0,79}$/.test(value);
          const definitions = tools
            .filter((t) => identifier(t.name) && identifier(t.namespace))
            .slice(0, 200)
            .map((tool) => {
              const properties = tool.inputSchema?.properties;
              const argumentKeys =
                properties &&
                typeof properties === "object" &&
                !Array.isArray(properties)
                  ? Object.keys(properties).filter(identifier).slice(0, 50)
                  : [];
              return {
                name: tool.name,
                namespace: tool.namespace,
                argumentKeys,
                required: Array.isArray(tool.inputSchema?.required)
                  ? tool.inputSchema.required.filter(
                      (key: unknown) =>
                        identifier(key) && argumentKeys.includes(key),
                    )
                  : [],
              };
            });
          finish("native-catalog-received", {
            nativePeerAdmissionVerified: true,
            nativeCatalogAccessVerified: true,
            nativeToolDefinitionCount: tools.length,
            definitions,
            definitionSummaryTruncated: definitions.length !== tools.length,
            readThreadDefinitionPresent: read.length === 1,
            readThreadHasHostIdArgument:
              read.length === 1 && !!read[0].inputSchema.properties?.hostId,
            historyListDefinitionPresent: tools.some(
              (t) => t.name === "list_threads",
            ),
            waitThreadsDefinitionPresent: tools.some(
              (t) => t.name === "wait_threads",
            ),
          });
          return;
        }
      } catch {
        finish("native-response-invalid");
      }
    });
  });
}
