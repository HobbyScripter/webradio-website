#!/usr/bin/env bash
# Read-only preflight for the WebRadio Website production host.
#
#   deploy/install/preflight.sh --mode compose --env-file deploy/env.production
#   deploy/install/preflight.sh --mode native
#   deploy/install/preflight.sh --mode compose --env-file deploy/env.test --allow-non-linux
#
# The script never writes to the host. It validates prerequisites, the
# environment file, permissions, ports, resource headroom and that only one
# operating form is active. Exit codes:
#   0  all checks passed (warnings are allowed)
#   1  at least one FAIL
#   2  warnings only, with --strict
#
# Output is secret-free: env values are only checked for length and
# placeholders, never printed.
set -uo pipefail

MODE=auto
REPO=""
ENV_FILE=""
JSON=0
QUIET=0
STRICT=0
ALLOW_NON_LINUX=0
ALLOW_MISSING_ENV=0

usage() {
  cat <<'EOF'
Usage: deploy/install/preflight.sh [options]

  --mode compose|native|auto  operating form to validate (default: auto)
  --repo DIR                  project root (default: two levels above this script)
  --env-file FILE             compose env file (default: deploy/env.production)
  --json                      emit one JSON document instead of text lines
  --quiet                     suppress per-check lines (summary only)
  --strict                    warnings also produce exit code 2
  --allow-non-linux           downgrade the OS check to WARN (local dry runs)
  --allow-missing-env         downgrade missing env/backup files to WARN (bootstrap)
  -h, --help                  show this help

Checks: OS/systemd/arch, required commands and versions, env file (mode, marker,
placeholders, secret strength), directories and permissions, backup key,
listening ports, conflicting operating forms, CPU/RAM/disk headroom, time
synchronisation, compose config rendering and Vercel files.

The script is read-only. `deploy/install/install-production.sh` prepares the
host; run this script again afterwards.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE=${2:?--mode needs a value}; shift 2 ;;
    --mode=*) MODE=${1#*=}; shift ;;
    --repo) REPO=${2:?--repo needs a value}; shift 2 ;;
    --repo=*) REPO=${1#*=}; shift ;;
    --env-file) ENV_FILE=${2:?--env-file needs a value}; shift 2 ;;
    --env-file=*) ENV_FILE=${1#*=}; shift ;;
    --json) JSON=1; shift ;;
    --quiet) QUIET=1; shift ;;
    --strict) STRICT=1; shift ;;
    --allow-non-linux) ALLOW_NON_LINUX=1; shift ;;
    --allow-missing-env) ALLOW_MISSING_ENV=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'unknown argument: %s (use --help)\n' "$1" >&2; exit 2 ;;
  esac
done

case "$MODE" in compose|native|auto) ;; *) printf 'invalid --mode: %s\n' "$MODE" >&2; exit 2 ;; esac

if [ -z "$REPO" ]; then
  REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd) || REPO="."
fi
REPO=${REPO%/}

LEVELS=()
CHECKS=()
DETAILS=()
PASSED=0
WARNED=0
FAILED=0

record() { # level check detail
  LEVELS+=("$1")
  CHECKS+=("$2")
  DETAILS+=("$3")
  case "$1" in
    PASS) PASSED=$((PASSED + 1)) ;;
    WARN) WARNED=$((WARNED + 1)) ;;
    FAIL) FAILED=$((FAILED + 1)) ;;
  esac
  if [ "$JSON" -eq 0 ] && [ "$QUIET" -eq 0 ]; then
    printf '%-4s %-26s %s\n' "$1" "$2" "$3"
  fi
}
ok() { record PASS "$1" "$2"; }
warn() { record WARN "$1" "$2"; }
bad() { record FAIL "$1" "$2"; }

have() { command -v "$1" >/dev/null 2>&1; }

env_value() { # key file
  sed -n "s/^[[:space:]]*$1=//p" "$2" 2>/dev/null | tail -n 1 | sed -e 's/^"//' -e 's/"$//'
}

version_ge() { # have required
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V 2>/dev/null | head -n 1)" = "$2" ]
}

first_line() { printf '%s' "$1" | tr '\n' ' ' | cut -c1-160; }

# --- resolve operating form --------------------------------------------------
if [ "$MODE" = "auto" ]; then
  if [ -f /etc/webradio/app.env ] || [ -f /etc/systemd/system/webradio-app.service ] \
     || [ -f /etc/systemd/system/webradio.service ]; then
    MODE=native
  else
    MODE=compose
  fi
fi
ok mode "operating form: $MODE"

if [ "$MODE" = "compose" ] && [ -z "$ENV_FILE" ]; then
  ENV_FILE="$REPO/deploy/env.production"
fi

# --- repository --------------------------------------------------------------
layout_ok=1
for f in package.json Dockerfile .gitignore; do
  [ -e "$REPO/$f" ] || { bad repo_layout "missing $f"; layout_ok=0; }
done
if [ "$MODE" = "compose" ]; then
  [ -e "$REPO/compose.yaml" ] || { bad repo_layout "missing compose.yaml"; layout_ok=0; }
fi
for d in deploy docs src prisma; do
  [ -d "$REPO/$d" ] || { bad repo_layout "missing directory $d/"; layout_ok=0; }
done
[ "$layout_ok" -eq 1 ] && ok repo_layout "project layout complete ($REPO)"

# --- operating system --------------------------------------------------------
OS_ID=""
OS_VER=""
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID=${ID:-unknown}
  OS_VER=${VERSION_ID:-unknown}
fi
if [ "$(uname -s 2>/dev/null)" != "Linux" ]; then
  if [ "$ALLOW_NON_LINUX" -eq 1 ]; then
    warn os "not Linux ($(uname -s 2>/dev/null)); production target must be Debian/Ubuntu"
  else
    bad os "not Linux ($(uname -s 2>/dev/null)); run on the production host"
  fi
else
  case "$OS_ID" in
    ubuntu)
      if version_ge "$OS_VER" 22.04; then ok os "Ubuntu $OS_VER"; else warn os "Ubuntu $OS_VER is older than 22.04"; fi ;;
    debian)
      if version_ge "$OS_VER" 12; then ok os "Debian $OS_VER"; else warn os "Debian $OS_VER is older than 12"; fi ;;
    *)
      warn os "untested distribution: $OS_ID $OS_VER (validated: Debian 12/13, Ubuntu 24.04/26.04)" ;;
  esac
fi

ARCH=$(uname -m 2>/dev/null || echo unknown)
case "$ARCH" in
  x86_64|aarch64) ok arch "$ARCH (linux/amd64 or linux/arm64 images available)" ;;
  *) warn arch "untested architecture: $ARCH" ;;
esac

# --- systemd -----------------------------------------------------------------
if have systemctl; then
  ok systemd "$(systemctl --version 2>/dev/null | head -n 1)"
  if have timedatectl; then
    NTP=$(timedatectl show -p NTPSynchronized --value 2>/dev/null || echo unknown)
    case "$NTP" in
      yes) ok time_sync "clock synchronised (NTP)" ;;
      no) warn time_sync "clock not synchronised; ACME and TLS validation need correct time" ;;
      *) warn time_sync "cannot query time synchronisation" ;;
    esac
  else
    warn time_sync "timedatectl not available"
  fi
else
  if [ "$MODE" = "native" ]; then
    bad systemd "systemctl missing (native form requires systemd)"
  else
    warn systemd "systemctl missing; compose runs, but timers/monitoring need systemd"
  fi
fi

# --- commands and versions ---------------------------------------------------
missing=0
if [ "$MODE" = "compose" ]; then
  for c in docker openssl curl sha256sum tar; do
    have "$c" || { bad "cmd:$c" "required command not found: $c"; missing=1; }
  done
  if have docker; then
    if docker info >/dev/null 2>&1; then
      ok docker_daemon "daemon reachable"
      DV=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo 0)
      if version_ge "${DV%%-*}" 27.0.0; then ok docker_version "$DV (>= 27)"; else warn docker_version "$DV is older than 27"; fi
    else
      bad docker_daemon "docker daemon not reachable (is it running / is the user in the docker group?)"
    fi
    if docker compose version >/dev/null 2>&1; then
      CV=$(docker compose version --short 2>/dev/null | sed 's/^v//')
      if version_ge "${CV%%-*}" 2.30.0; then ok compose_version "$CV (>= 2.30)"; else warn compose_version "$CV is older than 2.30"; fi
    else
      bad compose_cli "docker compose plugin missing"
    fi
  fi
else
  for c in node npm openssl curl sha256sum tar psql pg_dump pg_restore pg_isready; do
    have "$c" || { bad "cmd:$c" "required command not found: $c"; missing=1; }
  done
  if have node; then
    NV=$(node -v 2>/dev/null | sed 's/^v//')
    if version_ge "$NV" 24.11.0; then ok node_version "$NV (>= 24.11)"; else warn node_version "$NV is older than 24.11"; fi
  fi
  if [ ! -x /usr/local/bin/caddy ] && ! have caddy; then
    bad caddy_binary "caddy not found (install via deploy/systemd/install-native-ops.sh)"
  else
    CADDY_V=$(/usr/local/bin/caddy version 2>/dev/null | head -n 1 || caddy version 2>/dev/null | head -n 1)
    ok caddy_binary "$CADDY_V"
  fi
  [ -e "$REPO/.next/standalone/server.js" ] \
    && ok app_build "standalone build present" \
    || warn app_build ".next/standalone/server.js missing; run npm ci && npm run build"
fi
[ "$missing" -eq 0 ] && ok commands "all required commands present"

# --- environment file --------------------------------------------------------
REQUIRED_ENV=""
if [ "$MODE" = "compose" ]; then
  REQUIRED_ENV="SITE_ADDRESS NEXTAUTH_URL POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB NEXTAUTH_SECRET"
else
  ENV_FILE=${ENV_FILE:-/etc/webradio/app.env}
  REQUIRED_ENV="DATABASE_URL NEXTAUTH_URL NEXTAUTH_SECRET"
fi

if [ ! -r "$ENV_FILE" ]; then
  if [ "$ALLOW_MISSING_ENV" -eq 1 ]; then
    warn env_file "missing $ENV_FILE (expected during bootstrap)"
  else
    bad env_file "missing or unreadable: $ENV_FILE"
  fi
else
  ok env_file "readable: $ENV_FILE"
  PERM=$(stat -c %a "$ENV_FILE" 2>/dev/null || echo unknown)
  case "$PERM" in
    600) ok env_mode "0600" ;;
    640) ok env_mode "0640 (group-readable; expected for /etc/webradio/app.env)" ;;
    660) warn env_mode "0660 (readable/writable by a group); use 0640 or 0600" ;;
    unknown) warn env_mode "cannot determine mode (non-POSIX filesystem?)" ;;
    *) bad env_mode "$PERM is too permissive; chmod 600 $ENV_FILE" ;;
  esac
  if grep -q $'\r' "$ENV_FILE" 2>/dev/null; then
    warn env_newlines "CRLF line endings; systemd/compose expect LF"
  else
    ok env_newlines "LF line endings"
  fi

  placeholders=0
  for key in $REQUIRED_ENV; do
    value=$(env_value "$key" "$ENV_FILE")
    if [ -z "$value" ]; then
      bad "env:$key" "required key is missing or empty"
    elif printf '%s' "$value" | grep -q 'CHANGE_ME'; then
      bad "env:$key" "still contains CHANGE_ME"
      placeholders=$((placeholders + 1))
    else
      ok "env:$key" "set"
    fi
  done

  if [ "$MODE" = "compose" ]; then
    marker=$(env_value WEBRADIO_STACK_ENV "$ENV_FILE")
    if [ -n "$marker" ]; then ok env_marker "WEBRADIO_STACK_ENV=$marker"; else bad env_marker "WEBRADIO_STACK_ENV missing (wrong env file?)"; fi
    site=$(env_value SITE_ADDRESS "$ENV_FILE")
    case "$site" in
      https://*) ok env_site "SITE_ADDRESS uses HTTPS" ;;
      "") : ;;
      *) warn env_site "SITE_ADDRESS is not HTTPS: $site (test hosts may use http://localhost)" ;;
    esac
  fi

  NEXTAUTH_URL_V=$(env_value NEXTAUTH_URL "$ENV_FILE")
  case "$NEXTAUTH_URL_V" in
    https://*|http://localhost*) ok env_nextauth_url "NEXTAUTH_URL matches an allowed origin" ;;
    "") : ;;
    *) warn env_nextauth_url "NEXTAUTH_URL is not HTTPS: $NEXTAUTH_URL_V" ;;
  esac

  secret=$(env_value NEXTAUTH_SECRET "$ENV_FILE")
  if [ -n "$secret" ] && ! printf '%s' "$secret" | grep -q 'CHANGE_ME'; then
    if [ "${#secret}" -ge 32 ]; then ok env_nextauth_secret "length ${#secret} (>= 32)"; else warn env_nextauth_secret "length ${#secret} (< 32)"; fi
  fi
  cron_secret=$(env_value CRON_SECRET "$ENV_FILE")
  if [ -z "$cron_secret" ]; then
    warn env_cron_secret "CRON_SECRET unset; /api/cron/analytics answers 503"
  elif [ "${#cron_secret}" -lt 32 ]; then
    warn env_cron_secret "length ${#cron_secret} (< 32)"
  else
    ok env_cron_secret "set (length ${#cron_secret})"
  fi
  if [ "$MODE" = "compose" ]; then
    dbpw=$(env_value POSTGRES_PASSWORD "$ENV_FILE")
    if [ -n "$dbpw" ] && [ "${#dbpw}" -lt 16 ]; then warn env_db_password "length ${#dbpw} (< 16)"; elif [ -n "$dbpw" ]; then ok env_db_password "length ${#dbpw} (>= 16)"; fi
  fi

  if have git && git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1; then
    if git -C "$REPO" check-ignore -q "$ENV_FILE" 2>/dev/null; then
      ok env_gitignore "env file is git-ignored"
    else
      bad env_gitignore "$ENV_FILE is NOT git-ignored"
    fi
  fi
fi

# --- directories and permissions --------------------------------------------
DIRS="/etc/webradio /var/backups/webradio /var/log/webradio"
for d in $DIRS; do
  if [ -d "$d" ]; then
    DM=$(stat -c '%a %U:%G' "$d" 2>/dev/null || echo "unknown")
    ok "dir:$d" "$DM"
  elif [ "$ALLOW_MISSING_ENV" -eq 1 ]; then
    warn "dir:$d" "missing (install-production.sh creates it)"
  else
    bad "dir:$d" "missing; run deploy/install/install-production.sh --apply"
  fi
done

if [ "$MODE" = "native" ] && [ -d /opt/webradio ]; then
  OM=$(stat -c '%a %U:%G' /opt/webradio 2>/dev/null || echo unknown)
  ok dir_repo "$OM"
fi

# --- backup key --------------------------------------------------------------
KEY_FILE=${BACKUP_KEY_FILE:-/etc/webradio/backup.key}
if [ -r "$KEY_FILE" ]; then
  KM=$(stat -c %a "$KEY_FILE" 2>/dev/null || echo unknown)
  KSIZE=$(wc -c < "$KEY_FILE" 2>/dev/null || echo 0)
  case "$KM" in
    600) ok backup_key "0600, $KSIZE bytes" ;;
    *) bad backup_key "mode $KM (must be 0600)" ;;
  esac
  [ "$KSIZE" -ge 32 ] || warn backup_key "key is only $KSIZE bytes (< 32)"
else
  if [ "$ALLOW_MISSING_ENV" -eq 1 ]; then
    warn backup_key "missing $KEY_FILE (install-production.sh generates it)"
  else
    bad backup_key "missing $KEY_FILE; backups refuse to run without encryption"
  fi
fi

# --- ports and conflicting operating forms -----------------------------------
if have ss; then
  LISTEN=$(ss -H -ltn 2>/dev/null | awk '{print $4}')
  for p in 80 443; do
    if printf '%s\n' "$LISTEN" | grep -qE "[:.]$p$"; then
      bad "port:$p" "already in use: $(printf '%s\n' "$LISTEN" | grep -E "[:.]$p$" | head -n 1)"
    else
      ok "port:$p" "free"
    fi
  done
else
  warn ports "ss not available; cannot verify ports 80/443"
fi

COMPOSE_UP=0
if have docker && docker info >/dev/null 2>&1; then
  if [ -n "$(docker ps --filter 'name=webradio-' --format '{{.Names}}' 2>/dev/null)" ]; then
    COMPOSE_UP=1
    warn compose_running "compose containers active: $(docker ps --filter 'name=webradio-' --format '{{.Names}}' | tr '\n' ' ')"
  else
    ok compose_running "no webradio compose containers running"
  fi
fi
NATIVE_UP=0
NATIVE_ACTIVE=""
if have systemctl; then
  for u in webradio.service webradio-app.service; do
    if [ "$(systemctl is-active "$u" 2>/dev/null || true)" = "active" ]; then
      NATIVE_UP=1
      NATIVE_ACTIVE="$NATIVE_ACTIVE $u"
    fi
  done
fi
if [ "$NATIVE_UP" -eq 1 ] && [ "$MODE" = "native" ]; then
  ok native_running "native units active (expected):$NATIVE_ACTIVE"
elif [ "$NATIVE_UP" -eq 1 ]; then
  warn native_running "native units active:$NATIVE_ACTIVE"
fi
if [ "$MODE" = "compose" ] && [ "$NATIVE_UP" -eq 1 ]; then
  bad mode_conflict "native and compose forms both active; shut one down (port 80/443 conflict)"
elif [ "$MODE" = "native" ] && [ "$COMPOSE_UP" -eq 1 ]; then
  bad mode_conflict "compose stack is running while validating the native form"
else
  ok mode_conflict "no competing operating form detected"
fi

# --- resources ---------------------------------------------------------------
if [ -r /proc/meminfo ]; then
  MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
  if [ "$MEM_MB" -ge 1800 ]; then
    ok memory "${MEM_MB} MB (recommended)"
  elif [ "$MEM_MB" -ge 900 ]; then
    warn memory "${MEM_MB} MB (minimum; 2 GB recommended)"
  else
    bad memory "${MEM_MB} MB (< 1 GB; app + PostgreSQL will not fit)"
  fi
else
  warn memory "cannot read /proc/meminfo (non-Linux host)"
fi
if have df; then
  DISK_FREE=$(df -Pk / 2>/dev/null | awk 'NR==2 {print int($4/1024)}')
  if [ -n "${DISK_FREE:-}" ]; then
    if [ "$DISK_FREE" -ge 15000 ]; then ok disk "${DISK_FREE} MB free on /"
    elif [ "$DISK_FREE" -ge 8000 ]; then warn disk "${DISK_FREE} MB free on / (>= 15 GB recommended)"
    else bad disk "${DISK_FREE} MB free on / (< 8 GB)"; fi
  else
    warn disk "cannot determine free space on /"
  fi
fi
if have nproc; then
  CPUS=$(nproc)
  if [ "$CPUS" -ge 2 ]; then ok cpu "${CPUS} vCPU"; else warn cpu "$CPUS vCPU (2 recommended under load)"; fi
fi

# --- compose rendering -------------------------------------------------------
if [ "$MODE" = "compose" ] && [ -r "$ENV_FILE" ] && have docker && docker compose version >/dev/null 2>&1; then
  if OUT=$(cd "$REPO" && docker compose -f compose.yaml --env-file "$ENV_FILE" config -q 2>&1); then
    ok compose_config "compose.yaml renders with $ENV_FILE"
  else
    bad compose_config "$(first_line "$OUT")"
  fi
fi

# --- Vercel compatibility ----------------------------------------------------
if [ -f "$REPO/vercel.json" ]; then
  if have node; then
    if node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$REPO/vercel.json" >/dev/null 2>&1; then
      ok vercel_config "vercel.json present and valid JSON"
    else
      warn vercel_config "vercel.json is not valid JSON"
    fi
  else
    ok vercel_config "vercel.json present"
  fi
else
  warn vercel_config "vercel.json missing; Vercel support may be broken"
fi

# --- summary -----------------------------------------------------------------
if [ "$JSON" -eq 1 ]; then
  printf '{"mode":"%s","repo":"%s","envFile":"%s","passed":%d,"warned":%d,"failed":%d,"checks":[' \
    "$MODE" "$(printf '%s' "$REPO" | sed 's/\\/\\\\/g; s/"/\\"/g')" \
    "$(printf '%s' "$ENV_FILE" | sed 's/\\/\\\\/g; s/"/\\"/g')" "$PASSED" "$WARNED" "$FAILED"
  first=1
  for i in "${!CHECKS[@]}"; do
    [ "$first" -eq 1 ] || printf ','
    first=0
    printf '{"level":"%s","check":"%s","detail":"%s"}' \
      "${LEVELS[$i]}" "${CHECKS[$i]}" \
      "$(printf '%s' "${DETAILS[$i]}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  done
  printf ']}\n'
else
  printf '\nsummary: %d passed, %d warning(s), %d failure(s) (mode=%s)\n' \
    "$PASSED" "$WARNED" "$FAILED" "$MODE"
  [ "$FAILED" -gt 0 ] && printf 'result: FAIL - fix the failures above before starting the stack\n'
  [ "$FAILED" -eq 0 ] && [ "$WARNED" -gt 0 ] && printf 'result: PASS with warnings\n'
  [ "$FAILED" -eq 0 ] && [ "$WARNED" -eq 0 ] && printf 'result: PASS\n'
fi

if [ "$FAILED" -gt 0 ]; then exit 1; fi
if [ "$STRICT" -eq 1 ] && [ "$WARNED" -gt 0 ]; then exit 2; fi
exit 0
