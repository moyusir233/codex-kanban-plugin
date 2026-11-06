# SSH session observation (fork-only, experimental)

Base: `51a96afdbdd8d427c02bb03c4a0cabacc6ac0e25`.

## Discovery evidence and limits

- The supplied bounded observation of `my-dev-box` thread
  `01a1b141-997b-79f3-8974-417f64be1d25` received desktop IPC
  `thread-stream-state-changed` protocol v11. This supports observation of a
  **known pair**, not enumeration of sessions or connected hosts.
- [App-server documentation](https://developers.openai.com/codex/app-server/)
  supports `thread/list` (paginated stored threads), `thread/loaded/list`
  (in-memory IDs), and `thread/read` (metadata without resume). These belong
  to an app-server connection, not the desktop IPC router. This fork has no
  verified host-routed transport to the desktop-owned SSH app-server.
- [Remote connection documentation](https://learn.chatgpt.com/docs/remote-connections#connect-to-an-ssh-host)
  describes desktop SSH alias discovery and starting a remote app-server over
  SSH. Aliases do not prove active connections or enumerate sessions. This
  fork does not read SSH config or establish connections.
- IPC `client-discovery-request` is routing/capability discovery, not a session
  listing. The observer still answers `canHandle: false`. No guessed listing
  methods are sent. Automatic discovery remains unsupported, not simulated.

## Explicit opt-in

Set this variable for the fork server process on the same machine as Desktop:

```sh
TASKBOARD_SSH_SESSIONS='[{"hostId":"my-dev-box","threadId":"01a1b141-997b-79f3-8974-417f64be1d25"}]'
```

Supply exact desktop host IDs and existing UUIDs yourself. This is a process
environment variable, not a persisted desktop or installed plugin change.
It defaults to no remote targets; maximum 50 pairs; malformed input fails
startup. The example configures a target, not authorization for live testing.

Opening the fork board leases observation of configured targets. The UI
renews visible/candidate subscriptions; hidden/closed views release them
on an empty observation set or after the existing 15-second lease. A desktop
owner must provide the snapshot. No response, missing/unknown runtime,
disconnect, unsubscribe, revision gap, unsupported remote version, or owner
loss means **unknown**, never idle/done. A replacement v11 snapshot restores
freshness; a remote version mismatch does not disconnect local observation.

Cards display host, title, literal remote cwd, supported runtime/flags, and
available model/mode/goal/unread metadata. Missing fields remain unknown.
Local schema v1 and omitted host IDs stay compatible. Remote IPC/cache/React
identities use `(hostId, threadId)`. Remote paths are never local paths.

## Safety and unfinished work

- Remote approval, reply, execution, resume, ownership acquisition, and
  unverified deep-link navigation are disabled, not offered behind a toggle.
- Remote cards are excluded from local Git reads, artifacts, monitoring links,
  and work-item associations. Approval payloads are not board confirmations.
  Existing local operations stay unchanged.
- No remote history, last-user-message time, usage, Git, artifacts, pending
  question parsing, or cross-host work items. Native waiting flags only;
  missing flags do not prove the absence of questions.
- Host IDs are caller-provided, not independently verified as SSH hosts.
- Desktop IPC v11 is an observed private protocol, not a stable public API.
  Snapshot availability depends on the desktop owner. Automatic discovery
  needs a verified read-only listing capability and host-routed transport.
- Tests use synthetic Unix sockets, temporary databases, and browser host
  fixtures. No new live observation or session mutation was performed.
- No session storage reads, security changes, host/plugin installation,
  website deployment, publication, merge, or upstream PR is needed.
