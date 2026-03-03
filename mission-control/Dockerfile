# ── Stage 1: Install dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ─────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN pnpm build

# ── Stage 3: Production ────────────────────────────────────────────────────
FROM node:20-alpine AS production
RUN npm install -g pnpm @anthropic-ai/claude-code
WORKDIR /app
ENV NODE_ENV=production

# Copy built assets and runtime dependencies (devDeps kept for tsx)
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/data-seed ./data-seed
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh && mkdir -p /app/data

VOLUME ["/app/data"]
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
