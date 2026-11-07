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
| `webview/assets/async/220821.b4a9b80850.js` | `518b237feac8cceb1d04dfc8f11d2327694892e32108f3c9eb740822a56bf1da` |
| `webview/assets/async/884779.bf167971f9.js` | `cdc694546dbda438c12a929e692381b1c8c186d4cad9257e69ad5b4163d72d84` |
| `webview/assets/async/110557.82455d0c53.js` | `b482ebb230fd3580c79da876ad699f0f82cdb47f04eab49a49188fd9c69732a3` |
| `webview/assets/async/352584.4e31b3db06.js` | `f9eecbd4ae11f154a6f5fe400b71103fbd34dda3e18a4d0a72769108c033167b` |

The four additional renderer entries above were checked against ASAR-header
size, SHA256 and per-block SHA256 metadata. This verifies extraction consistency,
not the whole archive's signature or the user's installed version.

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
renderer query. Renderer182735 route parser `O` retains host identity; `nf3G`
prioritizes the route host in ordinary page context. Renderer110557 `Pyfq` obtains
that context host, sets the explicit `tl5a.Nu` override and retains the active
conversation. `Bl6U.qX` prioritizes the `JBvZ.Cg` override over discovered hosts
and its local fallback. A host-aware link therefore exists, but URL parsing
alone does not prove a safe read-only navigation API or effect ordering.

The additional trace establishes reasons to keep it disabled:

1. Renderer884779 `KVWT`, `aF` enables resume by default and calls `osEl.Y`.
   The `J.N` query helper in this page is **`t0b9`**, which reads
   `realtimeVoiceHostId`, not ordinary `hostId`. It must not be mistaken for
   proof of ordinary host routing; the context/override chain above is separate.
2. Renderer220821 `osEl` calls the effective host manager's
   `resumeConversation({intent: "open", ...})`, with
   `showThreadGoalResumeConfirmation: false`. The hook has retry/hydration
   effects. bootstrap854's `resumeConversation` and resume coordinator can read
   catalog/config/history, set an owner role when none exists and call
   `thread/resume`. An already resumed owner/follower can take a shorter path;
   that does not make opening an arbitrary session read-only. The board does
   not invoke this route to get more metadata.
3. Renderer884779's ordinary transcript installs `eDYz.I` (renderer182735)
   unless hidden/covered. That watcher handles unread/turn state and invokes
   `markConversationAsRead` on the effective host. bootstrap854's
   `acknowledgeRead` / `sendReadReceipt` can perform `thread/read` and conditional
   `thread/readState/update` with the expected revision. This is an ordinary
   page effect, not merely a command-menu mark-read action.
4. Renderer110557 / renderer352584 `Pyfq` calls
   `requestUserInputAutoResolution.setConversationPresented` on mount/cleanup
   and records key/pointer activity. bootstrap854 `edO` routes it through
   `getConnection(hostId)`. bootstrap339 **`class rm`** tracks non-blocking
   `item/tool/requestUserInput` and eligible MCP elicitation requests. In the
   configured foreground-inactivity mode, presentation/activity can restart
   a 60-second inactivity wait, followed by a 90-second countdown; background
   handling and explicit elicitation timeouts differ. On timeout it calls
   `submitEmptyResponse` or `declineMcpElicitation`. The connection constructor
   binds these to `handleClientResponse` with `{answers: {}}` or
   `{action: "decline", ...}`. This does **not** auto-approve command/file
   requests and does not prove every pending question will time out. It shows
   that opening participates in an existing automatic-response lifecycle, not
   just a display lifecycle. The timer may already run without opening.

No link was opened, timer executed, owner acquired or live session changed in
this research. No Desktop setting was inspected or modified. Installed-version
compatibility, hydration ordering and the complete effects remain unverified.
There is no demonstrated link flag that suppresses all of these effects. Do not
invent one or offer a purported read-only link by changing URL shape.

The fork now also rejects **explicit remote** `codex:` routes in the generic
artifact/manual-link opener before handshake, tool/network calls or native link
dispatch. It checks every `hostId` / `realtimeVoiceHostId` query value, including
duplicates. Manual and detected remote links have no navigable href; SSH cards
and collection buttons remain disabled with a side-effect warning. Local links
and ordinary HTTP(S) artifacts retain their existing behavior. This is not a
claim to inspect destinations behind arbitrary web redirects or every private
future Desktop route. Source/distribution UI and host-bridge fixtures exercise
the denial; no navigation opt-in or new control method is added.

### Usage and input evidence boundary

bootstrap854 `thread/tokenUsage/updated` stores token usage on the conversation
and the `tokenUsageInfo` selector exposes it only for a resumed conversation.
This trace still does not bind the value to the board's current turn ID, so it
cannot safely populate the existing per-turn cumulative token counter. Opening
or resuming to populate it would violate snapshot-only observation. The user
message reconciliation anchors `openingUserMessageId`, `clientUserMessageId`
and `itemsPagination.oldestUserInput` describe message identity/content, not a
demonstrated user-send timestamp. Turn timing is not a substitute. No extra
history read or free-form message extraction was added; these fields stay unknown.

## Feasible parity path and unfinished work

Reuse the Desktop-owned host services, not a competing backend:

- **Implemented:** default-denied host-scoped existing confirmation/answer UI,
  exact wire versions, owner/revision/connection verification, stale/duplicate
  handling, MCP environment forwarding and source/distribution UI fixtures.
- **Already implemented:** explicit observation, non-live filtering metadata
  retention, host-safe collections and local filesystem exclusion. Snapshot-only
  validated turn timing now supplements these without loading history.
- **Unfinished:** supported catalog/host discovery export, installed-version
  and authorized live acceptance, a navigation route with acceptable verified
  effects (known hydration/read/auto-response risks now documented), usage/input
  timestamps and host-routed Git/artifacts/review/monitoring. **Full parity is not
  established or implemented by this commit.**

Remote operations have not been tested live. Separate explicit authorization for
the named test session is needed. Fixtures do not establish support in every
Desktop version or for disconnected/unloaded owners. The private protocol may
change; default read-only is the starting point for acceptance.
