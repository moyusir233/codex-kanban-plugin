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
