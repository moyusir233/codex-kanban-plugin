#!/bin/sh
set -eu

# Only use the runtime actually supplied by this normal Desktop MCP executor.
# No app-path fallback, ancestry shim, trust flag, download or Node config edit.
runtime=${CODEX_MCP_NODE_PATH:-}
case "$runtime" in
  /*) ;;
  *) printf '%s\n' 'Desktop did not supply an absolute MCP Node runtime.' >&2; exit 1 ;;
esac
if [ ! -x "$runtime" ] || ! "$runtime" -e '
  const v = process.versions.node.split(".").map(Number);
  if (v[0] < 22 || (v[0] === 22 && v[1] < 13)) process.exit(1);
  require("node:sqlite");
  if (typeof WebSocket !== "function") process.exit(1);
' >/dev/null 2>&1; then
  printf '%s\n' 'Desktop MCP runtime is unavailable or incompatible; no fallback is allowed.' >&2
  exit 1
fi
exec "$runtime" "$@"
