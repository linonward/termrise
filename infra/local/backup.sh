#!/usr/bin/env bash
# Daily (launchd, infra/local/install-agents.sh): dump termrise_local and put it
# in the private R2 bucket termrise-backups under termrise_local/<date>.dump.
# The bucket's lifecycle rule deletes dumps after 30 days. Restore steps:
# docs/architecture/environment.md#always-on.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="${TERMRISE_STATE_DIR:-$HOME/.local/state/termrise}"
DB_CONTAINER="${TERMRISE_DB_CONTAINER:-saas-starter-postgres-1}"
BUCKET="${TERMRISE_BACKUP_BUCKET:-termrise-backups}"
day=$(date -u +%F)
tmp=$(mktemp -t termrise-backup)
trap 'rm -f "$tmp"' EXIT

docker exec "$DB_CONTAINER" pg_dump -U postgres -Fc termrise_local > "$tmp"
size=$(wc -c < "$tmp" | tr -d ' ')
[ "$size" -gt 1024 ] || { echo "$(date -u +%FT%TZ) dump too small ($size bytes), not uploaded" >&2; exit 1; }
(cd "$REPO/apps/api" && pnpm exec wrangler r2 object put "$BUCKET/termrise_local/$day.dump" --file "$tmp" --remote >/dev/null)
mkdir -p "$STATE" && date +%s > "$STATE/last-backup"
echo "$(date -u +%FT%TZ) uploaded $BUCKET/termrise_local/$day.dump ($size bytes)"
