import { z } from "zod";
import { readExecutorInvocation } from "../../shared/executor-context.js";

export const probePolicySchema = z
  .object({
    version: z.literal(1),
    callerHostId: z.literal("local"),
    callerThreadId: z.uuid(),
    confirmation: z.string().min(20).max(100),
    reportPath: z.string().min(1),
    nativeCatalog: z
      .object({
        confirmation: z.string().min(20).max(100),
        attemptPath: z.string().min(1),
        reportPath: z.string().min(1),
        timeoutMs: z.literal(10000),
        desktopRuntimeRequired: z.literal(true).optional(),
      })
      .strict()
      .optional(),
    hostCatalog: z
      .object({
        confirmation: z.string().min(20).max(100),
        attemptPath: z.string().min(1),
        reportPath: z.string().min(1),
        hostId: z
          .string()
          .min(1)
          .max(200)
          .refine(
            (value) =>
              !["local", "durable"].includes(value) &&
              !/[\x00-\x1f\x7f*]/.test(value),
          ),
        interestThreadId: z.uuid(),
        limit: z.literal(10),
        timeoutMs: z.literal(15000),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ProbePolicy = z.infer<typeof probePolicySchema>;

/** Presence-only diagnostic. No service client, fallback identity or native RPC. */
export function inspectExecutor(
  policy: ProbePolicy,
  input: unknown,
  meta: unknown,
  pipeEnvironmentProvided: boolean,
) {
  const args = z.object({ confirmation: z.string() }).strict().safeParse(input);
  const denied = (reason: string) => ({
    admitted: false as const,
    reason,
    nativeServiceAccessVerified: false,
    nativeConnections: 0,
    nativeRpcCalls: 0,
  });
  if (!args.success || args.data.confirmation !== policy.confirmation)
    return denied("confirmation-required");
  const parsed = readExecutorInvocation(meta);
  if (!parsed.ok) return denied(parsed.reason);
  const context = parsed.context;
  if (context.threadId !== policy.callerThreadId)
    return denied("caller-not-designated");
  if (context.hostId && context.hostId !== "local")
    return denied("caller-host-not-local");
  return {
    admitted: true as const,
    scope: "designated-local-caller-metadata-presence-only",
    callerAllowlistMatched: true,
    callerHostEvidence:
      context.hostId === "local" ? "explicit-local" : "not-provided",
    executorTurnMetadataProvided: context.turnMetadataProvided,
    turnIdProvided: !!context.turnId,
    toolCallIdProvided: !!context.callId,
    pipeEnvironmentProvided,
    // These are request assertions. Presence/matching is not cryptographic trust.
    metadataAuthenticityVerified: false,
    nativePeerAdmissionVerified: false,
    nativeServiceAccessVerified: false,
    nativeConnections: 0,
    nativeRpcCalls: 0,
  };
}
