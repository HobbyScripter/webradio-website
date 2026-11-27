#!/usr/bin/env bash
# Trigger the analytics schedules without Vercel (systemd timer).
#
#   deploy/monitoring/cron-run.sh
#   DRY_RUN=1 deploy/monitoring/cron-run.sh
#
# Runs the four schedules sequentially, so the application never answers 409
# ALREADY_RUNNING for its own jobs. Each result is appended to CRON_LOG as one
# line (timestamp, schedule, HTTP status); the secret is never logged and curl
# receives it via a header, not the URL.
#
# Environment (/etc/webradio/cron.env, 0600):
#   CRON_SECRET=...            required
#   SITE_ADDRESS=https://...   required
#   CRON_LOG=/var/log/webradio/cron.log
#   CRON_SCHEDULES="analytics-traffic analytics-repo-stats analytics-releases analytics-retention"
#   CA_FILE=                   optional CA bundle for a private CA
#   CRON_TIMEOUT=300
set -uo pipefail

: "${CRON_SECRET:?CRON_SECRET is required (source /etc/webradio/cron.env)}"
: "${SITE_ADDRESS:?SITE_ADDRESS is required (source /etc/webradio/cron.env)}"
CRON_LOG=${CRON_LOG:-/var/log/webradio/cron.log}
SCHEDULES=${CRON_SCHEDULES:-"analytics-traffic analytics-repo-stats analytics-releases analytics-retention"}
CRON_TIMEOUT=${CRON_TIMEOUT:-300}
DRY_RUN=${DRY_RUN:-0}

SITE=${SITE_ADDRESS%/}
mkdir -p "$(dirname "$CRON_LOG")" 2>/dev/null || true
FAILED=0
BODY=$(mktemp)

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
record() { log "$*" | tee -a "$CRON_LOG"; }

CURL_TLS=()
[ -n "${CA_FILE:-}" ] && CURL_TLS=(--cacert "$CA_FILE")

for schedule in $SCHEDULES; do
  if [ "$DRY_RUN" = "1" ]; then
    log "[dry-run] would POST $SITE/api/cron/analytics?schedule=$schedule"
    continue
  fi
  CODE=$(curl -sS "${CURL_TLS[@]}" -o "$BODY" -w '%{http_code}' --max-time "$CRON_TIMEOUT" \
    -X POST -H "Authorization: Bearer $CRON_SECRET" \
    "$SITE/api/cron/analytics?schedule=$schedule" 2>/dev/null) || CODE=000
  case "$CODE" in
    200) record "schedule=$schedule status=$CODE" ;;
    409) record "schedule=$schedule status=$CODE already-running" ;;
    000) record "schedule=$schedule status=000 connection-failed"; FAILED=$((FAILED + 1)) ;;
    *)   record "schedule=$schedule status=$CODE body=$(tr -d '\n' < "$BODY" | cut -c1-120)"; FAILED=$((FAILED + 1)) ;;
  esac
done

rm -f "$BODY"
[ "$FAILED" -eq 0 ] || { log "cron finished with $FAILED failure(s)"; exit 1; }
log "cron finished ok"
