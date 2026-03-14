# =============================================================================
# Worker Service Dockerfile - multi-stage build
# Build context must be the monorepo root.
# =============================================================================

# -- Stage 1: Build --------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy entire monorepo
COPY . .

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client (dummy URL - generate only reads schema, no DB connection)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN cd packages/db && npx prisma generate && cd /app && \
    pnpm --filter @semkiest/shared-config build 2>/dev/null || true && \
    pnpm --filter @semkiest/shared-types build 2>/dev/null || true && \
    pnpm --filter @semkiest/shared-utils build 2>/dev/null || true && \
    pnpm --filter @semkiest/db build 2>/dev/null || true && \
    pnpm --filter @semkiest/worker build

# -- Stage 2: Production runtime -------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache dumb-init

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 semkiest

# Copy the full built workspace (preserves pnpm symlink structure)
COPY --from=builder --chown=semkiest:nodejs /app .

USER semkiest

ARG BUILD_DATE
ARG GIT_SHA
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.title="semkiest-worker"

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "apps/worker/dist/index.js"]
