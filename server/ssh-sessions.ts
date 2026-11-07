import { z } from "zod";
import { sessionKey, type SessionTarget } from "../shared/session-identity.js";
import type { Thread } from "../shared/types.js";
import type { DesktopConversation } from "./desktop-ipc.js";

const targets = z
  .array(
    z
      .object({
        hostId: z
          .string()
          .min(1)
          .max(200)
          .refine((id) => id !== "local"),
        threadId: z.uuid(),
      })
      .strict(),
  )
  .max(50);

/** Explicit targets only: SSH config aliases are not connected-host discovery. */
export function sshSessionTargets(value: string | undefined): SessionTarget[] {
  if (value === undefined) return [];
  const parsed = targets.parse(JSON.parse(value));
  return [
    ...new Map(
      parsed.map((target) => [
        sessionKey({ id: target.threadId, hostId: target.hostId }),
        target,
      ]),
    ).values(),
  ];
}

/** Map only explicitly registered ordinary sessions; observed subagents stay excluded.
 * Metadata is display-only. Never stat, resolve, or run Git against remote cwd. */
export function sshSessionThread(
  target: SessionTarget,
  conversation?: DesktopConversation,
): Thread {
  const state = conversation?.state;
  const collaboration =
    state?.latestCollaborationMode?.mode ?? state?.latestCollaborationMode;
  const rawStatus = state?.threadRuntimeStatus;
  const runtime =
    rawStatus &&
    ["active", "idle", "notLoaded", "systemError"].includes(rawStatus.type)
      ? {
          type: rawStatus.type,
          ...(Array.isArray(rawStatus.activeFlags)
            ? {
                activeFlags: rawStatus.activeFlags.filter(
                  (flag: unknown) => typeof flag === "string",
                ),
              }
            : {}),
        }
      : null;
  const cwd = typeof state?.cwd === "string" ? state.cwd : "";
  const timestamp =
    typeof state?.updatedAt === "number" && Number.isFinite(state.updatedAt)
      ? new Date(state.updatedAt)
      : null;
  return {
    id: target.threadId,
    hostId: target.hostId,
    observationOnly: true,
    title: typeof state?.title === "string" ? state.title : target.threadId,
    cwd,
    project: `${target.hostId} · ${cwd || "Remote project unknown"}`,
    git: null,
    updatedAt:
      timestamp && !Number.isNaN(timestamp.getTime())
        ? timestamp.toISOString()
        : "",
    lastUserMessageAt: null,
    kind: state?.source?.subAgent ? "agent" : "user",
    model: typeof state?.latestModel === "string" ? state.latestModel : null,
    reasoningEffort:
      typeof state?.latestReasoningEffort === "string"
        ? state.latestReasoningEffort
        : null,
    collaborationMode: ["plan", "default"].includes(collaboration)
      ? collaboration
      : null,
    goalStatus: [
      "active",
      "paused",
      "blocked",
      "usageLimited",
      "budgetLimited",
      "complete",
    ].includes(state?.threadGoal?.status)
      ? state.threadGoal.status
      : null,
    turnUsage: null,
    unread:
      typeof state?.hasUnreadTurn === "boolean" ? state.hasUnreadTurn : null,
    runtime,
    runtimeAt: conversation ? new Date().toISOString() : null,
    fresh: !!conversation,
    error: null,
    pendingUserInput: false,
    waitingSince: null,
    waitingQuestion: null,
  };
}
