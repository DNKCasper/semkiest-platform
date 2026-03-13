# =============================================================================
# API Service Dockerfile — multi-stage build
# Build context must be the monorepo root.
# =============================================================================

# ── Stage 1: Install all workspace dependencies ───────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace manifests first for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/
COPY packages/shared-config/package.json ./packages/shared-config/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-utils/package.json ./packages/shared-utils/

RUN pnpm install --frozen-lockfile


# ── Stage 2: Build the API and its workspace dependencies ────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

COPY . .

# Build shared packages first, then the API
RUN pnpm --filter @semkiest/shared-config build 2>/dev/null || true && \
    pnpm --filter @semkiest/shared-types build 2>/dev/null || true && \
    pnpm --filter @semkiest/shared-utils build 2>/dev/null || true && \
    pnpm --filter @semkiest/db build 2>/dev/null || true && \
    pnpm --filter @semkiest/api build


# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache dumb-init curl

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 semkiest

# Copy production artifacts
COPY --from=builder --chown=semkiest:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=semkiest:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=semkiest:nodejs /app/apps/api/package.json ./package.json

# Copy shared package dist outputs
COPY --from=builder --chown=semkiest:nodejs /app/packages/shared-config/dist ./node_modules/@semkiest/shared-config/dist 2>/dev/null || true
COPY --from=builder --chown=semkiest:nodejs /app/packages/shared-types/dist ./node_modules/@semkiest/shared-types/dist 2>/dev/null || true
COPY --from=builder --chown=semkiest:nodejs /app/packages/shared-utils/dist ./node_modules/@semkiest/shared-utils/dist 2>/dev/null || true

USER semkiest

EXPOSE 3001

ARG BUILD_DATE
ARG GIT_SHA
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.title="semkiest-api"

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
