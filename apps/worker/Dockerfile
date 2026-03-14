# =============================================================================
# Worker Service Dockerfile — multi-stage build
# Build context must be the monorepo root.
# =============================================================================

# ── Stage 1: Install all workspace dependencies ───────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/
COPY packages/shared-config/package.json ./packages/shared-config/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-utils/package.json ./packages/shared-utils/

RUN pnpm install --frozen-lockfile


# ── Stage 2: Build the worker ────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm --filter @semkiest/shared-config build 2>/dev/null || true && \
    pnpm --filter @semkiest/shared-types build 2>/dev/null || true && \
    pnpm --filter @semkiest/shared-utils build 2>/dev/null || true && \
    pnpm --filter @semkiest/db build 2>/dev/null || true && \
    pnpm --filter @semkiest/worker build


# ── Stage 3: Production image ─────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache dumb-init

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 semkiest

COPY --from=builder --chown=semkiest:nodejs /app/apps/worker/dist ./dist
COPY --from=builder --chown=semkiest:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=semkiest:nodejs /app/apps/worker/package.json ./package.json

COPY --from=builder --chown=semkiest:nodejs /app/packages/shared-config/dist ./node_modules/@semkiest/shared-config/dist 2>/dev/null || true
COPY --from=builder --chown=semkiest:nodejs /app/packages/shared-types/dist ./node_modules/@semkiest/shared-types/dist 2>/dev/null || true
COPY --from=builder --chown=semkiest:nodejs /app/packages/shared-utils/dist ./node_modules/@semkiest/shared-utils/dist 2>/dev/null || true

USER semkiest

ARG BUILD_DATE
ARG GIT_SHA
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.title="semkiest-worker"

# Workers process jobs from Redis queues — no HTTP port exposed
# Health is determined by ECS container health (process alive)

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
