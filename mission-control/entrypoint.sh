#!/bin/sh
set -e

mkdir -p /app/data/checkpoints

# Seed required JSON files with empty defaults if they don't exist
echo "[entrypoint] Ensuring data files exist..."
[ -f /app/data/tasks.json ]        || echo '{"tasks":[]}'       > /app/data/tasks.json
[ -f /app/data/tasks-archive.json ] || echo '{"tasks":[]}'       > /app/data/tasks-archive.json
[ -f /app/data/goals.json ]        || echo '{"goals":[]}'       > /app/data/goals.json
[ -f /app/data/projects.json ]     || echo '{"projects":[]}'    > /app/data/projects.json
[ -f /app/data/brain-dump.json ]   || echo '{"entries":[]}'     > /app/data/brain-dump.json
[ -f /app/data/inbox.json ]        || echo '{"messages":[]}'    > /app/data/inbox.json
[ -f /app/data/decisions.json ]    || echo '{"decisions":[]}'   > /app/data/decisions.json
[ -f /app/data/activity-log.json ] || echo '{"events":[]}'      > /app/data/activity-log.json
[ -f /app/data/agents.json ]       || echo '{"agents":[]}'      > /app/data/agents.json
[ -f /app/data/skills-library.json ] || echo '{"skills":[]}'    > /app/data/skills-library.json
[ -f /app/data/active-runs.json ]  || echo '{"runs":[]}'        > /app/data/active-runs.json
[ -f /app/data/daemon-config.json ] || echo '{}'                 > /app/data/daemon-config.json
echo "[entrypoint] Data files ready."

echo "[entrypoint] Starting Mission Control daemon..."
pnpm daemon:start &

echo "[entrypoint] Starting Next.js server..."
exec pnpm start
