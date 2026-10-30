#!/bin/sh
# Container entrypoint: wait for the database volume, apply the schema, then exec the server.
set -eu

DB_PATH="${DATABASE_URL#sqlite:///}"
case "$DATABASE_URL" in
  sqlite*)
    DB_DIR="$(dirname "${DB_PATH#//}")"
    mkdir -p "$DB_DIR" 2>/dev/null || true
    if [ ! -w "$(dirname "${DB_PATH#//}")" ] 2>/dev/null; then
      echo "[entrypoint] WARNING: database directory is not writable — mount a volume at /data" >&2
    fi
    ;;
esac

echo "[entrypoint] LeadBridge starting · environment=${ENVIRONMENT:-development} · database=${DATABASE_URL:-default}"

# Create tables / bootstrap an admin. Safe to run on every start (idempotent).
if python -c "import app.main" >/dev/null 2>&1; then
  python cli.py init-db || echo "[entrypoint] init-db reported an issue; continuing so the API can surface it" >&2
fi

if [ "${SEED_DEMO_DATA:-false}" = "true" ] && [ "${ENVIRONMENT}" != "production" ]; then
  python cli.py seed || true
fi

exec "$@"
