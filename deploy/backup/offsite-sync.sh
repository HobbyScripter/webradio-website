#!/usr/bin/env bash
# Copy encrypted backups to a second location ("offsite").
#
#   deploy/backup/offsite-sync.sh --dry-run
#   deploy/backup/offsite-sync.sh
#
# Two modes:
#   local  copy to another directory (test/simulation, second disk or mounted
#          NAS). Fully verified locally: sha256 is re-checked at the target.
#   rsync  copy to user@host:/path over SSH. Requires rsync and key-based SSH;
#          verification is performed on the remote side with sha256sum.
#
# Only encrypted artefacts are transferred (*.dump.enc, *.tar.gz.enc, *.sha256).
# Plaintext dumps, keys, env files and logs never leave the host. The local
# backup directory is never written or rotated by this script.
#
# Environment (see deploy/backup/offsite.env.example):
#   OFFSITE_TARGET=/mnt/offsite/webradio          (empty: not configured)
#   OFFSITE_MODE=auto|local|rsync
#   OFFSITE_KEEP=7                                archives kept at the target
#   BACKUP_DIR=/var/backups/webradio
#   OFFSITE_SSH_KEY=                              optional identity file
set -uo pipefail

BACKUP_DIR=${BACKUP_DIR:-/var/backups/webradio}
TARGET=${OFFSITE_TARGET:-}
MODE=${OFFSITE_MODE:-auto}
KEEP=${OFFSITE_KEEP:-7}
SSH_KEY=${OFFSITE_SSH_KEY:-}
DRY_RUN=0
REQUIRE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --require) REQUIRE=1; shift ;;
    -h|--help) sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

LOG="$BACKUP_DIR/offsite.log"
log() {
  printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"
  [ "$DRY_RUN" -eq 1 ] || { mkdir -p "$BACKUP_DIR" && printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >> "$LOG"; } 2>/dev/null || true
}
fail() { log "ERROR $*"; exit 1; }
run() { if [ "$DRY_RUN" -eq 1 ]; then log "[dry-run] $*"; else "$@"; fi; }

[ -d "$BACKUP_DIR" ] || fail "BACKUP_DIR=$BACKUP_DIR does not exist"
if [ -z "$TARGET" ]; then
  if [ "$REQUIRE" -eq 1 ]; then fail "OFFSITE_TARGET is not configured"; fi
  log "offsite not configured (OFFSITE_TARGET empty) - skipped"
  exit 0
fi

if [ "$MODE" = "auto" ]; then
  case "$TARGET" in
    *:*) MODE=rsync ;;
    *) MODE=local ;;
  esac
fi
case "$MODE" in local|rsync) ;; *) fail "invalid OFFSITE_MODE=$MODE (local|rsync|auto)" ;; esac
log "offsite start mode=$MODE keep=$KEEP target=$TARGET dry_run=$DRY_RUN"

FILES=()
while IFS= read -r f; do FILES+=("$f"); done < <(
  ls -1 "$BACKUP_DIR"/*.dump.enc "$BACKUP_DIR"/*.tar.gz.enc "$BACKUP_DIR"/*.sha256 2>/dev/null || true
)
[ "${#FILES[@]}" -gt 0 ] || fail "no encrypted backups found in $BACKUP_DIR"

if [ "$MODE" = "local" ]; then
  TARGET=${TARGET%/}
  case "$TARGET" in /*) ;; *) fail "local OFFSITE_TARGET must be an absolute path: $TARGET" ;; esac
  [ "$TARGET" = "$BACKUP_DIR" ] && fail "OFFSITE_TARGET must differ from BACKUP_DIR"
  case "$TARGET/" in "$BACKUP_DIR"/*) fail "OFFSITE_TARGET must not be inside BACKUP_DIR" ;; esac
  if [ ! -d "$TARGET" ]; then
    run mkdir -p "$TARGET" || fail "cannot create $TARGET"
    run chmod 700 "$TARGET"
  fi
  copied=0
  for f in "${FILES[@]}"; do
    base=$(basename "$f")
    if [ -f "$TARGET/$base" ] && cmp -s "$f" "$TARGET/$base"; then continue; fi
    run cp -p "$f" "$TARGET/$base" || fail "copy failed: $base"
    copied=$((copied + 1))
  done
  log "offsite copied=$copied files=${#FILES[@]}"

  # Verify every checksum at the target (bit rot and truncated copies).
  verified=0
  for sum in "$TARGET"/*.sha256; do
    [ -e "$sum" ] || continue
    if ( cd "$TARGET" && sha256sum -c "$(basename "$sum")" >/dev/null 2>&1 ); then
      verified=$((verified + 1))
    else
      fail "checksum verification failed at target: $(basename "$sum")"
    fi
  done
  log "offsite verified=$verified checksum files at target"

  # Retention at the target only; local archives are untouched.
  for pattern in 'webradio-*.dump.enc' 'webradio-config-*.tar.gz.enc'; do
    mapfile -t OLD < <(ls -1t "$TARGET"/$pattern 2>/dev/null | tail -n +$((KEEP + 1)) || true)
    for f in "${OLD[@]:-}"; do
      [ -n "$f" ] || continue
      run rm -f "$f" "$f.sha256" || fail "cannot rotate $f"
      log "offsite rotated out $(basename "$f")"
    done
  done
  COUNT=$(ls -1 "$TARGET"/webradio-*.dump.enc 2>/dev/null | wc -l)
  log "offsite done mode=local target_archives=$COUNT"
else
  command -v rsync >/dev/null || fail "rsync is not installed"
  case "$TARGET" in *:*) ;; *) fail "rsync mode needs user@host:/path, got: $TARGET" ;; esac
  SSH_ARGS=()
  [ -n "$SSH_KEY" ] && SSH_ARGS=(-e "ssh -i $SSH_KEY -o BatchMode=yes")
  # --protect-args keeps spaces/globs out of the remote shell.
  run rsync -a --protect-args --partial --checksum "${SSH_ARGS[@]}" "${FILES[@]}" "$TARGET/" \
    || fail "rsync failed"
  REMOTE_HOST=${TARGET%%:*}
  REMOTE_DIR=${TARGET#*:}
  if [ "$DRY_RUN" -eq 1 ]; then
    log "[dry-run] would verify checksums on $REMOTE_HOST"
  else
    # shellcheck disable=SC2029
    if ssh ${SSH_KEY:+-i "$SSH_KEY"} -o BatchMode=yes "$REMOTE_HOST" \
        "cd '$REMOTE_DIR' && sha256sum -c --quiet *.sha256" >/dev/null 2>&1; then
      log "offsite verified checksums on $REMOTE_HOST"
    else
      fail "remote checksum verification failed on $REMOTE_HOST"
    fi
  fi
  log "offsite done mode=rsync target=$TARGET (retention is the target's responsibility)"
fi
