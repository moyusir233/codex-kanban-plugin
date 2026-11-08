# Desktop acceptance preparation — 2026-11-08

This is a follow-up to [the handoff](SSH-PARITY-HANDOFF.md), not a full-parity
completion report. Real disposable target identifiers are kept in the local,
ignored acceptance record rather than published as fixtures.

## Established environment

| Component | Verified value |
| --- | --- |
| Checkout | Existing local clone, switched from clean `main` to `feat/ssh-session-observer`; starting HEAD `461d1b8` |
| Desktop machine | macOS 26.1 / 25B78, Darwin arm64 |
| Application | `/Applications/ChatGPT.app`, 26.1103.41825 / build 25679 |
| Installed `app.asar` SHA256 | `766faa8a3da8f6d6902c751d5b6b29395a6c5bf3c966ef7f8ca3f629d931df85` |
| Bundled CLI | `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`, `0.167.0-alpha.3.2` |
| Bundled CLI SHA256 | `a636331ed87605efc4cf84028ac2884a75363f9d10ead63cffb57ea0016d486e` |
| Development Node / npm | `v23.11.0` / `10.9.2`; `node:sqlite`, global WebSocket and ZIP tools available |
| User-authorized SSH environment check | `my-dev-box`: Linux x86_64, `/usr/bin/codex`, `0.167.0` |

The installed ASAR is byte-identical to the earlier public archive's ASAR.
This closes the installed-JavaScript-version gap, **not** the ordinary-plugin
export gap. It does not verify all unpacked/native code or application signatures.
No repeated whole-bundle audit, renderer attachment, private-pipe identity reuse,
security override or guessed catalog request was performed. The conventional
local IPC path was initially checked with `stat`; a later explicitly scoped MCP
check connected successfully, as described below. IPC connectivity does not
prove a connected SSH host, a session owner or usable snapshots.

Dependencies were installed with the lockfile. The configured registry returned
404 for a locked font archive; `npm ci --registry=https://registry.npmjs.org
--replace-registry-host=always` succeeded without changing the lockfile or npm
configuration. npm reported three dependency advisories (one low, two high);
no unreviewed dependency upgrade or `audit fix` was applied.

## Disposable session and authorization boundary

The user explicitly authorized creating one new remote disposable conversation,
using provider `traex`, and acknowledged the minimal seed's possible model cost.
After configuration isolation failed, the user authorized using the existing
complete remote configuration and identified their normal `~/.bashrc` setup.

- A new temporary remote workspace and thread ID were allocated. No second
  thread, remote app-server/daemon or SSH configuration was created.
- Non-interactive SSH and `bash -lc` did not provide the provider's configured
  credential environment variable. Only its presence was checked; no credential
  value was exposed or copied, and no auth store was read.
- Initialization attempts before the interactive-shell correction failed. They
  are not acceptance evidence and their model usage was not reported.
- Through the user-designated interactive bash startup, the **same new thread**
  returned `KANBAN_SSH_DISPOSABLE_READY`, exited 0, and reported 4,588 input and
  12 output tokens. No tool-call item was observed. The remote process used a
  read-only sandbox and explicit `model_provider="traex"`.
- The complete configuration also emitted nonfatal authentication/configuration
  error items; the successful seed does not verify every configured integration.
- No timeout replay was performed. The earlier error-aborted attempt and the
  authentication-failed continuation are distinguished from the successful seed.
- The user supplied another conversation's link to identify the exact Desktop
  host, but had not found the new conversation in Desktop's list. Only the host
  parameter was used; the other conversation was never opened or subscribed to.
  The SSH alias was not substituted for `hostId`. The new target's loaded owner
  remains unknown.
- The earlier approved bounded, exact-pair read-only subscription was performed
  after confirming this host identity. No catalog enumeration, confirmation/
  answer, navigation, plugin installation, app restart or business-session
  operation was performed. No local counterpart or executor caller is designated.
  The historical excluded thread remains untouched.

**Later authorized step:** the user explicitly approved opening only the new
SSH test pair with macOS `open`, followed by bounded observation, and then
confirmed the opened test conversation with a screenshot. The agent did not use
the screenshot's other sidebar conversations. Results are recorded below; the
earlier zero-snapshot check is retained as history, not the current outcome.

CLI creation is an explicitly authorized setup action, **not** evidence that
Kanban reused Desktop's connected-host transport. The temporary remote workspace
and disposable conversation remain available for the user's next acceptance step;
they were not archived or deleted automatically.

## Scoped live MCP transport check — incomplete gate

After a synthetic harness preflight, used the **actual source and distribution
MCP configs/startup scripts** in sequence. Each used a separate empty temporary
HOME/CODEX_HOME, the verified running Node, no WebSocket override and no action
opt-in. This prevents StatusBridge from reading real local session indexes,
global state, history or artifacts. Only plugin-owned temporary data was written.

A private Unix-socket proxy connected to the existing Desktop IPC. It admitted
only normal `codex-kanban` initialization, following/unfollowing the one approved
pair and negative client-discovery replies. Unrelated incoming broadcasts were
discarded without retaining or logging their metadata. There was no native
caller identity, first-party bridge or security bypass. No remote backend was
started. This is an IPC admission/filter proxy, not a competing app-server.

| MCP subprocess | Desktop IPC | Target snapshots | Fresh/runtime | Following / unfollowing |
| --- | --- | --- | --- | --- |
| Source | Connected | 0 | false / unknown | 1 / 1 |
| Checked-in distribution | Connected | 0 | false / unknown | 1 / 1 |

Each live phase observed for approximately 15 seconds; there was one isolated
observer restart between them, within the approved 60-second maximum. Both phases
asserted the same single target, read-only controls, no confirmation requests and
no local metadata. Unsubscribing left freshness false. Both subprocesses and proxy
sockets were closed, subscriptions released and temporary profiles removed.
There were no admission violations. Sanitized ordered events are retained only
in the ignored local acceptance record. The harness exited 2 to represent the
unavailable target, **not a passing live acceptance test**.

This verifies ordinary MCP-process access to the existing Desktop IPC route,
not a loaded SSH conversation, v11 snapshot compatibility, connected-host
discovery or full parity. Zero snapshots do not prove the conversation is absent,
nor identify why Desktop's list did not show it. No open/resume was attempted to
obtain a snapshot. Actual Desktop UI/installed-plugin acceptance remains undone;
the MCP/UI fixture tests are a separate synthetic layer.

### After the approved exact-pair open — limited live success

The already running `/Applications/ChatGPT.app` was targeted once with the exact
host-routed test URL. No new message, approval or setting change was sent. This
was separately authorized navigation, with known possible resume, ownership,
read-state and pending-question lifecycle effects; it is not a read-only action.
The remote CLI's earlier missing-environment error remained in that disposable
conversation alongside the later successful seed; it was not treated as a new
authentication failure or a reason to change credentials.

The same isolated source/distribution MCP harness then reported:

| Phase / UTC time | Evidence |
| --- | --- |
| Source, 07:49:33 | Connected; initially unknown target |
| Source, 07:49:34 | Actual v11 snapshot, revision 4 |
| Source, 07:49:35 | Fresh, idle, `gpt-6.1-sol`, unread false, actions disabled |
| Source, 07:49:48 | Unfollow sent; freshness cleared; observer stopped |
| Distribution, 07:49:48 | Actual v11 snapshot, revision 5; same owner |
| Distribution, 07:49:50 | Fresh, idle, same model/unread, actions disabled |
| Distribution, 07:50:03 | Unfollow sent; freshness cleared; observer stopped |

Each phase received one snapshot, followed/unfollowed once, and had zero proxy
admission violations. Temporary profiles were removed. The title did not provide
a usable name beyond the thread ID; no title was invented. Remote Git stayed
null and local indexes remained inaccessible. No host catalog or unrelated
thread was queried. The private record contains the exact approved pair and a
sanitized owner hash; no raw conversation or business metadata is published.

This establishes the existing explicit observer's **basic current-version
read-only MCP path for this one Desktop-loaded SSH pair**, including releasing
and recreating the isolated observer. It does not establish all filter/field
lifecycle gates, active/waiting/error transitions, action completion, installed
Kanban UI behavior, automatic discovery, or full host-service parity. Opening
preceded the snapshots; this does not prove the unique cause of the earlier
missing snapshots or why the conversation was absent from the list.

## Ordinary-plugin host-service entrypoint experiment — verified narrow route

The user separately approved a uniquely named temporary local test plugin and
designated a new disposable local Desktop caller. No business caller is borrowed.
Source lives under `diagnostics/desktop-host-probe/`, built by
`scripts/package-desktop-host-probe.mjs`; it is excluded from the normal Kanban
distribution. Its first stages did not change production startup forwarding;
the subsequent fork integration is separately described below.

The first stage checks only allowlisted incoming executor metadata and whether
the normal executor supplies a private pipe environment variable. It never
prints the variable, reads a pipe/auth store, connects to native services or
calls `read_thread`. Missing/conflicting callers and explicit non-local host
assertions fail closed. Only a presence/status report is written to the specific
test artifact path. Presence/matching never claims cryptographic authenticity,
peer admission or service access. The installed process permits at most three
admitted checks and generates no fallback caller/turn/call IDs.

Verified before installation:

- Five dedicated regressions, including real MCP stdio, an available synthetic
  native socket that receives **zero connections**, and rejection/safe report
  behavior.
- A real bundled-CLI temporary profile can install this plugin, register its
  exact `kanban_desktop_executor_probe` tool, remove only this selector, and
  leave a fixture Kanban installation's config/server bytes unchanged.
- The planned local install path and exact plugin/marketplace removal commands
  were tested. Output refuses to overwrite an existing build directory.

The user-approved real installation uses a random plugin and marketplace name,
the verified Node's absolute path, and only the pipe variable in `env_vars`.
Its installed bytes match the inspected generated package. The existing Kanban
selector, Node settings, security policies and Desktop lifecycle were not changed
by the agent. The exact test-only path/rollback commands and real local caller
are in ignored `work/desktop-host-probe-20261108/` records, not committed policy.

Later user-triggered results (UTC):

| Stage | Evidence |
| --- | --- |
| 08:07:45, presence | Designated local caller matched; executor/turn/call and pipe fields present; no native connection/RPC; host hint absent; no cryptographic authenticity claimed |
| 08:21:33, NVM runtime | One connection/request, peer closed; no retry or session read; exact closure reason not established |
| 08:37:36, normal Desktop-injected runtime | Direct `exec`, runtime match, native peer/catalog success; 60 sanitized tool definitions; one connection/request, no session read |
| 11:46:37, approved host directory | Actual `tools/list` plus `tools/call list_threads`, history/codex, one exact configured host, limit=10, archived=false; ten rows, all matching host; no cancel, turn-history request or remote write request |

The last page did not include the new SSH test thread and had `hasMore=true`.
This is **not** evidence the thread is missing; no extra page was fetched.
Business titles/cwd/summary were authorized only for in-memory processing in that
test and were not emitted/stored by the probe. The report contains only counters,
binding and presence flags. Platform-owned normal call records are not controlled
by the probe. The native call uses fresh executor-provided caller/turn/call IDs,
not a borrowed business caller, prior observation identity or generated fallback.

The user manually refreshed/restarted Desktop as needed; the agent did not. An
initial missing-tool/TypeError produced no admitted read marker. After explicitly
allowing platform tool discovery, the user invoked the exact discovered qualified
path successfully. A guessed short JavaScript name is not a native RPC result.

The approved `read_thread` was never sent: static tracing found cross-host
fallback. `wait_threads` has a similar failure path and was also excluded. The
usable narrow route is **configured connected-host history metadata**, not a
general app-server relay or an automatically connected-host catalog.

After the tests the agent removed only the unique temporary plugin (0.0.4) and
its own marketplace using the tested CLI rollback; cache-path removal was
confirmed. All reports/attempt markers remain in ignored local workspace. The
original Kanban, its Node configuration, and both test conversations remain
untouched by cleanup. No pending test installation remains. Full parity is not
complete.

## Fork integration — experimental configured-host directory

`server/desktop-host-catalog.ts` now implements the real narrow native adapter.
It pins the reviewed installed ASAR, requires the actual Desktop-injected runtime,
a private user-owned socket and real executor field assertions for allowlisted
local callers. It advertises/checks the known method, then sends only exact-host
history/codex listing. It never exposes a general RPC selector, `read_thread`,
wait, resume, actions or remote filesystem interpretation. Returned host/UUID,
duplicate identity and host-bound cursor checks fail closed; summary/project
annotations are discarded. Listed state explicitly does not establish freshness.

The normal fork MCP/UI now has an **off-by-default** opt-in:
`TASKBOARD_DESKTOP_CATALOG` is a strict JSON grant with UUID `grantId`, exact
`hosts`, exact `localCallers`, UTC `expiresAt` (maximum 24 hours ahead), optional
`pageSize` (default 10, maximum 50) and `maxReads` (default 1, maximum 100).
No wildcard/caller inference or automatic read is enabled. Only a matching
request caller sees directory availability. Each admitted attempt consumes a
persistent bounded budget under plugin-owned `kanban/desktop-catalog-grants/`;
slot files store only hashed invocation identity. Budget, duplicate protection
and uncertainty survive process restart. Expiry/abort clears or rejects results.

Startup stages only policy + native pipe + normal runtime, never caller IDs,
verification material or peer/security switches. Without opt-in, transport fields
are removed before Node. With opt-in, startup directly execs only the actually
injected compatible runtime; missing/incompatible runtime cannot trigger NVM,
app-path, ancestry, download or trust-policy fallback. Existing installed Kanban
startup/Node settings were not edited.
These gates apply to the board MCP entry, not the separately invoked existing
Desktop CLI forwarder. Full regression exposed that shared-bootstrap distinction:
the first gate incorrectly stripped Desktop's own first-party/auxiliary stdio
environment. The forwarder is now explicitly exempted, preserving its original
environment and source/distribution automation/auxiliary tests. The board entry
still strips inherited caller/trust fields and requires its explicit native grant.

The settings dialog has a separate **SSH directory (not live)** view with manual
host selection and paging, no navigation/approval controls and no automatic
candidate registration/observation. Rows never become ordinary board cards or
enter local Git/artifact/history readers. Type/classification remains unknown.
Rows are not persisted; host/grant/caller-context changes, hiding and closing
clear/abort them. Directory availability is stripped from snapshot cache. If an
MCP App callback lacks true executor turn/call context it is rejected, not supplied
with invented IDs; a user can discover/call `taskboard_desktop_catalog` from an
authorized model turn instead. Preview HTTP has no native fallback.

Source and distribution MCP/UI fixtures exercise the built HTML, normal startup,
real MCP routing and a private synthetic native socket, including host switch,
manual reads, no auto-observation/navigation, budget exhaustion, redaction and
cache clearing. The first UI run exposed an initial passive-effect abort race;
scope reset now uses a layout effect before interaction. Both packaged/source
fixtures pass. **The new normal board UI has not been live-installed or accepted**;
the real directory acceptance above was the scoped diagnostic invoking the same
adapter. No broader live scope is inferred.

## Implemented preparation and compatibility fix

`tests/fixture-env.ts` constructs a minimal environment instead of inheriting the
user's process environment. Native CLI/launcher/approval fixtures use temporary
HOME/CODEX_HOME/cwd and the running, verified Node. Only explicitly supplied
synthetic pipe/endpoint values may be added. The in-process native IPC fixture
also explicitly disables SSH registrations/actions. MCP resource fixtures no
longer pass the real HOME, and the HTTP fixture uses the same isolated helper.
A subprocess regression supplies synthetic poisoned identity, private pipe,
credential, transport, Node injection, proxy and marketplace values and verifies
none are inherited. This changes tests, not production startup allowlists.

`npm test` now enters `tests/run-fixtures.ts` so the **test runner itself** also
uses a temporary HOME/CODEX_HOME and minimal environment, including for in-process
StatusBridge tests. `TASKBOARD_CODEX_CLI` is the only optional inherited test
selector; no live target, private pipe, identity, credential or marketplace-source
override is forwarded. To run a subset safely, use e.g.
`npm test -- tests/local-data-window.test.ts tests/fixture-env.test.ts`.

The first full macOS run exposed a pre-existing local-reader compatibility
failure on Node 23: the temporary SQLite statement behind a chained `.iterate()`
could be finalized during iteration. Keeping the prepared statement referenced
fixes the existing 500-conversation/unread-window regression without changing
selection, local read scope or SSH routing. The narrow regression also passes
with a 1 MiB V8 nursery. Source was rebuilt into the checked-in distribution;
the installed plugin and its Node configuration were not changed.

## Capability/evidence matrix

The detailed local/SSH baseline remains in [SSH-SESSIONS.md](SSH-SESSIONS.md).

| Gate | Current evidence | Unfinished |
| --- | --- | --- |
| Connected-host/session discovery | Real native one-host history directory passed; configured-host adapter and optional MCP/UI now implemented, source/distribution fixtures pass | Automatic connected-host discovery; live acceptance of normal board directory/pagination |
| Metadata/state/filter recovery | Synthetic MCP/UI tests; after authorized open, exact-pair source/distribution MCP received v11 snapshots, renewed freshness and cleared it on release | Broader live state/filter lifecycle and installed UI acceptance |
| Model/mode/goal/unread/questions | Live idle/model/unread observed for one loaded pair; title remains unknown; synthetic supported-field mapping | Broader live lifecycle/fields; read-state side effects of open kept separate from observation |
| Usage/input/timing/history | Existing bounded snapshot semantics; unknown data stays unknown | Verified host service for missing fields, current-version live evidence |
| Existing approval/answer kinds | Per-pair default denial and owner/lifetime fixtures | Separate exact-pair action plan and original-request completion evidence |
| Session/artifact navigation | Existing denial retained | Installed route effects and separate navigation approval |
| Current Git/artifacts/review | No remote path reaches a local reader | Correct-host export and authorized live test workspace reads |
| Collections/monitoring | Synthetic host isolation, persistence and stale clearing | Real plugin-route acceptance at separately authorized scope |
| Local/version/package compatibility | Installed ASAR fingerprint, Node 23 iterator fix, isolated native fixtures, packaged native directory, byte provenance and final 313-test pass | Original Kanban unchanged, temporary probe removed; other Desktop builds unsupported until reviewed |

A real narrow routed directory adapter is now implemented and its primitive was
verified live. This does not claim a complete generic host-service export, normal
UI live acceptance or full SSH capability parity.

## Distribution provenance

- Build ID: `c7541a6898fa9b95313d2f5e28d9a2f0dc143379d63dcd7205d99e4ced2bbd79`
- Runtime server SHA256: `d2455f2b5fef1bc4d451d6f202e1e96bd411806f4b592f98314f3a8673e9ba64`
- Runtime UI SHA256: `45fc5198ae618a7db9ffefed813ad1203fa6e59e028c783f165b00285de5f5c3`
- `npm run package:plugin` and the standalone package-provenance test pass.
- The initial isolated full run reported 290 pass / 1 fail / 0 skip (the failing
  test file did not report both child tests). After the iterator fix, the second
  full run reported **292 pass / 0 fail / 0 skip**, about 188.6 seconds, including
  all macOS-native CLI fixtures. These use local fake models/pipes, not the real
  Desktop SSH backend or provider credentials.
- The new isolated `npm test` entrypoint additionally passed 14 focused tests
  with synthetic invalid SSH registrations/actions and a poisoned private pipe
  in its parent environment. Its final full run also passed **292 tests, no
  failures or skips**, in about 189.0 seconds.
- `npm run check`, standalone package provenance and `git diff --check` pass.
- With the five host-probe regressions, full `npm test` reports **297 pass / 0
  fail / 0 skip**, about 190.6 seconds. The subsequently expanded targeted
  native-registration regression also passes. A later 303-test run correctly
  failed one provenance check because updated SSH docs had not yet been copied;
  packaging regenerates them rather than relaxing that assertion.
- After the shared-bootstrap fix and source/distribution regeneration, the final
  full `npm test` reports **313 pass / 0 fail / 0 cancelled / 0 skipped**, with
  `duration_ms=188571.816333` (about 188.6 seconds). This includes both directory
  MCP/UI fixtures, grant/budget/startup cases and the existing Desktop automation
  and auxiliary stdio regressions. These isolated passes do not establish normal
  board UI live acceptance or complete SSH parity.
- Implementation and regenerated distribution are committed as `ef0e52c`
  (`feat(ssh): add scoped Desktop host directory via native services`) on
  `feat/ssh-session-observer`; this report records the completed regression
  separately. Only this acceptance report changed after that final full run;
  runtime bytes and the build ID above remain unchanged.

Repository distribution and offline ZIP are build outputs, not an installed
Kanban update. Temporary probe/marketplace removal has completed; no installation
or lifecycle rollback is pending. Test conversations and reports are retained.
