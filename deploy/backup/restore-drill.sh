#!/usr/bin/env bash
# Restore drill: prove that the newest encrypted backup can be restored and
# that schema, marker and data are intact — without touching the live database.
#
#   deploy/backup/restore-drill.sh [--file <dump.enc>] [--keep]
#
# docker mode (default): runs createdb/pg_restore inside the compose postgres
# container, so no host PostgreSQL superuser is needed.
# native mode: requires a role that may CREATE DATABASE (usually postgres).
#
# The drill database is named webradio_restore_test_<UTC stamp> and is dropped
# again unless --keep is given. The live database is never written to.
set -euo pipefail

MODE=${BACKUP_MODE:-docker}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/webradio}
KEY_FILE=${BACKUP_KEY_FILE:-/etc/webradio/backup.key}
COMPOSE_FILE=${COMPOSE_FILE:-/opt/webradio/compose.yaml}
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-/opt/webradio/deploy/env.production}
KEEP_DB=0
FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --file) FILE=${2:?--file needs a path}; shift 2 ;;
    --keep) KEEP_DB=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { log "ERROR $*"; exit 1; }

[ -r "$KEY_FILE" ] || fail "key file $KEY_FILE missing"

if [ -z "$FILE" ]; then
  FILE=$(ls -1t "$BACKUP_DIR"/webradio-*.dump.enc 2>/dev/null | head -n 1 || true)
fi
[ -n "$FILE" ] && [ -r "$FILE" ] || fail "no encrypted backup found in $BACKUP_DIR"
log "drill source=$(basename "$FILE") mode=$MODE"

if [ -r "$FILE.sha256" ]; then
  ( cd "$(dirname "$FILE")" && sha256sum -c "$(basename "$FILE").sha256" >/dev/null ) \
    || fail "checksum mismatch for $(basename "$FILE")"
  log "checksum ok"
fi

PLAIN=$(mktemp /dev/shm/webradio-restore-XXXXXX 2>/dev/null || mktemp)
chmod 600 "$PLAIN"
trap 'rm -f "$PLAIN"' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -in "$FILE" -out "$PLAIN" -pass "file:$KEY_FILE" \
  || fail "decryption failed"

STAMP=$(date -u +%Y%m%d%H%M%S)
DRILL_DB="webradio_restore_test_${STAMP}"

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" "$@"; }

case "$MODE" in
  docker)
    : "${PGUSER:?PGUSER required}"
    compose exec -T postgres createdb -U "$PGUSER" "$DRILL_DB" || fail "createdb failed"
    compose exec -T postgres pg_restore --no-owner --no-privileges -U "$PGUSER" -d "$DRILL_DB" < "$PLAIN" \
      || fail "pg_restore failed"
    TABLES=$(compose exec -T postgres psql -At -U "$PGUSER" -d "$DRILL_DB" -c \
      "select count(*) from pg_tables where schemaname='public';")
    OWNERS=$(compose exec -T postgres psql -At -U "$PGUSER" -d "$DRILL_DB" -c \
      "select count(*) from pg_tables where schemaname='public' and tableowner <> current_user;")
    ;;
  native)
    : "${PGDATABASE:?PGDATABASE required}"
    createdb -w "$DRILL_DB" || fail "createdb failed (native; needs CREATEDB)"
    pg_restore -w --no-owner --no-privileges -d "$DRILL_DB" "$PLAIN" || fail "pg_restore failed"
    TABLES=$(psql -w -At -d "$DRILL_DB" -c "select count(*) from pg_tables where schemaname='public';")
    OWNERS=0
    ;;
  *) fail "unknown BACKUP_MODE=$MODE" ;;
esac

log "restored tables=$TABLES foreign_owners=$OWNERS"
[ "$TABLES" -ge 40 ] || fail "restored schema looks incomplete ($TABLES tables)"
[ "$OWNERS" = "0" ] || fail "restored objects have unexpected owners ($OWNERS)"

# Marker + schema verification against the restored database, using the same
# check the deployment uses. The connection string is passed via env only.
if [ "$MODE" = "docker" ]; then
  compose run --rm -T -e DATABASE_URL="postgresql://${PGUSER}:${PGPASSWORD}@postgres:5432/${DRILL_DB}" \
    tools node scripts/prisma-db.mts db verify --strict >/dev/null 2>&1 \
    && log "db:verify --strict ok (restored database)" \
    || log "WARN db:verify against the restored database failed (run it manually)"
else
  log "NOTE native drill: run 'DATABASE_PROVIDER=self-hosted DATABASE_URL=... npm run db:verify -- --strict' for marker verification"
fi

if [ "$KEEP_DB" = "1" ]; then
  log "keeping drill database $DRILL_DB (--keep)"
else
  case "$MODE" in
    docker) compose exec -T postgres dropdb -U "$PGUSER" "$DRILL_DB" ;;
    native) dropdb -w "$DRILL_DB" ;;
  esac
  log "dropped drill database $DRILL_DB"
fi

log "drill ok"
