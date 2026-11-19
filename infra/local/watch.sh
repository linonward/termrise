#!/usr/bin/env bash
# Every 10 minutes (launchd, infra/local/install-agents.sh): is the local
# workbench healthy? Checks web, API and Worker, that a round finished in the
# last 36 hours and that the last backup is under 36 hours old, then posts the
# result to site-ops as a heartbeat. site-ops emails when the beats stop or say
# something failed (docs/architecture/environment.md#always-on).
set -uo pipefail

CONFIG="${TERMRISE_WATCH_ENV:-$HOME/.config/termrise/watch.env}"
STATE="${TERMRISE_STATE_DIR:-$HOME/.local/state/termrise}"
URL="${SITE_OPS_HEARTBEAT_URL:-https://site-ops.linonward.workers.dev/heartbeat}"
DB_CONTAINER="${TERMRISE_DB_CONTAINER:-saas-starter-postgres-1}"
[ -f "$CONFIG" ] && . "$CONFIG"

failed=()
probe() { curl -fsS -m 10 -o /dev/null "$2" || failed+=("$1"); }
probe web http://localhost:3010
probe api http://localhost:3001/api/auth/ok
probe worker http://localhost:8080/health

hours_since_round=$(docker exec "$DB_CONTAINER" psql -U postgres -d termrise_local -At -c \
  "select coalesce(floor(extract(epoch from now() - max(finished_at)) / 3600), 9999) from pool_rounds where status in ('completed', 'partial', 'budget_exhausted')" 2>/dev/null)
if [ -z "$hours_since_round" ]; then failed+=("database"); elif [ "$hours_since_round" -gt 36 ]; then failed+=("no finished round for ${hours_since_round}h"); fi

if [ -f "$STATE/last-backup" ]; then
  backup_age=$(( ($(date +%s) - $(cat "$STATE/last-backup")) / 3600 ))
  [ "$backup_age" -gt 36 ] && failed+=("last backup ${backup_age}h ago")
else
  failed+=("no backup yet")
fi

if [ ${#failed[@]} -eq 0 ]; then ok=true; detail=""; else ok=false; detail=$(IFS=', '; echo "${failed[*]}"); fi
body=$(printf '{"source":"termrise","ok":%s,"detail":"%s"}' "$ok" "$detail")
if [ -z "${SITE_OPS_HEARTBEAT_TOKEN:-}" ]; then echo "$(date -u +%FT%TZ) no SITE_OPS_HEARTBEAT_TOKEN in $CONFIG" >&2; exit 1; fi
curl -fsS -m 15 -X POST "$URL" -H "authorization: Bearer $SITE_OPS_HEARTBEAT_TOKEN" -H 'content-type: application/json' -d "$body" -o /dev/null \
  && echo "$(date -u +%FT%TZ) ok=$ok ${detail}" \
  || { echo "$(date -u +%FT%TZ) heartbeat post failed (ok=$ok ${detail})" >&2; exit 1; }
