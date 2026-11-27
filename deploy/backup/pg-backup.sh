#!/usr/bin/env bash
# PostgreSQL backup for the self-hosted operating forms.
#
#   native : pg_dump against the host cluster (PG* variables)
#   docker : pg_dump inside the compose `postgres` container
#
# Guarantees:
#   - custom-format dump, verified with `pg_restore -l` before it is kept
#   - encrypted at rest (AES-256, openssl) with a 0600 key file; a plaintext
#     dump is removed immediately and never left in the backup directory
#   - rotation by age-independent count (`BACKUP_KEEP`, default 14)
#   - every run appends one line to `backup.log` (no secrets, no URLs)
#   - a non-zero exit lets systemd's OnFailure alert fire
#
# Environment (see deploy/backup/backup.env.example):
#   BACKUP_MODE=native|docker      default native
#   BACKUP_DIR=/var/backups/webradio
#   BACKUP_KEEP=14
#   BACKUP_KEY_FILE=/etc/webradio/backup.key   (32 random bytes, 0600)
#   COMPOSE_FILE / COMPOSE_ENV_FILE            docker mode
#   PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE native mode
set -euo pipefail

MODE=${BACKUP_MODE:-native}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/webradio}
KEEP=${BACKUP_KEEP:-14}
KEY_FILE=${BACKUP_KEY_FILE:-/etc/webradio/backup.key}
COMPOSE_FILE=${COMPOSE_FILE:-/opt/webradio/compose.yaml}
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-/opt/webradio/deploy/env.production}
PREFIX=webradio
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

umask 077
mkdir -p "$BACKUP_DIR"
LOG="$BACKUP_DIR/backup.log"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG"; }
fail() { log "ERROR $*"; exit 1; }

[ -r "$KEY_FILE" ] || fail "encryption key $KEY_FILE is missing or unreadable (refusing to write plaintext backups)"
[ "$(stat -c %a "$KEY_FILE" 2>/dev/null || echo 600)" = "600" ] || log "WARN key file mode is not 600"

DUMP="$BACKUP_DIR/${PREFIX}-${STAMP}.dump"
ENC="$DUMP.enc"
TMP=$(mktemp "$BACKUP_DIR/.tmp-XXXXXX")
trap 'rm -f "$TMP" "$DUMP"' EXIT

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" "$@"
}

case "$MODE" in
  docker)
    command -v docker >/dev/null || fail "docker is not installed"
    : "${PGDATABASE:?PGDATABASE is required (database name inside the container)}"
    : "${PGUSER:?PGUSER is required}"
    log "dump start mode=docker database=$PGDATABASE"
    compose exec -T postgres pg_dump -Fc -U "$PGUSER" -d "$PGDATABASE" > "$TMP" \
      || fail "pg_dump failed (docker)"
    compose exec -T postgres pg_restore -l < "$TMP" > /dev/null \
      || fail "integrity check failed: pg_restore cannot read the dump"
    ;;
  native)
    command -v pg_dump >/dev/null || fail "pg_dump is not installed"
    : "${PGDATABASE:?PGDATABASE is required}"
    : "${PGUSER:?PGUSER is required}"
    log "dump start mode=native host=${PGHOST:-localhost} database=$PGDATABASE"
    pg_dump -w -Fc -f "$TMP" || fail "pg_dump failed (native)"
    pg_restore -l "$TMP" > /dev/null || fail "integrity check failed: pg_restore cannot read the dump"
    ;;
  *)
    fail "unknown BACKUP_MODE=$MODE (expected native or docker)"
    ;;
esac

SIZE=$(stat -c %s "$TMP")
cp "$TMP" "$DUMP"
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$DUMP" -out "$ENC" -pass "file:$KEY_FILE" \
  || fail "encryption failed"
rm -f "$DUMP"
chmod 600 "$ENC"
SHA=$(sha256sum "$ENC" | awk '{print $1}')
printf '%s  %s\n' "$SHA" "$(basename "$ENC")" > "$ENC.sha256"
chmod 600 "$ENC.sha256"
log "dump ok file=$(basename "$ENC") bytes=$SIZE sha256=$SHA"

# Rotation: keep the newest $KEEP encrypted dumps (plus their checksum files).
mapfile -t OLD < <(ls -1t "$BACKUP_DIR"/${PREFIX}-*.dump.enc 2>/dev/null | tail -n +$((KEEP + 1)) || true)
for f in "${OLD[@]:-}"; do
  [ -n "$f" ] || continue
  rm -f "$f" "$f.sha256"
  log "rotated out $(basename "$f")"
done

COUNT=$(ls -1 "$BACKUP_DIR"/${PREFIX}-*.dump.enc 2>/dev/null | wc -l)
log "done kept=$COUNT keep_limit=$KEEP"
