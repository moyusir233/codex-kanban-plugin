import type { TurnUsage } from "../shared/types.js";
import { desktopTurns } from "./user-input.js";

const milliseconds = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Display timing already present in the owner's snapshot; never load history.
 * No token total, user-input timestamp or completion timestamp is inferred. */
export function sshTurnTiming(
  state: any,
  observedAt: string,
): TurnUsage | null {
  if (!state || !Number.isFinite(Date.parse(observedAt))) return null;
  try {
    if (state.turnHistory?.kind === "canonical") {
      const islands = state.turnHistory.history?.islands;
      // An older search island cannot identify the current/latest turn.
      if (
        !Array.isArray(islands) ||
        islands.at(-1)?.newerBoundary?.status !== "exhausted"
      )
        return null;
      const lastEntry = islands.at(-1)?.entries?.at(-1);
      const last = state.turnHistory.history?.entitiesByKey?.[lastEntry?.value];
      if (lastEntry && typeof (last?.turnId ?? last?.id) !== "string")
        return null;
    }
    const turns = desktopTurns(state);
    const turn = turns.at(-1);
    const tail = Array.isArray(state.turns) ? state.turns.at(-1) : null;
    // Do not fall back to a previous turn behind an unbound live placeholder.
    if (
      (Array.isArray(state.turns) &&
        state.turns.length > 0 &&
        typeof (tail?.turnId ?? tail?.id) !== "string") ||
      !turn
    )
      return null;
    const id = turn.turnId ?? turn.id;
    if (
      typeof id !== "string" ||
      !id.length ||
      !["inProgress", "completed", "interrupted"].includes(turn.status)
    )
      return null;
    const start = milliseconds(turn.turnStartedAtMs)
      ? new Date(turn.turnStartedAtMs)
      : null;
    const startedAt =
      start && Number.isFinite(start.getTime()) ? start.toISOString() : null;
    if (
      turn.status === "inProgress" &&
      (state.threadRuntimeStatus?.type !== "active" ||
        (start && start.getTime() > Date.parse(observedAt)))
    )
      return null;
    const durationMs =
      turn.status !== "inProgress" && milliseconds(turn.durationMs)
        ? turn.durationMs
        : null;
    // Without terminal duration, the UI would subtract start from observation
    // time and mislabel time since completion as execution time.
    if (turn.status !== "inProgress" && durationMs === null) return null;
    if (startedAt === null && durationMs === null) return null;
    return {
      id,
      status: turn.status,
      startedAt,
      completedAt: null,
      updatedAt: observedAt,
      durationMs,
      tokens: null,
      userInput: null,
    };
  } catch {
    // Malformed history is unknown, not an excuse to read remote rollout paths.
    return null;
  }
}
