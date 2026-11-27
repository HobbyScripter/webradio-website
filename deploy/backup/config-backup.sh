#!/usr/bin/env bash
# Encrypted backup of the deployment configuration (no secrets).
#
#   deploy/backup/config-backup.sh
#
# Complements pg-backup.sh: the database dump cannot recreate compose.yaml,
# Caddyfiles, systemd units or the operational scripts. This archive contains
# exactly those files, is encrypted with the same key as the database dumps and
# gets the same 0600/sha256/rotation treatment.
#
# Secrets are excluded by policy and by an explicit post-archive check: a
# matching .env/.key/.pem file aborts the run, so a careless CONFIG_EXTRA_PATHS
# cannot leak credentials into the archive.
#
# Environment (see deploy/backup/backup.env.example):
#   REPO_DIR=/opt/webradio
#   BACKUP_DIR=/var/backups/webradio
#   BACKUP_KEEP=14
#   BACKUP_KEY_FILE=/etc/webradio/backup.key
#   CONFIG_EXTRA_PATHS="/etc/caddy/Caddyfile /etc/systemd/system/webradio-*.service"
#   CONFIG_BACKUP=1           0 disables the archive (used by the unit)
set -euo pipefail

REPO_DIR=${REPO_DIR:-/opt/webradio}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/webradio}
KEEP=${BACKUP_KEEP:-14}
KEY_FILE=${BACKUP_KEY_FILE:-/etc/webradio/backup.key}
EXTRA=${CONFIG_EXTRA_PATHS-}
PREFIX=webradio-config
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

[ "${CONFIG_BACKUP:-1}" = "1" ] || { echo "config backup disabled (CONFIG_BACKUP=0)"; exit 0; }

umask 077
mkdir -p "$BACKUP_DIR"
LOG="$BACKUP_DIR/backup.log"
log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG"; }
fail() { log "ERROR $*"; exit 1; }

[ -r "$KEY_FILE" ] || fail "encryption key $KEY_FILE is missing or unreadable (refusing to write plaintext archives)"
[ -d "$REPO_DIR" ] || fail "REPO_DIR=$REPO_DIR does not exist"

ARCHIVE="$BACKUP_DIR/${PREFIX}-${STAMP}.tar.gz"
ENC="$ARCHIVE.enc"
TMP=$(mktemp "$BACKUP_DIR/.tmp-config-XXXXXX")
trap 'rm -f "$TMP" "$ARCHIVE"' EXIT

# Versioned files that define the deployment. Only existing entries are added.
REL_PATHS=(
  compose.yaml Dockerfile .dockerignore
  package.json package-lock.json vercel.json next.config.ts tsconfig.json prisma.config.ts
  deploy/env.production.example deploy/env.test.example deploy/env.native.example
  deploy/Caddyfile deploy/Caddyfile.internal
  deploy/caddy deploy/install deploy/systemd deploy/backup deploy/monitoring
  docs/SELF_HOSTED_DEPLOYMENT_GUIDE.md docs/DISASTER_RECOVERY_GUIDE.md
  docs/SELF_HOSTED_SECURITY_HARDENING.md docs/HOSTING_PORTABILITY.md
  docs/HOSTING_MIGRATION_GUIDE.md
  scripts/prisma-db.mts
  prisma/contract.json prisma/contract.d.ts
)

REL=()
for p in "${REL_PATHS[@]}"; do
  [ -e "$REPO_DIR/$p" ] && REL+=("$p")
done
[ "${#REL[@]}" -gt 0 ] || fail "no configuration files found under $REPO_DIR"

# Optional host configuration (Caddyfile, installed units). Never secret files;
# the post-archive check enforces that even if the path list is wrong.
if [ -z "$EXTRA" ]; then
  EXTRA="/etc/caddy/Caddyfile /etc/systemd/system/webradio-*.service /etc/systemd/system/webradio-*.timer"
fi
ABS=()
for pattern in $EXTRA; do
  for f in $pattern; do
    [ -e "$f" ] && ABS+=("${f#/}")
  done
done

log "config archive start repo=$REPO_DIR files=${#REL[@]} extras=${#ABS[@]}"
TAR_ARGS=(-czf "$TMP" -C "$REPO_DIR" "${REL[@]}")
[ "${#ABS[@]}" -gt 0 ] && TAR_ARGS+=(-C / "${ABS[@]}")
tar "${TAR_ARGS[@]}"

# Refuse to keep an archive that contains anything that looks like a secret.
LISTING=$(tar -tzf "$TMP") || fail "archive is unreadable"
if printf '%s\n' "$LISTING" | grep -Eq '(^|/)\.env($|\.)|(^|/)env\.(production|test)$|\.key$|\.pem$|secret'; then
  fail "archive would contain a secret file - refusing to continue: $(printf '%s\n' "$LISTING" | grep -E '(^|/)\.env($|\.)|(^|/)env\.(production|test)$|\.key$|\.pem$|secret' | tr '\n' ' ')"
fi
ENTRIES=$(printf '%s\n' "$LISTING" | wc -l)
[ "$ENTRIES" -gt 5 ] || fail "archive looks empty ($ENTRIES entries)"

cp "$TMP" "$ARCHIVE"
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$ARCHIVE" -out "$ENC" -pass "file:$KEY_FILE" \
  || fail "encryption failed"
rm -f "$ARCHIVE"
chmod 600 "$ENC"
SHA=$(sha256sum "$ENC" | awk '{print $1}')
printf '%s  %s\n' "$SHA" "$(basename "$ENC")" > "$ENC.sha256"
chmod 600 "$ENC.sha256"
log "config ok file=$(basename "$ENC") entries=$ENTRIES bytes=$(stat -c %s "$ENC") sha256=$SHA"

mapfile -t OLD < <(ls -1t "$BACKUP_DIR"/${PREFIX}-*.tar.gz.enc 2>/dev/null | tail -n +$((KEEP + 1)) || true)
for f in "${OLD[@]:-}"; do
  [ -n "$f" ] || continue
  rm -f "$f" "$f.sha256"
  log "rotated out $(basename "$f")"
done
COUNT=$(ls -1 "$BACKUP_DIR"/${PREFIX}-*.tar.gz.enc 2>/dev/null | wc -l)
log "config done kept=$COUNT keep_limit=$KEEP"
