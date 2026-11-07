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
  retention, host-safe collections and local filesystem exclusion.
- **Unfinished:** supported catalog/host discovery export, installed-version
  and authorized live acceptance, navigation side-effect verification, usage/input
  timing and host-routed Git/artifacts/review/monitoring. **Full parity is not
  established or implemented by this commit.**

Remote operations have not been tested live. Separate explicit authorization for
the named test session is needed. Fixtures do not establish support in every
Desktop version or for disconnected/unloaded owners. The private protocol may
change; default read-only is the starting point for acceptance.
