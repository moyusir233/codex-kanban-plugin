import { desktopTurns } from "./user-input.js";

/** Only the received newest turn can describe current SSH activity. No reads. */
export function sshSnapshotTurn(state: any): any | null {
  if (!state) return null;
  try {
    if (state.turnHistory?.kind === "canonical") {
      const islands = state.turnHistory.history?.islands;
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
    const tail = Array.isArray(state.turns) ? state.turns.at(-1) : null;
    // An unbound live placeholder must not expose an older turn's information.
    if (
      Array.isArray(state.turns) &&
      state.turns.length > 0 &&
      typeof (tail?.turnId ?? tail?.id) !== "string"
    )
      return null;
    return desktopTurns(state).at(-1) ?? null;
  } catch {
    return null;
  }
}
