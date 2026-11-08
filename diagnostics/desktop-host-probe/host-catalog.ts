import { open } from "node:fs/promises";
import {
  DesktopCatalogError,
  DesktopHostCatalog,
} from "../../server/desktop-host-catalog.js";
import { inspectExecutor, type ProbePolicy } from "./probe.js";

export async function probeHostCatalog(
  policy: ProbePolicy,
  input: unknown,
  meta: unknown,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const denied = (reason: string) => ({
    admitted: false,
    attemptConsumed: false,
    reason,
    hostCatalogAccessVerified: false,
    nativeServiceAccessVerified: false,
    nativeRpcRequests: 0,
  });
  if (!policy.hostCatalog) return denied("host-catalog-not-authorized");
  const grant = policy.hostCatalog;
  const admission = inspectExecutor(
    { ...policy, confirmation: grant.confirmation },
    input,
    meta,
    !!process.env.CODEX_APP_TOOLS_PIPE_PATH,
  );
  if (!admission.admitted) return denied(admission.reason);
  if (
    !admission.executorTurnMetadataProvided ||
    !admission.turnIdProvided ||
    !admission.toolCallIdProvided
  )
    return denied("executor-context-required");
  try {
    const claim = await open(grant.attemptPath, "wx", 0o600);
    try {
      await claim.writeFile(
        JSON.stringify({
          purpose: "single-exact-host-history-catalog",
          startedAt: new Date().toISOString(),
        }),
      );
    } finally {
      await claim.close();
    }
  } catch {
    return denied("attempt-already-used-or-unavailable");
  }
  const common = {
    admitted: true,
    attemptConsumed: true,
    scope: "single-configured-host-history-catalog",
    nativeServiceAccessVerified: false,
    fullSshParity: false,
    remoteWriteRequests: 0,
    titlesPathsAndSummariesStored: false,
    turnHistoryRequested: false,
  };
  try {
    const catalog = new DesktopHostCatalog({
      allowedHosts: [grant.hostId],
      allowedLocalCallers: [policy.callerThreadId],
      pipePath: process.env.CODEX_APP_TOOLS_PIPE_PATH,
      desktopRuntime: process.env.CODEX_MCP_NODE_PATH,
      timeoutMs: grant.timeoutMs,
    });
    const page = await catalog.read(
      meta,
      { hostId: grant.hostId, limit: grant.limit },
      signal,
    );
    // Real rows stay only in this call's memory. The report contains no row text/IDs/cursor.
    return {
      ...common,
      reason: "host-catalog-received",
      hostCatalogAccessVerified: true,
      nativeServiceAccessVerified: true,
      verifiedNativeService: "list_threads/history-on-one-configured-host",
      returnedRowsHostMatched: true,
      resultCount: page.sessions.length,
      containsTestSession: page.sessions.some(
        (session) => session.id === grant.interestThreadId,
      ),
      hasMore: page.nextCursor !== null,
      runtimeFreshness: page.runtimeFreshness,
      nativeConnections: page.transport.connections,
      nativeRpcRequests: page.transport.rpcRequests,
      nativeCancelRequests: page.transport.cancelRequests,
    };
  } catch (error) {
    return {
      ...common,
      reason:
        error instanceof DesktopCatalogError
          ? error.code
          : "host-catalog-unavailable",
      hostCatalogAccessVerified: false,
      nativeConnections:
        error instanceof DesktopCatalogError ? error.transport.connections : 0,
      nativeRpcRequests:
        error instanceof DesktopCatalogError ? error.transport.rpcRequests : 0,
      nativeCancelRequests:
        error instanceof DesktopCatalogError
          ? error.transport.cancelRequests
          : 0,
    };
  }
}
