#!/bin/sh
set -e

echo "[entrypoint] Starting Pak-Tel NestJS API & Storefront (auto-bootstrapping schema)..."
exec node dist/main.js
