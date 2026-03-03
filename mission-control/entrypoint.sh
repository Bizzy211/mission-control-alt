#!/bin/sh
set -e

mkdir -p /app/data

echo "[entrypoint] Starting Mission Control daemon..."
pnpm daemon:start &

echo "[entrypoint] Starting Next.js server..."
exec pnpm start
