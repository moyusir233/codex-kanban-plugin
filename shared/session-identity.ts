/** Omitted host IDs are local for compatibility with existing snapshots. */
export type SessionTarget = { hostId: string; threadId: string };
export type SessionIdentity = { id: string; hostId?: string };

export function isLocalSession(session: { hostId?: string }): boolean {
  return session.hostId === undefined || session.hostId === "local";
}

/** Keep legacy local IDs; encode remote pairs without delimiter collisions. */
export function sessionKey(session: SessionIdentity): string {
  return isLocalSession(session)
    ? session.id
    : `ssh:${JSON.stringify([session.hostId, session.id])}`;
}

/** Decode only canonical remote association keys. Local UUIDs remain unchanged. */
export function remoteSessionTarget(key: string): SessionTarget | null {
  if (!key.startsWith("ssh:")) return null;
  try {
    const pair: unknown = JSON.parse(key.slice(4));
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      typeof pair[0] !== "string" ||
      !pair[0].length ||
      pair[0].length > 200 ||
      pair[0] === "local" ||
      typeof pair[1] !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        pair[1],
      )
    )
      return null;
    const target = { hostId: pair[0], threadId: pair[1] };
    return sessionKey({ hostId: target.hostId, id: target.threadId }) === key
      ? target
      : null;
  } catch {
    return null;
  }
}

/** Remote references (even malformed ones) must never reach local data readers. */
export function localThreadIds(keys: string[]): string[] {
  return keys.filter((key) => !key.startsWith("ssh:"));
}
