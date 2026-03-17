# =============================================================================
# Worker Service Dockerfile - multi-stage build
# Build context must be the monorepo root.
#
# Uses Debian-based Node image (not Alpine) because Playwright requires glibc
# and system libraries not available on Alpine.
# =============================================================================

# -- Stage 1: Build --------------------------------------------------------
FROM node:20-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

# Install build dependencies for Prisma and native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy entire monorepo
COPY . .

# Install all dependencies (--no-frozen-lockfile until lockfile is regenerated)
RUN pnpm install --no-frozen-lockfile

# Generate Prisma clients (dummy URL - generate only reads schema, no DB connection)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
# Build shared packages first (order matters for workspace dependencies)
RUN cd packages/db && npx prisma generate && cd /app && \
    cd packages/database && npx prisma generate && cd /app

# Shared packages (non-critical, some may not exist)
RUN pnpm --filter @semkiest/shared-config build 2>/dev/null || true && \
    pnpm --filter @semkiest/shared-types build 2>/dev/null || true && \
    pnpm --filter @semkiest/shared-utils build 2>/dev/null || true && \
    pnpm --filter @semkiest/db build 2>/dev/null || true

# Agent packages — errors are logged (not suppressed) but non-blocking
RUN echo "=== Building agent packages ===" && \
    pnpm --filter @semkiest/agent-base build || echo "WARN: agent-base build failed" && \
    pnpm --filter @semkiest/accessibility-agent build || echo "WARN: accessibility-agent build failed" && \
    pnpm --filter @semkiest/performance build || echo "WARN: performance build failed" && \
    pnpm --filter @semkiest/security-agent build || echo "WARN: security-agent build failed" && \
    pnpm --filter @semkiest/api-agent build || echo "WARN: api-agent build failed" && \
    pnpm --filter @semkiest/agent-ui-functional build || echo "WARN: agent-ui-functional build failed" && \
    pnpm --filter @semkiest/explorer build || echo "WARN: explorer build failed" && \
    echo "=== Agent package builds complete ==="

# Coordinator and worker (critical)
RUN pnpm --filter @semkiest/coordinator build && \
    pnpm --filter @semkiest/worker build

# -- Stage 2: Production runtime -------------------------------------------
FROM node:20-slim AS runner
WORKDIR /app

# Install runtime dependencies:
# - dumb-init: proper PID 1 signal handling
# - openssl: required by Prisma
# - Playwright system dependencies for Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    openssl \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs semkiest

# Copy the full built workspace (preserves pnpm symlink structure)
COPY --from=builder --chown=semkiest:nodejs /app .

# Install Playwright Chromium browser (as the app user)
# Only Chromium is needed — Firefox and WebKit are not used by default
USER semkiest
RUN echo "=== Installing Playwright Chromium ===" && \
    npx playwright install chromium && \
    echo "=== Playwright Chromium installed ==="

ARG BUILD_DATE
ARG GIT_SHA
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.title="semkiest-worker"

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "apps/worker/dist/index.js"]
