#!/bin/sh
set -e

mkdir -p /app/data/checkpoints

# ─── Seed data files ────────────────────────────────────────────────────────
# Files in /app/data-seed/ are baked into the Docker image and contain
# pre-configured agents, skills, etc. On first boot (or after a volume wipe),
# these get copied into /app/data/ so the app starts ready to go.
# Existing files are never overwritten — user data is preserved.

echo "[entrypoint] Ensuring data files exist..."

# Copy seed files (agents, skills-library — pre-configured).
# Replaces files that are missing OR contain only empty defaults (from earlier seeding).
if [ -d /app/data-seed ]; then
  for seed in /app/data-seed/*.json; do
    target="/app/data/$(basename "$seed")"
    if [ ! -f "$target" ]; then
      echo "[entrypoint]   Seeding $(basename "$seed") (new)"
      cp "$seed" "$target"
    elif [ "$(wc -c < "$target")" -lt 50 ]; then
      # File exists but is tiny (just an empty default like {"agents":[]})
      echo "[entrypoint]   Seeding $(basename "$seed") (replacing empty default)"
      cp "$seed" "$target"
    fi
  done
fi

# Remaining files get empty defaults if not seeded and not existing
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
