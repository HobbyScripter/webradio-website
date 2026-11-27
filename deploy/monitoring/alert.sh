#!/usr/bin/env bash
# OnFailure handler for the webradio timers/services.
#
# Called as `webradio-alert <unit>` by webradio-alert@.service. Writes a single
# error line to journald (visible via `journalctl -p err -t webradio-alert`)
# and, if ALERT_WEBHOOK_URL is configured, posts a small JSON payload.
# Deliberately no mail server dependency: journald is the source of truth.
set -uo pipefail
UNIT=${1:-unknown}
# OnFailure=webradio-alert@%n.service produces "<unit>.service" as the instance.
UNIT=${UNIT%.service}
TS=$(date -u +%FT%TZ)

msg="unit=$UNIT failed at $TS"
logger -p user.err -t webradio-alert -- "$msg" 2>/dev/null || true
printf '%s %s\n' "$TS" "$msg"

if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
  payload=$(printf '{"text":"[webradio] %s","unit":"%s","ts":"%s"}' "$msg" "$UNIT" "$TS")
  curl -sS -m 10 -X POST -H 'Content-Type: application/json' --data "$payload" "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 || true
fi
