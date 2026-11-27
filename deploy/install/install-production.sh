#!/usr/bin/env bash
# Prepare a Debian/Ubuntu host for the WebRadio Website production deployment.
#
#   deploy/install/install-production.sh                 # dry run (default)
#   sudo deploy/install/install-production.sh --apply    # make the changes
#   sudo deploy/install/install-production.sh --apply --mode compose --env-file deploy/env.production
#
# Scope: host directories, ownership/modes, the runtime/service account, the
# environment files and the backup key. It deliberately does NOT install
# packages, start containers, run migrations, touch PostgreSQL contents, DNS,
# the firewall or ACME. Caddy/systemd installation is a separate step
# (deploy/systemd/install-native-ops.sh).
#
# Properties:
#   - dry run by default; every action is printed as `would ...`
#   - idempotent: existing files are never overwritten and secrets are never
#     regenerated (use --force only for configuration templates, never keys)
#   - secret values are generated locally and never printed or logged
#   - refuses to run as a non-root user with --apply
set -uo pipefail

REPO=""
MODE=compose
ENV_FILE=""
APPLY=0
FORCE=0
CREATE_USER=1

usage() {
  cat <<'EOF'
Usage: deploy/install/install-production.sh [options]

  --apply                  perform the changes (default: dry run)
  --mode compose|native    operating form (default: compose)
  --repo DIR               project root (default: two levels above this script)
  --env-file FILE          compose env file (default: deploy/env.production)
  --no-user                do not create the webradio system user (native mode)
  --force                  replace template files that already exist
  -h, --help               show this help

Creates: /etc/webradio (0700), /var/backups/webradio (0700),
/var/log/webradio (0750), the env files (0600) with generated secrets,
/etc/webradio/backup.key (0600) and, for the native form, the webradio user.
Then run deploy/install/preflight.sh and deploy/systemd/install-native-ops.sh.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --mode) MODE=${2:?--mode needs a value}; shift 2 ;;
    --mode=*) MODE=${1#*=}; shift ;;
    --repo) REPO=${2:?--repo needs a value}; shift 2 ;;
    --repo=*) REPO=${1#*=}; shift ;;
    --env-file) ENV_FILE=${2:?--env-file needs a value}; shift 2 ;;
    --env-file=*) ENV_FILE=${1#*=}; shift ;;
    --no-user) CREATE_USER=0; shift ;;
    --force) FORCE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'unknown argument: %s (use --help)\n' "$1" >&2; exit 2 ;;
  esac
done

case "$MODE" in compose|native) ;; *) printf 'invalid --mode: %s\n' "$MODE" >&2; exit 2 ;; esac
if [ -z "$REPO" ]; then
  REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd) || REPO="."
fi
REPO=${REPO%/}
if [ -z "$ENV_FILE" ]; then
  if [ "$MODE" = "compose" ]; then ENV_FILE="$REPO/deploy/env.production"; else ENV_FILE=/etc/webradio/app.env; fi
fi

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
dry() { [ "$APPLY" -eq 1 ] || log "[dry-run] $*"; }
die() { log "ERROR $*"; exit 1; }

run() { # describe command...
  local desc=$1; shift
  if [ "$APPLY" -eq 1 ]; then
    if "$@"; then log "$desc"; else die "failed: $desc"; fi
  else
    log "[dry-run] $desc"
  fi
}

[ -d "$REPO/deploy" ] || die "REPO=$REPO does not look like the project (missing deploy/)"
if [ "$APPLY" -eq 1 ] && [ "$(id -u)" -ne 0 ]; then
  die "--apply needs root (run with sudo)"
fi

log "mode=$MODE repo=$REPO env=$ENV_FILE apply=$APPLY"

# --- directories -------------------------------------------------------------
ensure_dir() { # path mode owner:group
  local path=$1 mode=$2 owner=$3
  if [ -d "$path" ]; then
    log "keep directory $path"
    if [ "$APPLY" -eq 1 ]; then
      chmod "$mode" "$path" || die "chmod $mode $path failed"
      chown "$owner" "$path" || die "chown $owner $path failed"
    else
      log "[dry-run] would enforce $mode $owner on $path"
    fi
  else
    run "created directory $path ($mode $owner)" install -d -m "$mode" -o "${owner%%:*}" -g "${owner##*:}" "$path"
  fi
}

ensure_dir /etc/webradio 0700 root:root
ensure_dir /var/backups/webradio 0700 root:root
ensure_dir /var/log/webradio 0750 root:root

if [ "$MODE" = "native" ]; then
  if id -u webradio >/dev/null 2>&1; then
    log "keep existing system user webradio"
  elif [ "$CREATE_USER" -eq 0 ]; then
    log "WARN user webradio missing and --no-user given"
  else
    run "created system user webradio (home /opt/webradio, nologin)" \
      useradd --system --home-dir /opt/webradio --shell /usr/sbin/nologin --user-group webradio
  fi
  if [ -d /opt/webradio ]; then
    if [ "$APPLY" -eq 1 ]; then chown -R webradio:webradio /opt/webradio || die "chown /opt/webradio failed"; chmod 0750 /opt/webradio; fi
    log "keep /opt/webradio (owner webradio:webradio, 0750)"
  else
    log "WARN /opt/webradio missing; deploy the repository there before installing the app unit"
  fi
fi

# --- helpers -----------------------------------------------------------------
random_secret() { # bytes
  openssl rand -base64 "$1" 2>/dev/null | tr -d '\n=' | cut -c1-"$(( $1 * 4 / 3 ))"
}
random_hex() { # bytes
  openssl rand -hex "$1" 2>/dev/null
}

# Replace KEY=... in an env file without exposing the value on the command line.
set_env_value() { # file key value
  local file=$1 key=$2 value=$3 tmp
  tmp=$(mktemp "${file}.XXXXXX") || return 1
  KEY="$key" VALUE="$value" awk '
    BEGIN { k = ENVIRON["KEY"]; v = ENVIRON["VALUE"]; done = 0 }
    $0 ~ "^[[:space:]]*" k "=" { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$file" > "$tmp" || { rm -f "$tmp"; return 1; }
  chmod 600 "$tmp"
  mv -f "$tmp" "$file"
}

install_template() { # src dst mode
  local src=$1 dst=$2 mode=$3
  [ -r "$src" ] || die "template missing: $src"
  if [ -e "$dst" ] && [ "$FORCE" -ne 1 ]; then
    log "keep existing $dst"
    return 0
  fi
  run "installed $dst ($mode)" install -D -m "$mode" "$src" "$dst"
  if [ "$APPLY" -eq 1 ]; then chmod "$mode" "$dst" || die "chmod $dst failed"; fi
}

# --- compose environment -----------------------------------------------------
if [ "$MODE" = "compose" ]; then
  install_template "$REPO/deploy/env.production.example" "$ENV_FILE" 0600 || exit 1
  if [ "$APPLY" -eq 1 ] && [ -r "$ENV_FILE" ]; then
    if grep -q '^POSTGRES_PASSWORD=CHANGE_ME' "$ENV_FILE"; then
      set_env_value "$ENV_FILE" POSTGRES_PASSWORD "$(random_hex 24)" || die "could not set POSTGRES_PASSWORD"
      log "generated POSTGRES_PASSWORD (value not shown)"
    fi
    if grep -q '^NEXTAUTH_SECRET=CHANGE_ME' "$ENV_FILE"; then
      set_env_value "$ENV_FILE" NEXTAUTH_SECRET "$(random_secret 32)" || die "could not set NEXTAUTH_SECRET"
      log "generated NEXTAUTH_SECRET (value not shown)"
    fi
    if grep -q '^CRON_SECRET=CHANGE_ME' "$ENV_FILE"; then
      set_env_value "$ENV_FILE" CRON_SECRET "$(random_secret 32)" || die "could not set CRON_SECRET"
      log "generated CRON_SECRET (value not shown)"
    fi
    chmod 600 "$ENV_FILE"
  fi
else
  install_template "$REPO/deploy/env.native.example" "$ENV_FILE" 0600 || exit 1
  if [ "$APPLY" -eq 1 ] && [ -r "$ENV_FILE" ]; then
    if grep -q '^NEXTAUTH_SECRET=CHANGE_ME' "$ENV_FILE"; then
      set_env_value "$ENV_FILE" NEXTAUTH_SECRET "$(random_secret 32)" || die "could not set NEXTAUTH_SECRET"
      log "generated NEXTAUTH_SECRET (value not shown)"
    fi
    if grep -q '^CRON_SECRET=CHANGE_ME' "$ENV_FILE"; then
      set_env_value "$ENV_FILE" CRON_SECRET "$(random_secret 32)" || die "could not set CRON_SECRET"
      log "generated CRON_SECRET (value not shown)"
    fi
    if id -u webradio >/dev/null 2>&1; then
      chown webradio:webradio "$ENV_FILE" || die "chown $ENV_FILE failed"
      chmod 0640 "$ENV_FILE"
      log "app.env owned by webradio:webradio (0640, readable by the service only)"
    fi
  fi
fi

# --- backup key --------------------------------------------------------------
KEY_FILE=/etc/webradio/backup.key
if [ -s "$KEY_FILE" ]; then
  log "keep existing $KEY_FILE"
  if [ "$APPLY" -eq 1 ]; then chmod 600 "$KEY_FILE"; fi
else
  if [ "$APPLY" -eq 1 ]; then
    ( umask 077; openssl rand -base64 32 | tr -d '\n' > "$KEY_FILE" ) || die "could not create $KEY_FILE"
    chmod 600 "$KEY_FILE"
    log "generated $KEY_FILE (0600) - copy it to your password manager now"
  else
    log "[dry-run] would generate $KEY_FILE (0600)"
  fi
fi

# --- service configuration ---------------------------------------------------
install_template "$REPO/deploy/backup/backup.env.example" /etc/webradio/backup.env 0600 || exit 1
install_template "$REPO/deploy/monitoring/monitoring.env.example" /etc/webradio/monitoring.env 0600 || exit 1
install_template "$REPO/deploy/backup/offsite.env.example" /etc/webradio/offsite.env 0600 || exit 1

if [ "$APPLY" -eq 1 ]; then
  # Point the templates at this deployment without touching secrets.
  if [ "$MODE" = "compose" ]; then
    set_env_value /etc/webradio/backup.env BACKUP_MODE docker || die "could not set BACKUP_MODE"
    set_env_value /etc/webradio/backup.env COMPOSE_FILE "$REPO/compose.yaml" || die "could not set COMPOSE_FILE"
    set_env_value /etc/webradio/backup.env COMPOSE_ENV_FILE "$ENV_FILE" || die "could not set COMPOSE_ENV_FILE"
    set_env_value /etc/webradio/backup.env REPO_DIR "$REPO" || die "could not set REPO_DIR"
    set_env_value /etc/webradio/monitoring.env MODE docker || die "could not set monitoring MODE"
  else
    set_env_value /etc/webradio/backup.env BACKUP_MODE native || die "could not set BACKUP_MODE"
    set_env_value /etc/webradio/backup.env REPO_DIR "$REPO" || die "could not set REPO_DIR"
    set_env_value /etc/webradio/monitoring.env MODE native || die "could not set monitoring MODE"
  fi
  # The compose project name is `webradio`, so the health checks can address
  # `caddy`, `webradio` and `postgres` through the compose file paths above.
  chmod 600 /etc/webradio/backup.env /etc/webradio/monitoring.env /etc/webradio/offsite.env
  log "service configuration written (0600, no secrets printed)"
fi

# --- cron environment --------------------------------------------------------
CRON_ENV=/etc/webradio/cron.env
if [ -s "$CRON_ENV" ]; then
  log "keep existing $CRON_ENV"
else
  if [ "$APPLY" -eq 1 ]; then
    cron_secret=$(sed -n 's/^[[:space:]]*CRON_SECRET=//p' "$ENV_FILE" 2>/dev/null | tail -n 1)
    site=$(sed -n 's/^[[:space:]]*SITE_ADDRESS=//p' "$ENV_FILE" 2>/dev/null | tail -n 1)
    [ -n "$cron_secret" ] || die "CRON_SECRET missing in $ENV_FILE"
    ( umask 077
      {
        printf 'CRON_SECRET=%s\n' "$cron_secret"
        printf 'SITE_ADDRESS=%s\n' "${site:-https://CHANGE_ME.example}"
        printf 'CRON_LOG=/var/log/webradio/cron.log\n'
      } > "$CRON_ENV" ) || die "could not create $CRON_ENV"
    chmod 600 "$CRON_ENV"
    log "created $CRON_ENV (0600, secret not printed)"
  else
    log "[dry-run] would create $CRON_ENV (0600)"
  fi
fi

# --- verification ------------------------------------------------------------
if [ "$APPLY" -eq 1 ]; then
  failures=0
  for f in "$ENV_FILE" /etc/webradio/backup.env /etc/webradio/monitoring.env /etc/webradio/offsite.env /etc/webradio/backup.key; do
    [ -r "$f" ] || { log "ERROR not readable: $f"; failures=$((failures + 1)); continue; }
    mode=$(stat -c %a "$f" 2>/dev/null || echo unknown)
    case "$mode" in
      600|640) log "ok $f ($mode)" ;;
      *) log "ERROR $f has mode $mode (expected 0600/0640)"; failures=$((failures + 1)) ;;
    esac
  done
  [ "$failures" -eq 0 ] || die "$failures permission problem(s)"
fi

if [ "$APPLY" -eq 1 ]; then
  log "done. Remaining manual values (never generated): SITE_ADDRESS, NEXTAUTH_URL, ACME_EMAIL, POSTGRES_USER/DB."
  log "next: deploy/install/preflight.sh --mode $MODE --env-file $ENV_FILE"
  [ "$MODE" = "native" ] && log "next: sudo REPO=$REPO bash deploy/systemd/install-native-ops.sh"
else
  log "dry run complete; re-run with --apply to make these changes"
fi
