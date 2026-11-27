#!/usr/bin/env bash
# Install the host operating services on a Debian/Ubuntu server.
#
#   sudo REPO=/opt/webradio bash deploy/systemd/install-native-ops.sh
#   sudo REPO=/opt/webradio bash deploy/systemd/install-native-ops.sh --dry-run
#   sudo REPO=/opt/webradio bash deploy/systemd/install-native-ops.sh --mode compose
#
# Installs (idempotent; existing configuration is kept unless --force):
#   - scripts: backup, config backup, restore drill, health, alert, offsite, cron
#   - systemd units and timers (backup 02:15, offsite 02:45, cron 03:15,
#     health every 5 min, restore drill Sundays 05:30)
#   - directories /etc/webradio (0700), /var/backups/webradio (0700),
#     /var/log/webradio (0750)
#   - configuration templates (0600) and a 0600 backup key
#   - native mode only: Caddy binary/user/dirs/config and the application unit
#
# Services are enabled only when their configuration is complete. The script
# does not touch PostgreSQL, DNS, the firewall, containers or application data.
set -euo pipefail

REPO=${REPO:-/opt/webradio}
CADDY_BIN=${CADDY_BIN:-/home/ramon/.local/bin/caddy}
FORCE=0
DRY_RUN=0
MODE=auto

usage() {
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    --apply) shift ;;   # default; accepted for symmetry with install-production.sh
    --dry-run) DRY_RUN=1; shift ;;
    --mode) MODE=${2:?--mode needs a value}; shift 2 ;;
    --mode=*) MODE=${1#*=}; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'unknown argument: %s (use --help)\n' "$1" >&2; exit 2 ;;
  esac
done
case "$MODE" in auto|compose|native) ;; *) printf 'invalid --mode: %s\n' "$MODE" >&2; exit 2 ;; esac

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "ERROR $*"; exit 1; }

run() { # description command...
  local desc=$1; shift
  if [ "$DRY_RUN" -eq 1 ]; then
    log "[dry-run] $desc"
    return 0
  fi
  "$@" || die "failed: $desc"
  log "$desc"
}

[ -d "$REPO/deploy" ] || die "REPO=$REPO does not look like the project (missing deploy/)"

if [ "$MODE" = "auto" ]; then
  if [ -f /etc/webradio/app.env ] || [ -f "$REPO/.next/standalone/server.js" ]; then
    MODE=native
  else
    MODE=compose
  fi
fi
log "mode=$MODE repo=$REPO dry_run=$DRY_RUN"

if [ "$DRY_RUN" -eq 0 ] && [ "$(id -u)" -ne 0 ]; then
  die "run with sudo (or pass --dry-run)"
fi

# --- validate the source tree before changing anything -----------------------
REQUIRED=(
  deploy/backup/pg-backup.sh deploy/backup/config-backup.sh deploy/backup/restore-drill.sh
  deploy/backup/offsite-sync.sh deploy/monitoring/health-report.sh deploy/monitoring/alert.sh
  deploy/monitoring/cron-run.sh
  deploy/systemd/webradio-backup.service deploy/systemd/webradio-backup.timer
  deploy/systemd/webradio-restore-drill.service deploy/systemd/webradio-restore-drill.timer
  deploy/systemd/webradio-health.service deploy/systemd/webradio-health.timer
  deploy/systemd/webradio-cron.service deploy/systemd/webradio-cron.timer
  deploy/systemd/webradio-offsite.service deploy/systemd/webradio-offsite.timer
  deploy/systemd/webradio-alert@.service
  deploy/backup/backup.env.example deploy/monitoring/monitoring.env.example deploy/backup/offsite.env.example
)
if [ "$MODE" = "native" ]; then
  REQUIRED+=(deploy/systemd/caddy.service deploy/systemd/webradio-app.service deploy/caddy/Caddyfile.native)
fi
for f in "${REQUIRED[@]}"; do
  [ -e "$REPO/$f" ] || die "missing source file: $REPO/$f"
done
log "source tree complete (${#REQUIRED[@]} files)"

for f in deploy/backup/*.sh deploy/monitoring/*.sh; do
  bash -n "$REPO/$f" || die "syntax error in $f"
done
log "script syntax ok"

# --- install helper ----------------------------------------------------------
install_file() { # src dst mode [keep]
  local src=$1 dst=$2 mode=$3
  if [ -e "$dst" ] && [ "$FORCE" -ne 1 ] && [ "${4:-}" = "keep" ]; then
    log "keep existing $dst"
    return 0
  fi
  run "installed $dst ($mode)" install -D -m "$mode" "$src" "$dst"
}

if [ "$DRY_RUN" -eq 1 ]; then
  log "[dry-run] would create /etc/webradio (0700), /var/backups/webradio (0700), /var/log/webradio (0750)"
else
  install -d -o root -g root -m 0700 /etc/webradio /var/backups/webradio
  install -d -o root -g root -m 0750 /var/log/webradio
fi

# --- Caddy (native form only) ------------------------------------------------
if [ "$MODE" = "native" ]; then
  if [ ! -x "$CADDY_BIN" ] && [ ! -x /usr/local/bin/caddy ]; then
    die "caddy binary not found at $CADDY_BIN (set CADDY_BIN=... or install /usr/local/bin/caddy)"
  fi
  if [ -x "$CADDY_BIN" ]; then
    run "installed /usr/local/bin/caddy ($("$CADDY_BIN" version 2>/dev/null | head -n 1))" \
      install -m 0755 "$CADDY_BIN" /usr/local/bin/caddy
  else
    log "keep existing /usr/local/bin/caddy"
  fi

  if ! id -u caddy >/dev/null 2>&1; then
    run "created system user caddy" \
      useradd --system --home-dir /var/lib/caddy --shell /usr/sbin/nologin --user-group caddy
  else
    log "keep existing system user caddy"
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    log "[dry-run] would create /var/lib/caddy, /var/log/caddy (caddy:caddy 0750), /etc/caddy (root 0750)"
  else
    install -d -o caddy -g caddy -m 0750 /var/lib/caddy /var/log/caddy
    install -d -o root -g root -m 0755 /etc/caddy
  fi

  install_file "$REPO/deploy/caddy/Caddyfile.native" /etc/caddy/Caddyfile 0644 keep
  if [ ! -e /etc/caddy/caddy.env ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
      log "[dry-run] would create /etc/caddy/caddy.env (0600)"
    else
      cat > /etc/caddy/caddy.env <<'EOF'
SITE_ADDRESS=https://CHANGE_ME.example
ACME_EMAIL=CHANGE_ME@example.com
EOF
      chmod 600 /etc/caddy/caddy.env
      log "created /etc/caddy/caddy.env (0600) - set SITE_ADDRESS before starting"
    fi
  else
    log "keep existing /etc/caddy/caddy.env"
  fi
else
  log "compose mode: Caddy runs as a container; caddy.service and webradio-app.service are not installed"
fi

# --- helper scripts ----------------------------------------------------------
install_file "$REPO/deploy/backup/pg-backup.sh" /usr/local/sbin/webradio-backup 0755
install_file "$REPO/deploy/backup/config-backup.sh" /usr/local/sbin/webradio-config-backup 0755
install_file "$REPO/deploy/backup/restore-drill.sh" /usr/local/sbin/webradio-restore-drill 0755
install_file "$REPO/deploy/backup/offsite-sync.sh" /usr/local/sbin/webradio-offsite-sync 0755
install_file "$REPO/deploy/monitoring/health-report.sh" /usr/local/sbin/webradio-health 0755
install_file "$REPO/deploy/monitoring/alert.sh" /usr/local/sbin/webradio-alert 0755
install_file "$REPO/deploy/monitoring/cron-run.sh" /usr/local/sbin/webradio-cron-run 0755

# --- environment templates ---------------------------------------------------
install_file "$REPO/deploy/backup/backup.env.example" /etc/webradio/backup.env 0600 keep
install_file "$REPO/deploy/monitoring/monitoring.env.example" /etc/webradio/monitoring.env 0600 keep
install_file "$REPO/deploy/backup/offsite.env.example" /etc/webradio/offsite.env 0600 keep

if [ -s /etc/webradio/backup.key ]; then
  log "keep existing /etc/webradio/backup.key"
  [ "$DRY_RUN" -eq 1 ] || chmod 600 /etc/webradio/backup.key
elif [ "$DRY_RUN" -eq 1 ]; then
  log "[dry-run] would generate /etc/webradio/backup.key (0600)"
else
  ( umask 077; openssl rand -base64 32 | tr -d '\n' > /etc/webradio/backup.key )
  chmod 600 /etc/webradio/backup.key
  log "generated /etc/webradio/backup.key (0600) - copy it to your password manager now"
fi

# --- systemd units -----------------------------------------------------------
UNITS=(
  webradio-backup.service webradio-backup.timer
  webradio-restore-drill.service webradio-restore-drill.timer
  webradio-health.service webradio-health.timer
  webradio-cron.service webradio-cron.timer
  webradio-offsite.service webradio-offsite.timer
  webradio-alert@.service
)
[ "$MODE" = "native" ] && UNITS+=(caddy.service webradio-app.service)
for u in "${UNITS[@]}"; do
  install_file "$REPO/deploy/systemd/$u" "/etc/systemd/system/$u" 0644
done

if [ "$DRY_RUN" -eq 0 ]; then
  systemctl daemon-reload
  # Validate the installed units before enabling anything.
  if command -v systemd-analyze >/dev/null 2>&1; then
    if OUT=$(systemd-analyze verify "${UNITS[@]/#//etc/systemd/system/}" 2>&1); then
      log "systemd-analyze verify ok (${#UNITS[@]} units)"
    else
      log "ERROR systemd-analyze verify failed:"
      printf '%s\n' "$OUT" | head -n 20
      exit 1
    fi
  fi
else
  log "[dry-run] would run systemctl daemon-reload and systemd-analyze verify"
fi

# --- conditional enablement --------------------------------------------------
enable() { # unit description
  if [ "$DRY_RUN" -eq 1 ]; then
    log "[dry-run] would enable --now $1 ($2)"
  else
    systemctl enable --now "$1" || die "could not enable $1"
    sleep 1
    systemctl is-active --quiet "$1" || { journalctl -u "$1" -n 20 --no-pager || true; die "$1 did not stay active"; }
    log "enabled $1 ($2)"
  fi
}

if [ "$MODE" = "native" ]; then
  if grep -qE '^[[:space:]]*[A-Z0-9_]+=.*CHANGE_ME' /etc/caddy/caddy.env 2>/dev/null; then
    log "WARN /etc/caddy/caddy.env still contains CHANGE_ME - caddy.service NOT enabled"
  else
    run "Caddyfile validated" runuser -u caddy -- /usr/local/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
    enable caddy.service "edge proxy"
  fi
  if [ ! -r /etc/webradio/app.env ] || grep -qE '^[[:space:]]*[A-Z0-9_]+=.*CHANGE_ME' /etc/webradio/app.env 2>/dev/null; then
    log "WARN /etc/webradio/app.env missing or incomplete - webradio-app.service NOT enabled"
  else
    enable webradio-app.service "Next.js application"
  fi
fi

if grep -qE '^[[:space:]]*[A-Z0-9_]+=.*CHANGE_ME' /etc/webradio/backup.env 2>/dev/null; then
  log "WARN /etc/webradio/backup.env still contains CHANGE_ME - backup/drill timers NOT enabled"
elif ! grep -qE '^[[:space:]]*PGDATABASE=.+' /etc/webradio/backup.env; then
  log "WARN /etc/webradio/backup.env has no PGDATABASE - backup/drill timers NOT enabled"
else
  enable webradio-backup.timer "daily encrypted backup"
  enable webradio-restore-drill.timer "weekly restore drill"
fi
if grep -qE '^[[:space:]]*(SITE_URL|HEALTH_URL)=.*CHANGE_ME' /etc/webradio/monitoring.env 2>/dev/null; then
  log "WARN /etc/webradio/monitoring.env still contains CHANGE_ME - health timer NOT enabled"
else
  enable webradio-health.timer "health check every 5 minutes"
fi
if [ -r /etc/webradio/cron.env ] && ! grep -qE '^[[:space:]]*[A-Z0-9_]+=.*CHANGE_ME' /etc/webradio/cron.env; then
  enable webradio-cron.timer "analytics schedules"
else
  log "WARN /etc/webradio/cron.env missing or incomplete - analytics timer NOT enabled"
fi
if grep -qE '^[[:space:]]*OFFSITE_TARGET=.+' /etc/webradio/offsite.env 2>/dev/null; then
  enable webradio-offsite.timer "offsite backup copy"
else
  log "offsite backup not configured - timer NOT enabled (see deploy/backup/offsite.env.example)"
fi

if [ "$DRY_RUN" -eq 0 ]; then
  log "active timers: $(systemctl list-timers 'webradio-*' --no-legend 2>/dev/null | awk '{print $(NF-1)}' | tr '\n' ' ')"
fi
log "done. Next:"
log "  1. fill in /etc/webradio/{backup,monitoring,cron}.env (and caddy.env for native)"
log "  2. sudo systemctl start webradio-backup.service webradio-health.service"
log "  3. deploy/install/preflight.sh --mode $MODE"
