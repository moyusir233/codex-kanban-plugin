# Desktop SSH parity research — 2026-11-07

## Scope and provenance

Static analysis only: no installed application, session storage or live session
operation. This environment has no Desktop bundle; the user's installed version
is unknown. Retrieved the public official archive into `/tmp` without running it:

- Feed: https://persistent.oaistatic.com/codex-app-prod/appcast.xml
- Archive: https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.1103.41825.zip
- Version **26.1103.41825**, build **25679**, archive length **815395836**.
- HTTP ranges retrieved the ZIP directory and complete compressed `app.asar`
  entry. Uncompressed length **761286174**, CRC32 **0f77e0c7** matches the ZIP
  directory. CRC is integrity checking, not authentication.
- `app.asar` SHA256:
  `766faa8a3da8f6d6902c751d5b6b29395a6c5bf3c966ef7f8ca3f629d931df85`.
- Public Homebrew `Casks/c/chatgpt.rb` lists archive SHA256
  `0b30ce5cac787893bf574b549b1d32cf363f21302935538acd369c668df2fd1f`.
  The **whole archive** was not downloaded or hash/signature verified. These
  range reads do not establish signed-bundle or installed-version verification.

Extracted files used (SHA256):

| Relative ASAR path | SHA256 |
| --- | --- |
| `.vite/build/early-bootstrap.js` | `51417153f9c6a87d193b991c92641a0287b1a19f12525b18702ec6aff9bcf5df` |
| `.vite/build/early-bootstrap-339-8cdc01c6be3ea2a7.js` | `187cb5bbfa90ce938c00c836a8fcdd9e45671e583246e74f37ec911cddf9e7ce` |
| `.vite/build/early-bootstrap-854-5239e17d5abd99b3.js` | `87dae7cce26fcfe2d6f42d5bd955615fc73338023961174d37978093166ee893` |
| `webview/assets/async/182735.d1916dd704.js` | `5a3b8967a8021db6a7a09c1f1ce7ec247d17e98c16b9156b5e7dd8a086e3268e` |
| `webview/assets/async/497066.82fad48b12.js` | `2ba588450e9173dded25dca0163c917f5375237f868f3cdf82df3e488462946f` |
| `webview/assets/async/783456.a3b05bbbc0.js` | `f2d60b65162e707ce6871c193c7bb105b8dba82a3b7de72c18724accaaba79e9` |

No downloaded Desktop code is committed or shipped. These hashes and lookup
anchors describe reproducible evidence, not a stable public API contract.

## Verified owner transport (static, not live acceptance)

In bootstrap339 search `requestThreadFollower`, `async sendRequest`, `function uc`
and `thread-owner-discovery`:

1. Follower requests use the existing owner's Desktop IPC with
   `{hostId: hostId === "local" ? undefined : hostId, targetClientId}`.
2. `sendRequest` places hostId on the **envelope**, separate from params.
3. bootstrap `function ib` increments follower versions by one when an envelope
   host is present. Remote command/file/question replies use v2, start-turn v3,
   steer-turn v2. Targeted owner discovery stays v1 with hostId inside params.
4. `uc` checks discovery host equals its bound host and the pair has an owner;
   follower handlers use envelope host and the host/thread owner role.
5. Replies identify `method`, `handledByClientId`, `resultType` and result.
6. bootstrap854 dispatches approvals, user-input, start and steer to the existing
   owner's methods. No second SSH app-server or ownership acquisition is needed.

This fork implements this route for the existing local confirmation UI behind
explicit registered-pair opt-in. No startup action probe, automatic execution or
retry, arbitrary RPC relay or unsolicited action is added. Targeted discovery
happens only after submission; owner, revision, connection and pair are rechecked.
Local envelopes and omitted-host replies keep their existing behavior.

Complete-history loading also exists, but changes in-memory history and publishes
a revision. It is not called just to enrich the board. Settings, compaction,
interrupt and queued-message methods are not allowed merely because they exist.

## Discovery is a separate unsolved interface problem

Renderer182735 uses `rpc.subscribe({type:"host",key:{hostId},field:"recentThreads"})`
and host/thread-scoped list identities. bootstrap854 has internal subscriptions,
a Desktop-owned host registry and catalog. This proves **Desktop** has discovery,
not that external plugins can access it through the Unix IPC transport.

The external owner registration in bootstrap339 exposes targeted owner discovery
and follower methods, not a session/host listing. A bounded registration/string
audit did not establish an external catalog route; this is not proof that none
exists in every version. Do not send guessed RPC names, scrape restricted catalog
files or run a second SSH backend as a substitute for Desktop's connection.
Explicit pair registration remains required pending a supported export/transport.

### Additional app-tools evidence (not a plugin catalog implementation)

The same public ZIP also contains `plugins/codex-app-tools/server.mjs`, retrieved
as a complete ZIP entry and CRC checked, never executed or installed. SHA256:
`f0f5230dd7701317bc9dafb589901eb24fc504d9b92520169e934278ed5a82e8`.
Its `.mcp.json` SHA256 is
`f1fa5c72fb610a448a59fa9a4bcba75553afa908394d0fce179602d9658e2495`.
The full-archive/signature and installed-version qualifications above also apply.

- The bundled server obtains a catalog with native-pipe `tools/list`. Calls use
  `CODEX_APP_TOOLS_PIPE_PATH` and require **executor-provided** thread metadata.
  Without it, the server rejects the call. Caller thread/turn, source, call ID,
  namespace and host are distinct from the target host/thread in tool arguments.
- bootstrap854 `lk`, `ld`, `dynamic_app_tools_peer_rejected` and the pipe startup
  establish schema validation, a 0600 socket and a socket peer authorizer.
  On Darwin the authorizer can load the native authorization addon according to
  package build flavor. It is not evidence that arbitrary plugin Node processes
  are accepted. No environment/security switch is changed to bypass this.
- Renderer182735 `canCallTool` can read an uncached **caller** thread before
  dispatch. `ysE7` obtains the caller turn/context and claims tool-call execution.
  This is not a stateless catalog endpoint usable with fabricated identities.
- Renderer182735 `MCYz` and `pKpp`, then renderer497066 `case A.En`, `case f.cq`,
  `tO`, `tk`, `tS` and `case A.Dv`, establish actual handlers rather than names
  alone. `list_hosts` reports **enabled configured** remote hosts/workspace
  roots, not connected-only hosts. History-mode `list_threads` checks the
  connected-host registry and calls the existing host manager's `thread/list`.
  Recent mode can also read pinned-thread summaries and queries ChatGPT data;
  it is inappropriate for a bounded named-session-only experiment. `read_thread`
  routes host-aware metadata/turn reads; it is not used to enrich this board.
- bootstrap854 `Desktop MCP did not bind a loopback port` and
  `ssh_websocket_v0.desktop_mcp_setup_failed` establish a separate per-host
  bearer-authenticated MCP endpoint and verified SSH forwarding. That config
  is supplied to Desktop-managed executors, not an established external Kanban
  API. No token/socket scan, credential reuse or second backend is attempted.

These are viable Desktop-side building blocks. Safe automatic discovery still
needs an explicitly exported read-only, host-scoped catalog channel or authorized
executor integration that does not borrow a business/test session's identity.
No discovery probe or installed app-tools enablement was performed.

## Snapshot-only turn timing

bootstrap854 `bG` normalizes `turnStartedAtMs` into numeric milliseconds and
preserves `durationMs`. Its turn conversion maps app-server `startedAt` into that
field; `turn/completed` updates status and duration. These fields are already
published with conversation snapshots. `finalAssistantStartedAtMs` can mark
final-answer start, so it must **not** serve as completion time.

This fork now displays validated snapshot start time for an active in-progress
turn and explicit terminal duration for completed/interrupted turns. It uses
only the existing snapshot, with no history loading or remote file access.
Canonical history must reach the newest exhausted boundary, live overlay wins,
and unbound placeholders/malformed timing stay unknown. A terminal turn without
duration does not use observation time as its execution end. Disconnect and
cache restoration clear this timing; only a live replacement restores it.

`thread/tokenUsage/updated` stores `latestTokenUsageInfo` on the conversation,
not a demonstrated per-turn total. Tokens, free-form input and last-user-message
time remain unknown. Turn start can represent synthesized/automatic continuation
and is not proof of user-message time. Local readers and behavior are unchanged.

## Navigation evidence and side effects

bootstrap339 parses `codex://threads/<uuid>?hostId=...` into a host-aware
`localConversation`. bootstrap854's matching case forwards hostId into the
renderer query. Renderer182735 retains host identity in parsing/route state.
A host-aware link therefore exists.

However, complete hydration/resume/read-state effects and installed-version
compatibility remain unverified. Remote links stay disabled rather than being
enabled from URL shape alone. No links were opened during research.

## Feasible parity path and unfinished work

Reuse the Desktop-owned host services, not a competing backend:

- **Implemented:** default-denied host-scoped existing confirmation/answer UI,
  exact wire versions, owner/revision/connection verification, stale/duplicate
  handling, MCP environment forwarding and source/distribution UI fixtures.
- **Already implemented:** explicit observation, non-live filtering metadata
  retention, host-safe collections and local filesystem exclusion. Snapshot-only
  validated turn timing now supplements these without loading history.
- **Unfinished:** supported catalog/host discovery export, installed-version
  and authorized live acceptance, navigation side-effect verification, usage/input
  timestamps and host-routed Git/artifacts/review/monitoring. **Full parity is not
  established or implemented by this commit.**

Remote operations have not been tested live. Separate explicit authorization for
the named test session is needed. Fixtures do not establish support in every
Desktop version or for disconnected/unloaded owners. The private protocol may
change; default read-only is the starting point for acceptance.
