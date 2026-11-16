#!/usr/bin/env bash
# Back up lbgate's SQLite (members, numbers, signed names (encrypted), receipts, usage) while it runs.
#   deploy/backup-gate.sh            -> ~/backups/limitless/gate-<UTC time>.sqlite, keeps the newest 14
# Restore (after `docker compose -p limitless-browser stop lbgate`): copy the file into the gate-data volume as gate.sqlite.
# The names only decrypt with MEMBER_DATA_KEY: keep that key in the password manager, never next to the backup.
set -euo pipefail
OUT="${LB_GATE_BACKUP_DIR:-$HOME/backups/limitless}"
C="${LB_GATE_CONTAINER:-limitless-browser-lbgate-1}"
mkdir -p "$OUT" && chmod 700 "$OUT"
NAME="gate-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
# VACUUM INTO makes a consistent copy without stopping the service.
docker exec "$C" node -e "new (require('node:sqlite').DatabaseSync)('/data/gate.sqlite').exec(\"VACUUM INTO '/data/$NAME'\")"
docker cp "$C:/data/$NAME" "$OUT/$NAME"
docker exec "$C" rm -f "/data/$NAME"
chmod 600 "$OUT/$NAME"
ls -1t "$OUT"/gate-*.sqlite | tail -n +15 | xargs -r rm -f
echo "backup: $OUT/$NAME ($(stat -c %s "$OUT/$NAME") bytes)"
