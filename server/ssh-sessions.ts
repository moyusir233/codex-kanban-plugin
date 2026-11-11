import { z } from "zod";
import { sessionKey, type SessionTarget } from "../shared/session-identity.js";
import type { Thread } from "../shared/types.js";
import type { DesktopConversation } from "./desktop-ipc.js";
import { sshTurnTiming } from "./ssh-turn-timing.js";
import { sshSnapshotGitInfo } from "./ssh-git-info.js";
import {
  desktopInputState,
  desktopTurns,
  unansweredInput,
} from "./user-input.js";

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

/** Registered pairs enable user-submitted actions by default; an explicit list
 * restricts them (including [] for read-only). Never register new targets or
 * grant access to a whole host. */
export function sshActionTargets(
  value: string | undefined,
  registered: SessionTarget[],
): SessionTarget[] {
  const allowed = new Set(
    registered.map((target) =>
      sessionKey({ id: target.threadId, hostId: target.hostId }),
    ),
  );
  const actions =
    value === undefined
      ? registered.map((target) => ({ ...target }))
      : sshSessionTargets(value);
  if (
    actions.some(
      (target) =>
        !allowed.has(
          sessionKey({ id: target.threadId, hostId: target.hostId }),
        ),
    )
  )
    throw new Error(
      "TASKBOARD_SSH_ACTIONS must be a subset of TASKBOARD_SSH_SESSIONS.",
    );
  return actions;
}

/** Map only explicitly registered ordinary sessions; observed subagents stay excluded.
 * Metadata is display-only. Never stat, resolve, or run Git against remote cwd. */
export function sshSessionThread(
  target: SessionTarget,
  conversation?: DesktopConversation,
): Thread {
  const state = conversation?.state;
  const observedAt = new Date().toISOString();
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
  // Reuse the known Desktop history shape, without fetching history or exposing
  // approval/reply controls. Missing/malformed history cannot prove an answer.
  let question: string | null = null;
  let pending = false;
  let failed = false;
  if (state) {
    try {
      const input = unansweredInput(desktopInputState(state));
      pending = !!input;
      question = input?.summary ?? null;
      failed = desktopTurns(state).at(-1)?.status === "failed";
    } catch {
      // Preserve unknown display rather than guess from free-form text.
    }
  }
  const waiting =
    runtime &&
    ["active", "idle"].includes(runtime.type) &&
    (pending ||
      runtime.activeFlags?.some(
        (flag: string) =>
          flag === "waitingOnApproval" || flag === "waitingOnUserInput",
      ));
  return {
    id: target.threadId,
    hostId: target.hostId,
    observationOnly: true,
    title: typeof state?.title === "string" ? state.title : target.threadId,
    cwd,
    project: `${target.hostId} · ${cwd || "Remote project unknown"}`,
    git: null,
    snapshotGit:
      conversation &&
      !state?.source?.subAgent &&
      ["active", "idle"].includes(runtime?.type ?? "")
        ? sshSnapshotGitInfo(state?.gitInfo)
        : null,
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
    turnUsage: sshTurnTiming(state, observedAt),
    unread:
      typeof state?.hasUnreadTurn === "boolean" ? state.hasUnreadTurn : null,
    runtime,
    runtimeAt: conversation ? observedAt : null,
    fresh: !!conversation,
    error:
      failed && conversation
        ? {
            message: "本轮执行失败，请在原对话查看详情。",
            at: new Date().toISOString(),
          }
        : null,
    pendingUserInput: pending,
    waitingSince: null,
    waitingQuestion: waiting && !failed ? question : null,
  };
}
