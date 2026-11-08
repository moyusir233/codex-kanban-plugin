# Temporary ordinary-plugin executor probe

This is a development diagnostic, not complete host-service or SSH parity.
It is **not** part of the normal Kanban distribution or startup allowlist.

## Boundary

- Requires an explicitly designated disposable **local Desktop** thread UUID.
- Its default tool inspects known incoming MCP executor metadata fields for presence
  and consistency. Arguments cannot supply a caller identity. Missing/conflicting
  thread metadata, a different caller, an explicit non-local host or a missing
  test confirmation fails closed. At most three admitted calls per process.
- The default stage checks only whether Desktop provided `CODEX_APP_TOOLS_PIPE_PATH`. Never prints
  its value, stats it, connects to it, lists native tools or calls native RPC.
- Writes only sanitized booleans/statuses to its own designated test report.
  No prompts, history, raw metadata, paths, turn/call IDs, tokens or credentials
  are in the report. No fallback caller/turn/call identity is generated.
- Matching `_meta` assertions is **not** cryptographic authentication or proof
  of peer authorization. The presence-only report always says native access is unverified.
- Desktop must invoke it through its normal executor. Injected fixture metadata
  does not establish live caller provenance. A pipe-presence result alone does
  not authorize a subsequent attachment or remote read.

## Separately authorized stages

| Package | Extra operation | Bounds |
| --- | --- | --- |
| 0.0.1 | Presence only | No native connection/RPC |
| 0.0.2 | One native `tools/list` | Independent confirmation and persistent single-use attempt; no session reads |
| 0.0.3 | Same catalog check through the normal injected runtime | Direct shell `exec` of `CODEX_MCP_NODE_PATH`; no fallback, ancestry shim, signing change or peer/security flag |
| 0.0.4 | One connected-host history directory read | Separate confirmation/attempt; only `list_threads` with fixed history/codex/host, archived=false, limit=10; counts-only report |

For an authorized catalog-only upgrade, build a **new** output with
`--catalog-for <prior-0.0.1-plan>` or `--desktop-runtime-for <prior-0.0.2-plan>`.
They keep the same unique diagnostic selector, preserve prior attempt records,
and never update the production Kanban. Do not substitute another executable to
evade trust; 0.0.3 requires the actual Desktop-injected runtime to match the
running program and stops if it is unavailable.

A separately authorized 0.0.4 build adds:

```sh
node scripts/package-desktop-host-probe.mjs \
  --caller <same-local-test-UUID> --output <new-absolute-test-directory> \
  --host-catalog-for <prior-0.0.3-plan> \
  --host <approved-exact-Desktop-hostId> --interest <designated-SSH-test-UUID>
```

The host read uses the actual shared implementation in
`server/desktop-host-catalog.ts`, not a fake transport. It requires genuine
incoming executor field assertions (no generated identity), the designated local
caller, the matching injected runtime and the reviewed installed Desktop ASAR
fingerprint. A tool-definition check must advertise the exact supported method.
The native caller host is local; the **target** host is explicit inside the
history-list arguments. Unknown host, cross-host cursor, mismatching rows,
duplicate IDs, unsupported method/shape, owner transport errors or cancellation
fail closed, without trying another host or backend.

The report records only counts, result binding, whether the designated test
thread was on that page, pagination presence and transport counters. Row titles,
paths, summaries, IDs and cursor stay out of the probe's output/report. The
adapter drops project/summary annotations rather than joining host-unscoped data.
Listed state is not runtime freshness; no timing/usage/history is invented.

This specific Desktop's native `read_thread` **and `wait_threads`** can fall back
to other connected hosts after a preferred-host failure. They are not used by
the strict-host adapter. `list_threads` history mode is connected-host-bound,
but can internally fetch additional filtered pages to fill the requested result
limit. A catalog test therefore needs host-directory metadata scope, not just
the previously designated single SSH pair. It may receive title/preview-derived
summaries in memory; the probe immediately discards them. Platform-owned normal
call records/telemetry are not controlled by this diagnostic.

The client issues at most one definition request and one history-list call, with
a 15-second transport deadline. It may cancel **only its own native request**
once; no Codex turn interrupt is sent. Backend reads already sent may finish.
No request is replayed, even after a restart. The prior successful catalog-only
grant is retained with its already-used marker, not renewed by a host-read build.

Live success of any one stage is not installed Kanban UI acceptance or full
parity. The fork now wires the shared directory component into the normal MCP
server and a separate settings view under a default-off, expiring, budgeted
`TASKBOARD_DESKTOP_CATALOG` grant. Only its policy/pipe/runtime fields are staged;
startup strips transport when off and never forwards caller/trust switches.
See [SSH-HOST-CATALOG.md](../../SSH-HOST-CATALOG.md). Normal-board UI acceptance
is still fixture-only; missing/unsupported remaining host services stay unfinished.

## Build / installation / rollback

After obtaining the user's exact local caller and installation approval:

```sh
node scripts/package-desktop-host-probe.mjs \
  --caller <designated-local-thread-UUID> --output <new-absolute-test-directory>
```

The output directory must not exist. It contains a uniquely named local
marketplace/plugin, an exact single-caller policy, a confirmation string and
`installation-plan.json`. It uses the verified building Node's absolute path;
there is no runtime installer and no change to installed Kanban's Node config.
Generated runtime/policies/identifiers stay in an ignored local workspace, not Git.

First validate add/remove using a temporary HOME/CODEX_HOME and the installed CLI.
Inspect the resulting exact installed path and `plugin remove` /
`plugin marketplace remove` commands before any approved real installation.
Do not enumerate other installations or read session/auth/catalog databases.
Do not overwrite an unrelated plugin or have the agent restart Desktop to make
it load. Update only the generated selector after checking its prior bytes.

The user creates the designated local caller and manually triggers the tool with
the generated confirmation. No model is invoked by the probe or build script.
If tools are deferred, permit platform tool discovery for this diagnostic and
use the exact returned callable path. Do not guess a short JavaScript function
name; a binding TypeError is not evidence of a native service failure.
Remove only this generated selector/marketplace after testing. Do not delete the
user's local or SSH conversations, restore unrelated settings, or uninstall the
real Kanban plugin.
