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
| Connected-host/session discovery | Same installed JS as earlier research; explicit registration remains a fallback | Authorized ordinary-plugin host/catalog export, bounded live scope |
| Metadata/state/filter recovery | Synthetic MCP/UI tests; exact-pair live source/distribution MCP reached IPC but received zero snapshots | Loaded owner, real snapshot and observer-only recovery |
| Model/mode/goal/unread/questions | Existing validated snapshot mapping; successful CLI seed is setup only | Actual plugin-route live lifecycle, no read-state/auto-answer side effects |
| Usage/input/timing/history | Existing bounded snapshot semantics; unknown data stays unknown | Verified host service for missing fields, current-version live evidence |
| Existing approval/answer kinds | Per-pair default denial and owner/lifetime fixtures | Separate exact-pair action plan and original-request completion evidence |
| Session/artifact navigation | Existing denial retained | Installed route effects and separate navigation approval |
| Current Git/artifacts/review | No remote path reaches a local reader | Correct-host export and authorized live test workspace reads |
| Collections/monitoring | Synthetic host isolation, persistence and stale clearing | Real plugin-route acceptance at separately authorized scope |
| Local/version/package compatibility | Installed ASAR fingerprint, Node 23 iterator fix, isolated native fixtures and byte provenance; full run 292 pass / 0 fail / 0 skip | Live installation remains untouched; other Node versions not exercised here |

No new routed catalog adapter or full-parity capability is claimed. Supplying a
new session and installed app does not create the missing ordinary-plugin export.

## Distribution provenance

- Build ID: `b54bb729a0a806150aad3668420fcb8a7fcc9c7bfc5c27cb7393caf8e7874564`
- Runtime server SHA256: `dff1497dd283f6153856e0a7863895501d46a43e798e36415d98e967f14f5f7e`
- Runtime UI SHA256: `e45b0d7dd2d07cfa7945592ddd90b274caddcefda76c0ff2f10924676d90b521`
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

Repository distribution and offline ZIP are build outputs, not an installed
plugin update. No Desktop lifecycle or installation rollback is required.
