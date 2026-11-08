# Experimental configured-host SSH directory

Default: **off**. This is stored directory metadata, not full SSH parity or
automatic discovery of connected hosts. Evidence and remaining gates are in
[SSH-DESKTOP-ACCEPTANCE.md](SSH-DESKTOP-ACCEPTANCE.md).

## Explicit process-local grant

`TASKBOARD_DESKTOP_CATALOG` is strict JSON. The following is a template, not
ready-to-run authorization: replace synthetic identities and supply a real UTC
deadline at most 24 hours ahead. Never use a business caller as a test identity.

```json
{
  "grantId": "e0000000-0000-4000-8000-000000000001",
  "hosts": ["remote-ssh-discovered:example-host"],
  "localCallers": ["c0000000-0000-4000-8000-000000000001"],
  "expiresAt": "<UTC deadline within 24 hours>",
  "pageSize": 10,
  "maxReads": 1
}
```

- Exact hosts/local callers: 1–50 each; no wildcard, local/durable host alias,
  inferred caller, environment identity or target-thread-as-caller fallback.
- `pageSize`: default 10, maximum 50. `maxReads`: default 1, maximum 100.
- Each admitted attempt consumes a persistent slot in plugin-owned
  `kanban/desktop-catalog-grants/<grantId>/`. Files contain only an invocation
  hash, not raw caller IDs, tool output or row metadata. Duplicate requests,
  failures and process restart do not renew the grant. Exhaustion does not grow
  the ledger past the configured slot count. Review scope and choose a new grant
  before more reads; do not blindly replay uncertainty.
- A host directory can contain private title/preview-derived data. Desktop's
  service may internally fetch filtered pages to fill the requested result
  window. Grant **host-directory metadata** scope, not only one known thread.

The fork's source/packaged MCP configs stage only the new policy and the two
transport fields `CODEX_APP_TOOLS_PIPE_PATH` / `CODEX_MCP_NODE_PATH`. When off,
startup removes transport before Node. Caller/verification/peer-security fields
are stripped and never used for authority. When opted in, startup directly
`exec`s only the compatible Node actually injected by Desktop. Missing runtime
does not cause NVM/app-path fallback, download, ancestry shim or security changes.
Do not modify the existing installed plugin's Node configuration to run this
fork. Installing/updating the fork is a separate user-controlled operation.

## Request admission and routing

`taskboard_desktop_catalog` accepts only `hostId`, optional `limit` and a returned
host-bound cursor `{hostId, value}`. Every request needs the actual executor's
thread/turn/call metadata and must match a granted local caller. Arguments cannot
supply identity. Metadata assertions alone are not cryptographic authentication;
the route is local stdio plus Desktop's native peer admission, with explicit scope
and runtime/version checks. Unknown/incompatible state fails closed.

The adapter pins the inspected installed ASAR hash, checks the actually running
runtime against Desktop's injected path and a private user-owned Unix socket,
then verifies the advertised `list_threads` shape. It sends only history/codex,
the granted host, archived=false and the bounded page request through Desktop's
existing connected-host backend. It cannot select arbitrary tools/RPC, fall back
to another host/backend, start a host, resume, approve, execute, read turns or
interpret remote cwd locally. At most a definition check and a list call occur;
cancellation addresses only that native request, never a Codex turn. Backend
reads already sent may finish; there is no automatic request retry.

Returned host/UUID, duplicate identities, opaque cursor scope, size and shape are
validated. Project/summary annotations are dropped. Titles use the existing
credential-masking display normalizer. `updatedAtSeconds` is a directory update,
not user-send time. `listedState` is not current runtime; freshness stays explicitly
unestablished. No usage, timing, unread or kind/subagent classification is invented.

Current native `read_thread` and `wait_threads` can read other hosts after a
preferred-host failure. Returning-row filtering cannot undo that read; neither
method is exposed by this adapter. The reviewed `list_threads` history branch
checks an existing connection and stays on the requested manager.

## UI and compatibility

The authorized caller sees **SSH directory (not live)** in connection/data-source
settings. Reads and next-page requests are manual. There are no links, approvals,
execution controls, automatic observation/registration or board-card promotion.
Rows remain separate from ordinary/subagent filters and local Git/artifact/history
readers. Host/grant/context changes, hiding and closing clear/abort the ephemeral
view; rows are never stored. Native availability is removed from snapshot cache.

An MCP App callback lacking true executor turn/call context is denied, not given
invented IDs. The operator can instead discover/call the model-visible tool from
an authorized turn. Use the actual discovered qualified callable path for deferred
tools. Preview HTTP/WebSocket has no native catalog fallback.

Without the grant the tool is not registered; the existing local board, omitted
host/schema-v1 handling and explicit SSH observer/action opt-ins remain unchanged.
Directory grants do not add entries to `TASKBOARD_SSH_SESSIONS` or
`TASKBOARD_SSH_ACTIONS` and never enable navigation.

The underlying adapter passed a live one-host, ten-row test through the temporary
ordinary plugin, which was removed afterward. Source and distribution MCP/UI
fixtures cover normal routing/startup, manual paging/host switch, budget limits,
redaction, no navigation/auto-observation and cache clearing. **The new normal
board UI has not been live-installed or accepted.** Automatic connected-host
discovery, safe general history access, current Git/files/review and remaining
action/monitoring parity are unfinished.
