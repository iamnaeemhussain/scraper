#!/usr/bin/env bash
# Nightly-safe backup for a SQLite LeadBridge database.
#
#   ./deploy/backup.sh [destination-dir] [retention-days]
#
# Uses SQLite's VACUUM INTO, which produces a consistent snapshot even while the
# API is running (WAL mode). PostgreSQL users: replace with pg_dump, e.g.
#   pg_dump "$DATABASE_URL" | gzip > "$DEST/leadbridge-$(date +%F).sql.gz"
#
# Remember: a backup that only exists on the same disk is not a backup. Copy the
# destination directory off-server (rsync, rclone, object storage).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-/var/backups/leadbridge}"
KEEP_DAYS="${2:-14}"
DB_PATH="${LEADBRIDGE_DB:-$APP_DIR/backend/data/leadbridge.db}"

if [ ! -f "$DB_PATH" ]; then
  echo "[backup] database not found at $DB_PATH" >&2
  exit 1
fi

mkdir -p "$DEST"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$DEST/leadbridge-$STAMP.db"

python3 - "$DB_PATH" "$TARGET" <<'PY'
import sqlite3, sys
source, target = sys.argv[1], sys.argv[2]
with sqlite3.connect(source, timeout=30) as connection:
    connection.execute("PRAGMA busy_timeout=30000")
    connection.execute(f"VACUUM INTO '{target}'")
PY

gzip -f "$TARGET"
echo "[backup] wrote $TARGET.gz ($(du -h "$TARGET.gz" | cut -f1))"

# Prune old snapshots.
find "$DEST" -name 'leadbridge-*.db.gz' -type f -mtime "+$KEEP_DAYS" -print -delete || true

# Leaked WAL files are not needed in a backup; SQLite checkpoints on its own.
exit 0
