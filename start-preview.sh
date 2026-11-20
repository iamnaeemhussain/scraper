#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -d "$ROOT_DIR/web/node_modules" ]; then
  echo "[start-preview] Installing web dependencies..."
  (cd "$ROOT_DIR/web" && npm install --no-audit --no-fund)
fi

if [ ! -f "$ROOT_DIR/web/dist/index.html" ]; then
  echo "[start-preview] Building web storefront..."
  (cd "$ROOT_DIR/web" && npm run build)
fi

if [ ! -d "$ROOT_DIR/backend/node_modules" ]; then
  echo "[start-preview] Installing backend dependencies..."
  (cd "$ROOT_DIR/backend" && npm install --no-audit --no-fund)
fi

if [ ! -f "$ROOT_DIR/backend/dist/main.js" ]; then
  echo "[start-preview] Building NestJS backend..."
  (cd "$ROOT_DIR/backend" && npm run build)
fi

cd "$ROOT_DIR/backend"
export PORT="${PORT:-3000}"
export SEED_REFERENCE_BUNDLES="${SEED_REFERENCE_BUNDLES:-true}"
exec node dist/main.js
