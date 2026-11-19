#!/usr/bin/env bash
# Installs the two launchd agents of the always-on workbench for the current
# user (docs/architecture/environment.md#always-on):
#   com.termrise.watch   every 10 minutes  infra/local/watch.sh
#   com.termrise.backup  every 24 hours    infra/local/backup.sh
# Run it from the main checkout (a worktree gets deleted). Safe to run again:
# it replaces the agents. `--uninstall` only removes them.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs"
# launchd starts with a bare PATH: give it Docker (OrbStack), node and pnpm.
NODE_BIN="${TERMRISE_NODE_BIN:-$HOME/.local/share/fnm/aliases/default/bin}"
AGENT_PATH="$NODE_BIN:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
UNINSTALL=0
[ "${1:-}" = "--uninstall" ] && UNINSTALL=1

if [ "$UNINSTALL" = 0 ] && [ "$(git -C "$REPO" rev-parse --git-dir)" != "$(git -C "$REPO" rev-parse --git-common-dir)" ]; then
  echo "Run this from the main checkout, not a worktree." >&2
  exit 1
fi

for spec in "com.termrise.watch watch.sh 600" "com.termrise.backup backup.sh 86400"; do
  read -r label script interval <<< "$spec"
  plist="$AGENTS/$label.plist"
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  rm -f "$plist"
  if [ "$UNINSTALL" = 1 ]; then echo "removed $label"; continue; fi
  sed -e "s#__LABEL__#$label#" -e "s#__SCRIPT__#$REPO/infra/local/$script#" -e "s#__INTERVAL__#$interval#" \
      -e "s#__PATH__#$AGENT_PATH#" -e "s#__LOG__#$LOGS/$label.log#" "$REPO/infra/local/launchd/agent.plist.in" > "$plist"
  launchctl bootstrap "gui/$(id -u)" "$plist"
  echo "installed $label ($script every ${interval}s, log $LOGS/$label.log)"
done
