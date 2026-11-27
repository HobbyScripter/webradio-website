#!/usr/bin/env bash
# Resource-light monitoring without an extra daemon.
#
# One oneshot systemd service every five minutes, no agent, no SaaS. Every
# check prints PASS/WARN/FAIL; the exit code is 1 if anything failed, which
# lets `OnFailure=webradio-alert@%n.service` notify. Results are appended as one
# JSON line per run so `journalctl -u webradio-health` and the log file stay
# greppable.
#
# Environment (/etc/webradio/monitoring.env, 0600):
#   MODE=docker|native          default native
#   HEALTH_URL                  default http://127.0.0.1:3010/api/health (liveness)
#   READINESS_URL               default HEALTH_URL with /api/health -> /api/ready
#                               (through Caddy a failed readiness yields 503 for
#                               every path, including HEALTH_URL)
#   SITE_URL                    optional https origin for the certificate check
#   CA_FILE                     optional CA bundle (TLS check and https HEALTH_URL)
#   HEALTH_INSECURE=1           accept any certificate for HEALTH_URL (test host only)
#   BACKUP_DIR                  default /var/backups/webradio
#   BACKUP_MAX_AGE_HOURS        default 26
#   CRON_LOG                    default /var/log/webradio/cron.log
#   DISK_WARN / DISK_FAIL       default 85 / 95 (percent)
#   LOAD_WARN_FACTOR            default 1.5 (load1 / vCPU)
#   CPU_WARN                    default 85 (percent busy over one second)
#   CHECK_CONTAINERS            docker mode: service names whose health is checked
#   CADDY_CHECK=auto|off        native: caddy.service; docker: exec /healthz
#   CHECK_CONFIG_PERMS=1        verify 0600 on key/env files
#   CONFIG_BACKUP_MAX_AGE_HOURS default 48 (configuration archives)
#   MONITOR_LOG                 default /var/log/webradio/health.jsonl
#   ALERT_WEBHOOK_URL           optional; receives the JSON on FAIL
set -uo pipefail

MODE=${MODE:-native}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:3010/api/health}
# Caddy and this check use the database-backed readiness endpoint. Keep the
# default derived from HEALTH_URL so a single override stays consistent.
READINESS_URL=${READINESS_URL:-}
if [ -z "$READINESS_URL" ]; then
  case "$HEALTH_URL" in
    */api/health) READINESS_URL="${HEALTH_URL%/api/health}/api/ready" ;;
    *) READINESS_URL="http://127.0.0.1:3010/api/ready" ;;
  esac
fi
SITE_URL=${SITE_URL:-}
CA_FILE=${CA_FILE:-}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/webradio}
BACKUP_MAX_AGE_HOURS=${BACKUP_MAX_AGE_HOURS:-26}
CRON_LOG=${CRON_LOG:-/var/log/webradio/cron.log}
DISK_WARN=${DISK_WARN:-85}
DISK_FAIL=${DISK_FAIL:-95}
LOAD_WARN_FACTOR=${LOAD_WARN_FACTOR:-1.5}
CPU_WARN=${CPU_WARN:-85}
CHECK_CONTAINERS=${CHECK_CONTAINERS:-}
CADDY_CHECK=${CADDY_CHECK:-auto}
CHECK_CONFIG_PERMS=${CHECK_CONFIG_PERMS:-1}
CONFIG_BACKUP_MAX_AGE_HOURS=${CONFIG_BACKUP_MAX_AGE_HOURS:-48}
MONITOR_LOG=${MONITOR_LOG:-/var/log/webradio/health.jsonl}
COMPOSE_FILE=${COMPOSE_FILE:-/opt/webradio/compose.yaml}
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-/opt/webradio/deploy/env.production}

mkdir -p "$(dirname "$MONITOR_LOG")" 2>/dev/null || true
FAILED=0
LINES=()

record() { # level name detail
  # Double quotes inside details (health JSON, unit output) would break the
  # JSON line, so they are replaced with single quotes.
  local detail=${3//\"/\'}
  LINES+=("{\"level\":\"$1\",\"check\":\"$2\",\"detail\":\"$detail\"}")
  printf '%-4s %-22s %s\n' "$1" "$2" "$3"
  [ "$1" = "FAIL" ] && FAILED=$((FAILED + 1))
}

# --- application -------------------------------------------------------------
# HEALTH_URL may be https (behind Caddy): then a private CA or an explicit
# opt-in for the insecure test certificate is required, otherwise curl aborts
# with status 000 and every run raises a false alarm.
HEALTH_TLS_ARGS=()
case "$HEALTH_URL" in
  https://*)
    if [ "${HEALTH_INSECURE:-0}" = "1" ]; then
      HEALTH_TLS_ARGS=(-k)
    elif [ -n "$CA_FILE" ]; then
      HEALTH_TLS_ARGS=(--cacert "$CA_FILE")
    fi
    ;;
esac
CODE=$(curl -sS "${HEALTH_TLS_ARGS[@]}" -o /tmp/webradio-health.$$ -w '%{http_code}' --max-time 10 "$HEALTH_URL" 2>/dev/null) || CODE=000
BODY=$(head -c 200 /tmp/webradio-health.$$ 2>/dev/null | tr -d '\n')
rm -f /tmp/webradio-health.$$
if [ "$CODE" = "200" ] && printf '%s' "$BODY" | grep -q '"status":"ok"'; then
  record PASS app_http "status=200 body=$BODY"
else
  record FAIL app_http "status=$CODE body=$BODY"
fi

# Readiness is separate: /api/ready runs SELECT 1, so a reachable process with
# an unreachable database is a FAIL here and a PASS for liveness above.
READINESS_TLS_ARGS=()
case "$READINESS_URL" in
  https://*)
    if [ "${HEALTH_INSECURE:-0}" = "1" ]; then
      READINESS_TLS_ARGS=(-k)
    elif [ -n "$CA_FILE" ]; then
      READINESS_TLS_ARGS=(--cacert "$CA_FILE")
    fi
    ;;
esac
RCODE=$(curl -sS "${READINESS_TLS_ARGS[@]}" -o /tmp/webradio-ready.$$ -w '%{http_code}' --max-time 10 "$READINESS_URL" 2>/dev/null) || RCODE=000
RBODY=$(head -c 200 /tmp/webradio-ready.$$ 2>/dev/null | tr -d '\n')
rm -f /tmp/webradio-ready.$$
if [ "$RCODE" = "200" ] && printf '%s' "$RBODY" | grep -q '"status":"ready"'; then
  record PASS app_ready "status=200 body=$RBODY"
else
  record FAIL app_ready "status=$RCODE body=$RBODY"
fi

# --- PostgreSQL --------------------------------------------------------------
if [ "$MODE" = "docker" ]; then
  if docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" exec -T postgres \
      pg_isready -q 2>/dev/null; then
    record PASS postgres "pg_isready ok (docker)"
  else
    record FAIL postgres "pg_isready failed (docker)"
  fi
else
  if pg_isready -q -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" 2>/dev/null; then
    record PASS postgres "pg_isready ok (native)"
  else
    record FAIL postgres "pg_isready failed (native)"
  fi
  if [ -n "${CHECK_DB_URL:-}" ]; then
    if psql -w "$CHECK_DB_URL" -Atc 'select 1' >/dev/null 2>&1; then
      record PASS postgres_auth "authenticated query ok"
    else
      record FAIL postgres_auth "authenticated query failed"
    fi
  fi
fi

# --- containers --------------------------------------------------------------
if [ "$MODE" = "docker" ]; then
  if docker info >/dev/null 2>&1; then
    record PASS docker_daemon "daemon reachable"
  else
    record FAIL docker_daemon "docker daemon not reachable"
  fi
  if [ -n "$CHECK_CONTAINERS" ]; then
    for svc in $CHECK_CONTAINERS; do
      cid=$(docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" ps -q "$svc" 2>/dev/null | head -n 1)
      if [ -z "$cid" ]; then
        record FAIL "container:$svc" "not running"
        continue
      fi
      state=$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null)
      health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null)
      if [ "$state" = "running" ] && { [ "$health" = "healthy" ] || [ "$health" = "none" ]; }; then
        record PASS "container:$svc" "state=$state health=$health"
      else
        record FAIL "container:$svc" "state=$state health=$health"
      fi
    done
  fi
  if [ "$CADDY_CHECK" != "off" ]; then
    if docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" exec -T caddy \
        wget -q -O - http://127.0.0.1:8080/healthz 2>/dev/null | grep -q ok; then
      record PASS caddy "internal /healthz ok (docker)"
    else
      record FAIL caddy "internal /healthz failed (docker)"
    fi
  fi
fi

# --- systemd units -----------------------------------------------------------
if [ "$MODE" != "docker" ] && [ "$CADDY_CHECK" != "off" ] && systemctl cat caddy.service >/dev/null 2>&1; then
  state=$(systemctl is-active caddy 2>/dev/null || true)
  if [ "$state" = "active" ]; then
    record PASS caddy "caddy.service active"
  else
    record FAIL caddy "caddy.service state=$state"
  fi
fi

UNITS=${MONITOR_UNITS:-}
if [ -n "$UNITS" ]; then
  for unit in $UNITS; do
    state=$(systemctl is-active "$unit" 2>/dev/null || true)
    if [ "$state" = "active" ]; then
      record PASS "unit:$unit" "active"
    else
      record FAIL "unit:$unit" "state=$state"
    fi
  done
fi
if command -v systemctl >/dev/null 2>&1; then
  FAILED_UNITS=$(systemctl --failed --no-legend 2>/dev/null | wc -l)
  if [ "$FAILED_UNITS" -eq 0 ]; then
    record PASS systemd_failed "0 failed units"
  else
    record WARN systemd_failed "$FAILED_UNITS failed unit(s): $(systemctl --failed --no-legend 2>/dev/null | awk '{print $1}' | tr '\n' ' ')"
  fi
else
  record WARN systemd_failed "systemctl not available (container/non-systemd host)"
fi

# --- disk / memory / load ----------------------------------------------------
DISK=$(df --output=pcent / 2>/dev/null | tail -n 1 | tr -dc '0-9')
if [ "${DISK:-0}" -ge "$DISK_FAIL" ]; then
  record FAIL disk "root filesystem at ${DISK}%"
elif [ "${DISK:-0}" -ge "$DISK_WARN" ]; then
  record WARN disk "root filesystem at ${DISK}%"
else
  record PASS disk "root filesystem at ${DISK}%"
fi

MEM_AVAIL=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || true)
MEM_TOTAL=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || true)
if [ -z "$MEM_AVAIL" ] || [ -z "$MEM_TOTAL" ] || [ "$MEM_TOTAL" -le 0 ]; then
  record WARN memory "cannot determine available memory (no /proc/meminfo)"
else
  MEM_PCT=$(( MEM_AVAIL * 100 / MEM_TOTAL ))
  if [ "$MEM_PCT" -lt 8 ]; then
    record FAIL memory "available ${MEM_PCT}% (${MEM_AVAIL} MB of ${MEM_TOTAL} MB)"
  elif [ "$MEM_PCT" -lt 15 ]; then
    record WARN memory "available ${MEM_PCT}% (${MEM_AVAIL} MB of ${MEM_TOTAL} MB)"
  else
    record PASS memory "available ${MEM_PCT}% (${MEM_AVAIL} MB of ${MEM_TOTAL} MB)"
  fi
fi

# CPU utilisation over one second (no daemon, negligible cost).
if [ -r /proc/stat ]; then
  read -r _ c1_u c1_n c1_s c1_i c1_w _ < /proc/stat
  T1=$((c1_u + c1_n + c1_s + c1_i + c1_w))
  I1=$((c1_i + c1_w))
  sleep 1
  read -r _ c2_u c2_n c2_s c2_i c2_w _ < /proc/stat
  T2=$((c2_u + c2_n + c2_s + c2_i + c2_w))
  I2=$((c2_i + c2_w))
  DT=$((T2 - T1)); DI=$((I2 - I1))
  if [ "$DT" -gt 0 ]; then
    CPU=$(( (DT - DI) * 100 / DT ))
    if [ "$CPU" -ge "$CPU_WARN" ]; then
      record WARN cpu "${CPU}% busy (warn at ${CPU_WARN}%)"
    else
      record PASS cpu "${CPU}% busy"
    fi
  fi
fi

LOAD1=$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo 0)
CPUS=$(nproc 2>/dev/null || echo 1)
LOAD_LIMIT=$(awk -v c="$CPUS" -v f="$LOAD_WARN_FACTOR" 'BEGIN {printf "%.2f", c*f}')
if awk -v l="$LOAD1" -v m="$LOAD_LIMIT" 'BEGIN {exit !(l > m)}'; then
  record WARN load "load1=$LOAD1 above $LOAD_LIMIT (${CPUS} vCPU)"
else
  record PASS load "load1=$LOAD1 (${CPUS} vCPU, limit $LOAD_LIMIT)"
fi

# --- backups -----------------------------------------------------------------
NEWEST=$(ls -1t "$BACKUP_DIR"/webradio-*.dump.enc 2>/dev/null | head -n 1 || true)
if [ -z "$NEWEST" ]; then
  record FAIL backup "no encrypted backup in $BACKUP_DIR"
else
  AGE_H=$(( ( $(date +%s) - $(stat -c %Y "$NEWEST") ) / 3600 ))
  if [ "$AGE_H" -gt "$BACKUP_MAX_AGE_HOURS" ]; then
    record FAIL backup "newest backup is ${AGE_H}h old (limit ${BACKUP_MAX_AGE_HOURS}h)"
  else
    record PASS backup "newest $(basename "$NEWEST") ${AGE_H}h old"
  fi
  # Verify the checksum of the newest archive: a readable dump is not enough,
  # silent bit rot would only surface during a restore.
  if [ -r "$NEWEST.sha256" ]; then
    if ( cd "$(dirname "$NEWEST")" && sha256sum -c "$(basename "$NEWEST").sha256" >/dev/null 2>&1 ); then
      record PASS backup_integrity "sha256 ok"
    else
      record FAIL backup_integrity "sha256 mismatch for $(basename "$NEWEST")"
    fi
  else
    record WARN backup_integrity "no .sha256 file next to $(basename "$NEWEST")"
  fi
fi
CONFIG_NEWEST=$(ls -1t "$BACKUP_DIR"/webradio-config-*.tar.gz.enc 2>/dev/null | head -n 1 || true)
if [ -z "$CONFIG_NEWEST" ]; then
  record WARN config_backup "no configuration archive in $BACKUP_DIR"
else
  CAGE_H=$(( ( $(date +%s) - $(stat -c %Y "$CONFIG_NEWEST") ) / 3600 ))
  if [ "$CAGE_H" -gt "$CONFIG_BACKUP_MAX_AGE_HOURS" ]; then
    record WARN config_backup "newest configuration archive is ${CAGE_H}h old"
  else
    record PASS config_backup "newest $(basename "$CONFIG_NEWEST") ${CAGE_H}h old"
  fi
fi

# --- configuration permissions ----------------------------------------------
if [ "$CHECK_CONFIG_PERMS" = "1" ]; then
  for f in "$BACKUP_DIR/backup.key" /etc/webradio/backup.key /etc/webradio/backup.env \
           /etc/webradio/monitoring.env /etc/webradio/cron.env /etc/webradio/offsite.env; do
    [ -e "$f" ] || continue
    m=$(stat -c %a "$f" 2>/dev/null || echo unknown)
    case "$f:$m" in
      */backup.key:600) record PASS "perms:$(basename "$f")" "0600" ;;
      */backup.key:*)   record FAIL "perms:$(basename "$f")" "mode $m (key must be 0600)" ;;
      *:600|*:640)      record PASS "perms:$(basename "$f")" "$m" ;;
      *:unknown)        record WARN "perms:$(basename "$f")" "cannot determine mode" ;;
      *)                record FAIL "perms:$(basename "$f")" "mode $m is too permissive" ;;
    esac
  done
fi

# --- cron --------------------------------------------------------------------
if [ -r "$CRON_LOG" ]; then
  LAST=$(tail -n 1 "$CRON_LOG")
  LAST_TS=$(printf '%s' "$LAST" | awk '{print $1}')
  LAST_CODE=$(printf '%s' "$LAST" | sed -n 's/.*status=\([0-9][0-9][0-9]\).*/\1/p')
  if [ -n "$LAST_TS" ]; then
    AGE_S=$(( $(date -u +%s) - $(date -u -d "$LAST_TS" +%s 2>/dev/null || echo 0) ))
    if [ "$AGE_S" -gt $(( BACKUP_MAX_AGE_HOURS * 3600 )) ]; then
      record WARN cron "last cron entry is $(( AGE_S / 3600 ))h old"
    elif [ "$LAST_CODE" = "200" ] || [ "$LAST_CODE" = "409" ]; then
      record PASS cron "last status=$LAST_CODE ${LAST_TS}"
    else
      record FAIL cron "last status=$LAST_CODE ${LAST_TS}"
    fi
  fi
else
  record WARN cron "log not readable: $CRON_LOG"
fi

# --- TLS certificate ---------------------------------------------------------
if [ -n "$SITE_URL" ]; then
  HOSTPORT=$(printf '%s' "$SITE_URL" | sed -E 's#^https://##; s#/.*$##')
  HOST=${HOSTPORT%%:*}
  PORT=${HOSTPORT##*:}
  [ "$PORT" = "$HOSTPORT" ] && PORT=443
  CA_ARGS=()
  [ -n "$CA_FILE" ] && CA_ARGS=(-CAfile "$CA_FILE")
  CERT=$(echo | openssl s_client -connect "$HOSTPORT" -servername "$HOST" "${CA_ARGS[@]}" 2>/dev/null \
    | openssl x509 -noout -enddate -issuer 2>/dev/null)
  END=$(printf '%s\n' "$CERT" | sed -n 's/^notAfter=//p')
  ISSUER=$(printf '%s\n' "$CERT" | sed -n 's/^issuer=//p')
  if [ -z "$END" ]; then
    record FAIL tls "no certificate from $HOSTPORT"
  elif printf '%s' "$ISSUER" | grep -q 'Caddy Local Authority'; then
    # Caddy's internal CA issues short-lived certificates and renews them
    # automatically; a 12h lifetime is normal and must not raise an alert.
    record PASS tls "internal CA certificate, auto-renewed (expires $END)"
  else
    DAYS=$(( ( $(date -d "$END" +%s) - $(date +%s) ) / 86400 ))
    if [ "$DAYS" -lt 7 ]; then
      record FAIL tls "certificate expires in ${DAYS} days ($END)"
    elif [ "$DAYS" -lt 21 ]; then
      record WARN tls "certificate expires in ${DAYS} days ($END)"
    else
      record PASS tls "certificate valid for ${DAYS} days"
    fi
  fi
fi

# --- output ------------------------------------------------------------------
SUMMARY=$(printf '%s\n' "${LINES[@]}" | paste -sd ',' -)
LINE=$(printf '{"ts":"%s","host":"%s","failed":%d,"checks":[%s]}' \
  "$(date -u +%FT%TZ)" "$(hostname)" "$FAILED" "$SUMMARY")
printf '%s\n' "$LINE" >> "$MONITOR_LOG" 2>/dev/null || true
printf '%s\n' "$LINE"

if [ "$FAILED" -gt 0 ] && [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
  curl -sS -m 10 -X POST -H 'Content-Type: application/json' --data "$LINE" "$ALERT_WEBHOOK_URL" >/dev/null || true
fi

exit $([ "$FAILED" -eq 0 ] && echo 0 || echo 1)
