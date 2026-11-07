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
- Rechecked the official app-server and remote-connection documentation for
  this extension. `thread/read` does not resume/load a thread, but that fact
  does not establish a route through Desktop's existing SSH connection. The
  repository's observer exposes only following/snapshot messages; its owner
  requests are local-only. No Desktop application bundle was available in
  this Linux checkout for further static verification.
- The existing local card opens `codex://threads/<id>` through the MCP host's
  `openLink`. Neither available code nor the checked documentation establishes
  a host-aware equivalent or its loaded/read effects. SSH card and collection
  navigation therefore remain disabled with an explanation. No guessed links,
  remote owner requests, or live navigation experiments were attempted.

## Explicit opt-in

Set this variable for the fork server process on the same machine as Desktop:

```sh
TASKBOARD_SSH_SESSIONS='[{"hostId":"my-dev-box","threadId":"01a1b141-997b-79f3-8974-417f64be1d25"}]'
```

Supply exact desktop host IDs and existing UUIDs yourself. This is a process
environment variable, not a persisted desktop or installed plugin change.
It defaults to no remote targets; maximum 50 pairs; malformed input fails
startup. The example configures a target, not authorization for live testing.
Registration declares an ordinary session for display, not a verified runtime
state. A snapshot identifying a subagent overrides that classification and
keeps it out of ordinary-session filters. Unregistered broadcasts are ignored.

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
After snapshot loss, the UI retains only the previous title, cwd, project,
and kind as non-live filter metadata for the same registered host/thread pair.
Runtime, freshness, unread and pending-confirmation state are invalidated.
This keeps project/title-filtered observation candidates eligible for recovery;
a new live snapshot replaces the cached metadata.
Observation candidates retain the local top-15 policy plus up to 50 registered
SSH candidates matching project/title/collection search, independent of runtime,
read and attention filters. Newer local threads cannot evict a disconnected SSH
candidate. Hidden pages and non-board views still release observation; this is
not an always-on background watcher or a guarantee that Desktop sends a snapshot.

## Safe display and plugin-owned collections

When the already-received snapshot includes the known Desktop turn-history
shape, the mapper reuses the local structured-question parser for a short
unanswered-question title and the latest failed-turn marker. It does not fetch
history, expose approval payloads, or create answer/approval controls. Missing
or malformed history is not proof that there are no questions. No waiting-start
timestamp, user-message timestamp, usage or free-form assistant text is invented.
Question/error display is cleared on snapshot loss.

SSH cards can join/create/edit the plugin's existing collections. Associations
use canonical `ssh:["hostId","threadId"]` keys in the existing `threadIds` array;
local UUIDs and pre-existing records are unchanged. The picker, card tags, search,
runtime counts and linked metadata use the same host-scoped keys. Collection
status/checklists remain manual, not inferred session completion. Saving them
writes only the plugin-owned `kanban/workspace.sqlite`, never the Codex session.

Only explicitly configured remote references receive snapshot summaries; storing
a reference does not register, subscribe to or resume that thread. Unavailable
references remain removable. Local metadata/artifact readers exclude even
malformed `ssh:` keys before any local lookup or worker scheduling. SSH cwd is
display-only; remote history, Git, automatic artifacts and review remain disabled.
Remote collection links cannot navigate. No database migration is required; older
upstream clients do not understand SSH association keys, so editing mixed-host
collections should use this fork rather than an older installed package.

| Capability | Local behavior (unchanged) | SSH in this fork |
| --- | --- | --- |
| Candidates/metadata | Local index and existing Desktop/shared-backend routes | Explicit host/thread registration, Desktop v11 snapshot only |
| Runtime/unread/model/mode/goal | Existing local sources | Observed supported fields only; loss means unknown |
| Question/failure display | Existing Desktop/history parsing | Known shape from received snapshot only; read-only |
| Collections | Existing plugin-owned records | Host-scoped association, picker, tags and search |
| Open session | Existing local deep link | Disabled: route and read/load effects unverified |
| Discovery | Existing local index/listing | No verified read-only Desktop SSH listing route |
| Approvals/answers/execution | Existing local controls | Disabled, including after reconnect |
| Usage/input timing/Git/artifacts/review/monitoring | Existing local behavior | Unavailable; no remote filesystem interpretation |

## Source, repository distribution, and installed plugin

- `npm run build` builds the fork source into ignored `dist/` files.
- `npm run package:plugin` additionally rebuilds the checked-in self-contained
  `plugins/codex-kanban-plugin/runtime/` bundle, its MCP config and docs, and
  ignored offline marketplace/ZIP files under `releases/`. It does not install
  or publish anything. The runtime’s `TASKBOARD_BUILD_ID` hashes server bytes,
  UI bytes and icon bytes; provenance tests check those bytes, source UI parity,
  startup allowlists and offline artifact parity.
- Source and repository-distribution `.mcp.json` explicitly forward
  `TASKBOARD_SSH_SESSIONS` from the executor environment. Startup fixtures use
  those actual configs and shell arguments, not an injected transport bypass.
- The checkout’s marketplace catalog points at the fork’s
  `feat/ssh-session-observer`, not upstream `main`. Existing installed plugin
  processes and saved marketplace refs are untouched; they still run their
  previously installed code. The upstream install examples in the README are
  not instructions to install this fork.

## Safety and unfinished work

- Remote approval, reply, execution, resume, ownership acquisition, and
  unverified deep-link navigation are disabled, not offered behind a toggle.
- Remote cards are excluded from local Git reads, artifacts and monitoring links.
  Approval payloads are not board confirmations.
  Existing local operations stay unchanged.
- No remote history fetching, last-user-message time, usage, Git or artifacts.
  Native waiting flags and recognized snapshot questions only; missing data
  does not prove the absence of questions.
- Host IDs are caller-provided, not independently verified as SSH hosts.
- Desktop IPC v11 is an observed private protocol, not a stable public API.
  Snapshot availability depends on the desktop owner. Automatic discovery
  needs a verified read-only listing capability and host-routed transport.
- Tests use synthetic Unix sockets, temporary databases, and browser host
  fixtures, including the real built UI in a synthetic DOM connected to MCP
  subprocesses launched from source/distribution configs. Nested/non-scalar
  patch path regressions reject property-key coercion before patch application.
  Recovery fixtures include 16 newer local threads under running-only and
  attention filters, project/title filters, owner loss and transport reconnect.
  Collection fixtures exercise real UI/MCP writes to temporary plugin data,
  identical local/remote IDs and multiple-host persistence isolation.
  No new live observation or session mutation was performed.
- No session storage reads, security changes, host/plugin installation,
  website deployment, publication, merge, or upstream PR is needed.

## Smallest next Desktop acceptance step

First verify the tested source/repository build ID, not just the plugin version.
The existing Mac installation and its plugin-specific Node 24 configuration are
untouched and still run their installed bytes. Any separate installation/update
or live disconnect/navigation test needs its own user-controlled acceptance.
Using only the named test session, start with a visible, read-only board check of
title/model/unread and disabled action/navigation controls. Do not send a message
or resume a thread to obtain metadata. Then, if separately authorized, verify a
disconnect/reconnect with 15+ local candidates and running/attention filters;
state must become unknown and recover only on a replacement snapshot. Fixture
success does not prove reliability of the current Desktop private protocol.
