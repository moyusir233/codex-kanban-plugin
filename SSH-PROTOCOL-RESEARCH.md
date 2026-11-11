# Desktop SSH parity research — 2026-11-07

## Automatic import follow-up — 2026-11-11 (static only; not implemented)

The user clarified that installation followed by manual SSH links is not the
desired feature: the board should automatically import Desktop's existing SSH
sessions. The current `0.2.5` / `8204812` installation does **not** do that.
An explicitly configured, expiring directory page is not automatic import, and
removing its opt-in or fingerprint guard would not supply the missing route.

The actually installed app is now **26.1103.60933 / build 25894**, ASAR SHA256
`a77588b2dcfa9b394d722dd8c2c8b13d3a09bacd49c839cc715245742dba6048`.
Only application code was inspected: no business directory, session store,
credentials, native pipe, live host or conversation was queried. Extracted
entries were checked against ASAR whole-file and block integrity metadata.
Private extraction/evidence lives under ignored `work/desktop-autoload-20261111/`.

| Entry | SHA256 | Relevant static finding |
| --- | --- | --- |
| `webview/assets/async/497066.82fad48b12.js` | `2ba588450e9173dded25dca0163c917f5375237f868f3cdf82df3e488462946f` | Byte-identical listing handler; `case f.cq`, `case A.En`, `tA`, `tO`, `tk`, `tS` |
| `webview/assets/async/182735.7f13786b92.js` | `119afcc814fe83e733d5b494d3201afe203c51b8d059998b2a8dbf3ed03ccd85` | Tool schemas, execution admission and native-call claim |
| `.vite/build/early-bootstrap-815-e030c49be4b9c405.js` | `67c10f58239453fba595f83917fda3756ac2f40ef87fe5f70dd143d4ecef6ad1` | Native protocol registration, `callMcpTool`, `_P.tryClaimExecution` |
| `webview/assets/async/63396.ec0c2499c7.js` | `4b82dc6a50234aa59dadd58e21e335cf333ab6b473163575d0f3c42b442a0412` | MCP App `i3` tool-call forwarding |

Concrete boundaries before choosing an importer:

1. `list_hosts` still enumerates **enabled configured** hosts and fetches their
   approved workspace roots. Its `{currentHostId, hosts}` result has no established
   connected-only status. It is not a verified passive connected-host export.
2. `list_threads` **history** mode still requires a selected host (otherwise it
   defaults to the caller/local host). `tO` checks connected state/client before
   exact-host `thread/list`. This remains a narrow building block, not automatic
   host discovery. The native projection's `kind: "codex"` does not by itself
   establish ordinary-vs-subagent classification for automatic board promotion.
3. `list_threads` **recent** mode calls `tA`, which queries connected Codex hosts,
   local/pinned state **and ChatGPT**; its source/host options are not applied as
   remote-only filters in this branch. Missing pinned metadata can cause
   cross-manager `getThreadListSummary` / `readThread(includeTurns:false)` reads.
   Filtering returned rows cannot undo those broader reads. Replacing the strict
   history call with recent mode is not a scope-preserving fix.
4. The inspected MCP App forwarding passes `threadId` and existing `_meta` to
   `callMcpTool`. It does not itself add native executor turn/call identities.
   Whether a real board callback receives those from another layer remains
   **unverified**, not guaranteed by fixtures that inject synthetic metadata.
   A background refresh cannot borrow an earlier model turn or invent IDs.
5. Native execution claims the tuple `(hostId, threadId, turnId, callId)` once:
   `_P.tryClaimExecution` rejects a repeated claim. A multi-step host-list/page
   importer therefore cannot assume it may replay one real invocation as several
   native tool executions. JSON-RPC request IDs and executor call identities are
   different things. Valid context/subcall semantics need a verified route.

No scope-correct automatic-import transport has been established by this static
follow-up. A usable solution still needs verified connected-host enumeration,
host-scoped ordinary-session listing and legitimate board/executor integration,
then automatic board registration/subscription with bounded lifecycle behavior.
Do not implement inert success scaffolding, bypass native trust/version checks,
read restricted catalog caches, attach a trusted renderer or start a competing
SSH backend to conceal that missing prerequisite. Installation and per-thread
manual registration remain insufficient acceptance. Live catalog scope must be
agreed before testing; no such broader read was performed in this follow-up.

The earlier research below is historical evidence. Its absence-of-installed-app
statements and reviewed fingerprint describe their recorded date, not the
current environment.

**Installed-environment follow-up (2026-11-08):** the actual macOS Desktop
26.1103.41825 / 25679 ASAR matches the SHA256 below. Earlier statements about
the absent Desktop describe the original research environment. See
[Desktop acceptance preparation](https://github.com/moyusir233/codex-kanban-plugin/blob/feat/ssh-session-observer/SSH-DESKTOP-ACCEPTANCE.md) for the verified
versions, disposable-session setup and still-unfinished integration/live gates.
This match does not establish a new ordinary-plugin host-service export.
The later authorized exact-pair open produced v11 snapshots through the actual
source/distribution MCP route. That is bounded explicit-observer evidence, not
catalog or complete host-service parity. The separate ordinary-plugin executor
probe remains an integration experiment, not a routed adapter.

## Additional installed/live findings — 2026-11-08

The separately approved ordinary-plugin experiment in
[Desktop acceptance](https://github.com/moyusir233/codex-kanban-plugin/blob/feat/ssh-session-observer/SSH-DESKTOP-ACCEPTANCE.md)
now establishes real executor metadata and pipe delivery, and successful native
`tools/list` through the normal Desktop-injected runtime. This supersedes only
the earlier **unverified ordinary-process native admission/catalog** boundary;
it does not establish arbitrary host-manager RPC, host discovery, remote files,
or complete parity. The existing installed Kanban's environment/bytes are unchanged.
The subsequently rebuilt fork stages policy + pipe + normal runtime under an
explicit expiring catalog grant; startup strips transport when off and never
forwards caller/trust switches. This is an evidenced narrow contract update,
not a general native relay. One authorized exact-host directory read succeeded;
normal-board UI live acceptance remains separate and unfinished.

Two newly traced safety distinctions matter before using those native tools:

- Renderer182735 module `q7pe`, `l` (entry offset 1901540 vicinity) treats
  `preferredHostId` as a preference, not a mandatory target. After its failed
  read it queries other connected managers. Renderer497066 `case A.Dv` calls
  that resolver and can additionally try ChatGPT fallback. Returning-row
  validation would be too late to prevent these extra reads. `read_thread` is
  therefore **not** an exact-pair read adapter, even with explicit `hostId`.
- Renderer497066 `rV.pollThread` / `resolveThreadHost` also fall back after a
  preferred-host failure. The `new rV` factory supplies `getManagers: () => ...`
  over all ready connected managers; it ignores the resolver's preferred-host
  argument. Explicit `wait_threads` targets do not remove this failure-path
  read-scope problem. No live wait/read probe was performed.
- By contrast renderer497066 `tO` checks the requested host is connected and has
  a client, then `tS` sends `thread/list` only through that host manager. The
  history/codex branch does not connect another host or fall back. `tS` may fill
  a requested normal-result window with additional internally filtered pages.
  Its `tR` result contains title/cwd/status and summary/project annotations; the
  new strict-host component deliberately drops summary/project fields. A live
  host-directory read requires a separately agreed metadata scope.

The installed app-tools `NativePipeClient` uses four-byte little-endian frames
and JSON-RPC `tools/list` with `threadStartKind`; there is no additional client
handshake in that code. Bootstrap854 `lk` accepts both number and string RPC IDs.
The NVM-runtime probe's closed peer was **not** assigned a proven rejection
reason. `ld` can enforce native process authorization on packaged macOS builds;
the native addon and the NVM/bundled runtime signing identities differ. The next
explicitly approved trial used only the actual injected runtime via direct
`exec`, without changing signatures, adding ancestors or overriding trust. It
returned 60 sanitized tool definitions. This is current-version live evidence,
not a grant inferred from a pipe name or a stable public API promise.

Public cross-checks (read 2026-11-08):

- [Desktop-only plugins](https://developers.openai.com/plugins/deploy/desktop-only)
  permits ordinary local stdio MCP runtimes; it does not promise private native
  host services.
- [Plugin packaging](https://developers.openai.com/plugins/build/plugins)
  documents local-cache/update/restart behavior and scoped server configuration.
- [Codex issue #47425](https://github.com/openai/codex/issues/47425) reports
  runtime/ancestry-sensitive native closures on a different version/topology.
  It is external corroboration, **not** proof of this machine's closure reason
  or permission to use its shim/symlink/relay workarounds. None were adopted.

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
| `.vite/build/early-bootstrap-133-3bca9e88e9a413b4.js` | `c322a51d5cd65ee2a0243c61055166ebde455980a533fbbbb56c0a5c7bde0df9` |
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
| `webview/assets/async/63396.ec0c2499c7.js` | `4b82dc6a50234aa59dadd58e21e335cf333ab6b473163575d0f3c42b442a0412` |
| `webview/assets/async/652142.46d771a879.js` | `449e3f6270c2ed13183142d0a50cd42de1a50d6fa464d89baa3e98a389b5605a` |
| `webview/assets/async/11147.784bd085db.js` | `59a5117e86f509825f640589479852e61ca846537718bbbc21a50fc41b6d443b` |

The additional bootstrap133 and seven renderer entries above were checked
against ASAR-header size, SHA256 and per-block SHA256 metadata. This verifies extraction consistency,
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

This fork implements this route for the existing local confirmation UI, scoped
to explicitly registered pairs. Since the user's 2026-11-11 policy change these
pairs enable the controls by default; `TASKBOARD_SSH_ACTIONS` can still restrict
them or disable them with `[]`. No startup action probe, automatic execution or
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

### Whole-build registration audit and internal RPC boundary — 2026-11-08

To check the earlier bounded audit for a missed dynamic registration, scanned
all packed JavaScript entries under `.vite/build/` and `webview/assets/` in the
same downloaded ASAR: **9,416 entries / 531,882,474 bytes**. Reads used the
ASAR header offsets; each matching entry was checked against its whole-file
and block SHA256 metadata. No extracted code was executed. This scope includes
the async renderer chunks absent from the previous extracted-file search, but
not native executables, unpacked files or other Desktop versions.

- `addRequestHandler(` matched only bootstrap339: the IPC client definition,
  the `uc` registration helper and its explicit `thread-owner-discovery`
  registration. The helper registers the known owner/follower methods. In
  all 28 main-bootstrap JS files, the IPC client request-handler map is
  populated through this method; the other `requestHandlers.set` belongs to
  the unrelated generic JSON-RPC/browser module. No host/session catalog
  registration was established by this audit. String scanning alone cannot
  exclude computed/obfuscated names; the handler-map and dispatch trace is the
  stronger evidence for this inspected client.
- bootstrap339 `handleClientDiscoveryRequest` checks the protocol version
  and looks up the exact method in that client map; absent handlers answer
  `canHandle: false`. `handleRequest` uses the same admission and handler map.
  The router selects registered clients and forwards requests; it does not
  implicitly forward arbitrary app-server RPC. Bootstrap entry `iv`, `ib`
  and `iy` define the known protocol versions, not an external catalog grant.
- Renderer182735 `hms3` obtains `appServices.appServerManagers` supplied by
  Desktop, subscribes to a host and receives a ready manager lease. Its
  `Dgwo`/`bBSc` use that host-bound manager for the `recentThreads` subscription.
  bootstrap854 `Ft.open` returns a manager wrapped with `assertCurrent`;
  `createAppHost` exposes this internal service. Its `ipcMain.on(ol.QT)`
  setup accepts a transferred Electron MessagePort only after the trusted IPC
  check, then binds `createAppHost`/`registerAppView` to the sender.
  `isTrustedIpcSender` checks registered web contents, uncovered account state,
  main-frame identity and a trusted frame URL. This is not a Unix IPC endpoint
  or permission for a plugin iframe/Node process to attach or impersonate a
  Desktop renderer. No MessagePort injection, renderer attachment or trust
  setting change was attempted.

The full packed-JS search also located the same single first-party bridge
registration selector and bridge extension already traced below. The remaining
app-tools pipe literal matches describe WSL process-environment forwarding and
LocalWork executor setup, not a new ordinary-plugin host catalog. This audit
therefore closes a concrete search gap; it does **not** establish installed
compatibility or a new usable transport. Further implementation of full parity
now needs an authorized Desktop export or a documented plugin capability,
not more guessed method names. No runtime feature is expanded by this finding.

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

### Native caller admission and local executor routes

A further bounded trace of the same public build distinguishes **caller**
identity from the SSH **target**, rather than treating all hostId fields as
interchangeable:

- bootstrap854 lR requires caller source, call ID, namespace, caller thread,
  tool and caller turn. Its lk schema admits native tools/call with caller host
  eM.enum([sp.n, ei.iwv]).default(sp.n). bootstrap133 module 75211 resolves
  sp.n to local; bootstrap entry module 85172 exports iw: "durable", reached
  by ei.iwv. These are the native route's local and LocalWork/executor caller
  contexts, **not** a restriction that prevents a tool's separately validated
  arguments from targeting SSH. The separate per-host Desktop MCP forwarding
  route can supply its bound caller host; its existence does not export that
  connection to this plugin.
- The bundled app-tools server's createCodexAppToolsMcpServer accepts caller
  metadata from MCP _meta, including x-codex-turn-metadata, or the explicit
  LocalWork --interaction-client-id. It rejects missing caller thread metadata
  with "Codex app tools require thread metadata from the executor."
  Native tools/list receives only threadStartKind, not a host/session query.
  It lists tools, not chats. The first-party wrapper's fallback call/turn IDs
  do not authorize Kanban to invent a caller or borrow a target session's
  identity. The interaction-client option is not a read-only target selector.
- bootstrap854 callDynamicAppTool selects a ready renderer, calls canCallTool,
  then dispatches the request and waits for its call-ID result. Renderer182735
  canCallTool rejects the ChatGPT caller source on this path and can read an
  uncached caller thread. Its ysE7 execution module obtains caller follow-up
  context, caller turn and stream role, then calls
  dynamicToolCalls.tryClaimExecution before loading the actual dispatcher.
  Thus this is caller-bound tool execution, not stateless read-only discovery.
  wait_threads additionally observes the caller's steering/completion. No
  caller claim, caller-thread read or native-pipe attach was performed.

The signed native task routes also do not supply the missing SSH export:

- lk validates taskThread/read with environment ID, thread ID, optional cursor,
  limit 1–50 and a 64-hex nonce. Startup binds its callback to
  readLocalTaskThread, which requires a ready executor with the **exact**
  environment ID, an authenticated principal and supported app-server version;
  it uses getLocalAppServerClient(). Signing the response does not change this
  local scope.
- taskProject/list is bound to listChildTaskProjects: it checks the same ready
  executor/environment and returns projects.getLocalProjects(). It is not a
  connected-SSH-host or thread catalog. taskProject/assign and
  taskWorkspace/prepare perform assignment/workspace operations and are not
  observation substitutes. None of these routes was called.
- The nearby node_repl_host_services startup is gated by
  eS && e_.x.isInternal(N). In this inspected registration its service map
  contains only computer-use with an ensureServicePid callback, not an
  app-server or SSH catalog. Neither the private pipe environment variable
  nor an internal-build/security switch is enabled.

Rechecked the public [MCP UI documentation](https://developers.openai.com/plugins/build/chatgpt-ui)
and [remote connection documentation](https://learn.chatgpt.com/docs/remote-connections)
on 2026-11-07. They describe the MCP Apps UI bridge and Desktop's host-local
tools/configuration respectively, not a grant to an ordinary plugin to use the
native app-tools pipe. Exact-string documentation searches did not establish a
public CODEX_APP_TOOLS_PIPE_PATH or first-party-plugin-bridge contract. This
bounded result is **not** proof that no supported export exists in another
version. The user's installed version remains unknown; the user confirmed no
Desktop bundle is available in this development environment.

Source and repository-distribution MCP configs continue to forward only the
existing board environment allowlist. They do not request native app-tools,
host-services, caller identity, verifying identity or peer-authorization values.
Startup fixtures supply poisoned synthetic values and verify the actual configs
exclude them while preserving SSH observation/action opt-ins. This tests our
startup contract, not authorization or behavior of a real Desktop pipe. The
unchanged optional local launcher removes inherited native/caller values before
launching Desktop; it is neither invoked nor used as an SSH export here.

### Existing control-socket transport candidate (not attached)

The public [app-server protocol documentation](https://learn.chatgpt.com/docs/app-server#protocol)
describes WebSocket over a Unix control socket. In the public Desktop bundle,
bootstrap854's `createSshProxyStream` runs `codex app-server proxy` under SSH and
uses its byte stream for the existing remote app-server. This is distinct from
`startRemoteAppServer`, which can start a backend and perform remote setup; that
bootstrap path is not an observation operation and is not replicated here.

Pinned open-source commit `57a808a3920f05f2d4b9eab2d0493e1df136ae6b` provides
[`cli/src/main.rs`](https://github.com/openai/codex/blob/57a808a3920f05f2d4b9eab2d0493e1df136ae6b/codex-rs/cli/src/main.rs)
(Git blob `a1462ee2a36535fba971389bf8ef8bda8ad9b8d5`): the Proxy branch resolves
an explicit/default control-socket path and calls `codex_stdio_to_uds::run`,
separately from daemon Start/Bootstrap.
[`stdio-to-uds/src/lib.rs`](https://github.com/openai/codex/blob/57a808a3920f05f2d4b9eab2d0493e1df136ae6b/codex-rs/stdio-to-uds/src/lib.rs)
(Git blob `a103de3312a04d087f81e5e49c7b2c05e3f4d208`) connects an existing Unix
socket and relays bytes; it does not bootstrap a backend or issue JSON-RPC on its
own. This supplies a real reusable-backend building block, not a demonstration
that an external plugin can access the user's installed Desktop connection.

A safe full-feature implementation would still need an explicitly exported
authorized transport to the **same** Desktop-owned host backend, installed
version/handshake verification, precise read/subscription vs action admission,
and connection/owner lifecycle tests. A second SSH command is not reuse of
Desktop's existing SSH transport. No socket/credential discovery, control-socket
connection, daemon start, SSH command, config change or native attach is added.
Absent a verified Desktop export, this remains a transport candidate rather
than a fabricated automatic-discovery or parity implementation.

### Ordinary MCP App host scope is not a global Desktop tool bridge

Renderer63396 `nI` receives a fixed server (`tu`), host (`M`) and conversation
(`i`). `te` resolves that named server; `tools/list`, resource list/template
handlers and `i3` tool dispatch validate the same server's tools and trusted
scope before host-manager `callMcpTool({threadId, server, tool, ...})`. Supplying
`codex_app` tool names in an ordinary app request does not select another server
or yield a global session directory. The optional `mcpAppHostAdapter` is
host-injected, not an extra capability this fork can assume. Renderer652142's
standard schemas and connector forwarding do not establish such a catalog.

The `openai/files/open` extension accepts a path in this app's fixed host
context, not an arbitrary target host parameter. It does not demonstrate a safe
cross-host artifact API for a board hosted locally. No remote path is submitted
through it.

Renderer63396's `ui/openai/first-party-plugin-bridge` schema and class `eC` wrap
an **injected** bridge's `createRpcStub`. The extension is advertised only with
the bridge and notification sink present. Renderer11147's
`firstPartyPluginBridgeForServer$` selects a Desktop-owned registration by
plugin/connector identity, host and installation host, checking remote-host
support. An unregistered server gets no bridge. The schema's existence is not
authorization to spoof a first-party plugin or inject this capability. No host
adapter, bridge, private pipe or catalog call was attempted. This additional
trace narrows the feasible discovery path; it does not prove every Desktop
version lacks another supported export.

## Snapshot-only successful wait relationships

Renderer182735 `MCYz` defines `wait_threads` with 1–8 target pairs and an optional
0–120000 ms timeout. Renderer497066's dispatch resolves an omitted target host
to `sourceHostId`, rejects duplicate pairs, then routes to the existing host
managers. This handler also rejects its caller thread ID even on another host;
the UI fixture uses different caller/target IDs, while colliding each with local
IDs and testing identical target IDs across SSH hosts in unit fixtures.
`waitForThreads` returns successful `polls` with explicit
`thread: {id, hostId, ...}`; failed targets are separate errors. Its `nI`
serializes the result into `contentItems: [{type: "inputText", text}]` with
`success: true`. These are existing Desktop tool handlers, not APIs this board
calls.

bootstrap854 `yx`/`Sb` preserve `mcpToolCall` in conversation snapshots.
Renderer182735's `er` conversion maps `codex_app` MCP calls to
`dynamicToolCall` with namespace/tool/arguments/contentItems/status/success.
The fork accepts only these positive completed shapes; MCP errors and dynamic
calls without explicit success are rejected. Arguments and result identity are
bounded/validated, immediate zero-timeout polls are excluded, and requested and
returned pairs must intersect exactly. Partial successful polls can yield edges
only for already registered, live, ordinary SSH cards. Titles come from their
snapshots, never from tool results. No result body or assistant text reaches the
board. Cross local/SSH relations remain excluded.

This proves a **historical successful wait in the newest received turn**, not
an ongoing watcher, current activity of the target, completion of that target or
automatic session discovery. UI labels reflect past evidence. Newest canonical
history gaps/unbound tails remain unknown; a new turn resets evidence. Loss of
either endpoint's snapshot/runtime eligibility clears both directions, cache
restoration clears all SSH edges, and a live replacement can restore them.
Remote links have no href and cannot call the host. Local readers/references and
navigation are unchanged. No wait, read, resume, execution or live observation
was performed to implement or test this graph; fixtures cover source and
repository-distribution MCP/UI.

## Saved thread Git metadata is not live checkout status

bootstrap854's `w1` maps the app-server thread's `gitInfo` into conversation
state. The thread store applies it on stored-thread reads and resume/rollback
responses; `getGitInfo` may fill a missing repository origin during
initialization. The stream factory's `w = e => Object.fromEntries(Object.entries(e))`
serializer preserves conversation properties for `sendSnapshot`, so this field
can arrive through the already used v11 snapshot transport. This establishes
its source, not freshness of the remote working directory's HEAD. No read,
resume or rollback was invoked to obtain it.

The public app-server documentation calls `thread/metadata/update` a stored Git
metadata update, not a current Git inspection API. At pinned open-source commit
`57a808a3920f05f2d4b9eab2d0493e1df136ae6b`,
[`thread_data.rs`](https://github.com/openai/codex/blob/57a808a3920f05f2d4b9eab2d0493e1df136ae6b/codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs)
declares nullable `sha`, `branch` and `origin_url` with camelCase serialization
(Git blob `dd7c0d854a62f34d60c130154f86570bf1770e0f`). This corroborates the
shape but is not an installed-version guarantee.

The fork exposes only a separately named `snapshotGit` branch/commit summary on
loaded ordinary SSH cards. The branch is bounded and rejects control characters;
commit IDs must be complete 40/64-hex values. Missing or malformed data stays
unknown. Origin URLs and all extra fields are omitted, so private credentials/
remote paths cannot reach the board through this summary. Null branch is not
interpreted as detached HEAD, no worktree status is fabricated, and the local
`git` field/reader are unchanged. The UI explicitly distinguishes stored thread
metadata from current branch, HEAD or worktree; disconnect, unloaded state and
cache restoration clear it. Fixtures cover replacement/loss, same-ID host
isolation and source/distribution UI. This does not implement remote current Git
status, artifact fetching or review.

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

- **Implemented:** registered-pair-scoped existing confirmation/answer UI,
  default-enabled per the user's 2026-11-11 request, with optional restrictive overrides,
  exact wire versions, owner/revision/connection verification, stale/duplicate
  handling, MCP environment forwarding and source/distribution UI fixtures.
- **Already implemented:** explicit observation, non-live filtering metadata
  retention, host-safe collections and local filesystem exclusion. Snapshot-only
  validated turn timing and historical successful wait relationships now
  supplement these without loading history. Saved thread Git metadata is also
  displayed separately from live checkout state, without filesystem access.
- **Unfinished:** supported catalog/host discovery export, installed-version
  and authorized live acceptance, a navigation route with acceptable verified
  effects (known hydration/read/auto-response risks now documented), usage/input
  timestamps, host-routed current Git/artifacts/review and complete cross-host monitoring.
  **Full parity is not established or implemented by this commit.**

For the next actual transport implementation, the missing prerequisite is an
explicitly supplied, authorized Desktop export to the same connected host
backend (or a documented ordinary-plugin host-service capability), with a
verifiable installed version/handshake. It must provide connected-only host
identity and bounded read/subscription semantics without implicit resume,
ownership acquisition or caller-session writes. Catalog enumeration additionally
needs authorization beyond the previously named observation pair. Actions need
separate per-pair authorization, owner/lifetime checks and no uncertain retries;
remote file/Git access must remain on that host. Merely providing a version
number would help check compatibility, but would not create this export or
authorize live catalog/action testing. No inert transport adapter, guessed
native call, second backend or broad environment forwarding is added to fill
that gap.

Remote operations have not been tested live. Separate explicit authorization for
the named test session is needed. Fixtures do not establish support in every
Desktop version or for disconnected/unloaded owners. The private protocol may
change; use an explicit empty action-list override for read-only acceptance.
