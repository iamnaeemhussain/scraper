#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  npm install --no-audit --no-fund
fi

if [ ! -d "web/node_modules" ] || [ ! -f "web/dist/index.html" ] || [ ! -f ".data/local-server.mjs" ]; then
  npm run build:local
fi

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"

exec node .data/local-server.mjs
