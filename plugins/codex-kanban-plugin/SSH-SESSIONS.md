# SSH sessions (fork-only, experimental)

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
  verified host-routed read/list transport to the desktop-owned SSH app-server.
- [Remote connection documentation](https://learn.chatgpt.com/docs/remote-connections#connect-to-an-ssh-host)
  describes desktop SSH alias discovery and starting a remote app-server over
  SSH. Aliases do not prove active connections or enumerate sessions. This
  fork does not read SSH config or establish connections.
- IPC `client-discovery-request` is routing/capability discovery, not a session
  listing. The observer still answers `canHandle: false`. No guessed listing
  methods are sent. Automatic discovery remains unsupported, not simulated.
- Static analysis of the official public Desktop **26.1103.41825 / 25679**
  bundle establishes a host-routed follower owner-action transport. Remote
  follower requests use top-level `hostId` and the local method version plus
  one. See [research evidence and provenance](SSH-PROTOCOL-RESEARCH.md).
  This supersedes the earlier lack-of-bundle conclusion, but not the absence
  of a verified external SSH session/connected-host catalog route.
- Host-aware `codex://threads/<id>?hostId=...` navigation exists in this bundle.
  Its complete load/resume/read effects and compatibility with the user's
  installed version remain unverified. SSH card and collection navigation
  stay disabled; no navigation or ownership-acquisition experiment was performed.

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

## Explicit owner-action opt-in (new; not live-tested)

With `TASKBOARD_SSH_ACTIONS` unset, all registrations remain read-only. The new
variable accepts the same strict JSON pair array as `TASKBOARD_SSH_SESSIONS`,
must be a subset of it, and defaults to `[]`. This is a process feature opt-in,
not a Desktop security setting or permission to conduct live testing. No wildcard
host authorization or automatic target registration exists. Do not add business
sessions merely to experiment. Source and packaged MCP configs forward it.

For opted-in pairs only, the board handles the **same implemented local
confirmation kinds**: command decisions, file-change decisions with observed
previews, structured answers and async question replies. Async replies can start
or steer a turn through the current owner: this opt-in explicitly enables
execution of submitted answers. No general send/resume, interrupt, settings,
permissions-change or arbitrary RPC tool is added.

Controls require a fresh v11 ordinary loaded (`active`/`idle`) snapshot. Every
remote submission verifies its owner through targeted read-only discovery,
checks the same connection, snapshot revision and pair remain valid, then sends
the host-routed method/version. Successful remote responses must identify the
expected method/owner. Revision churn fails closed and may require refreshing,
never automatic action retry. Reply IDs, confirmations and pending IPC are
host-scoped. Disconnect, owner loss, unsubscribe, patch gaps, cache restoration
and unknown runtime remove capabilities; only a live replacement can restore
them. The UI labels the host and action opt-in.

Acknowledgement is not completion: the existing removal/answer-echo check is
retained. Duplicate clicks cannot resubmit the same request. Timeout/uncertainty
requires checking the original Desktop conversation, not blindly retrying. The
legacy WebSocket approval relay rejects remote identity before any request. No
remote cwd is read locally, including workspace roots in submitted answers.

## Safe display and plugin-owned collections

When the already-received snapshot includes the known Desktop turn-history
shape, the mapper reuses the local structured-question parser for a short
unanswered-question title and the latest failed-turn marker. It does not fetch
history. Approval payloads and controls require the separate explicit action
opt-in above. Missing
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
| Open session | Existing local deep link | Host route established statically; disabled pending load/read compatibility checks |
| Discovery | Existing local index/listing | No verified read-only Desktop SSH listing route |
| Approvals/answers/execution | Existing local controls | Default denied; explicit per-pair opt-in uses current owner, fixture-tested only |
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
  `TASKBOARD_SSH_SESSIONS` and `TASKBOARD_SSH_ACTIONS` from the executor environment. Startup fixtures use
  those actual configs and shell arguments, not an injected transport bypass.
- The checkout’s marketplace catalog points at the fork’s
  `feat/ssh-session-observer`, not upstream `main`. Existing installed plugin
  processes and saved marketplace refs are untouched; they still run their
  previously installed code. The upstream install examples in the README are
  not instructions to install this fork.

## Safety and unfinished work

- Remote approval/reply execution is default denied and requires explicit
  per-pair process opt-in. Resume, ownership acquisition and unverified
  navigation remain unavailable. Packaging does not perform installation or actions.
- Remote cards are excluded from local Git reads, artifacts and monitoring links.
  Default read-only registrations do not expose actionable approval payloads.
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
  Action fixtures additionally cover MCP startup allowlists, built UI decisions,
  wire versions, same-ID hosts, owner/revision races, legacy relay denial, async
  start/steer and duplicates. No new live observation or session mutation was performed.
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
