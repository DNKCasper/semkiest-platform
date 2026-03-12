# Stage: base
FROM node:20-alpine AS base
RUN apk add --no-cache dumb-init

# Stage: deps
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage: build
FROM base AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
RUN npm run build

# Stage: runner
FROM node:20-alpine AS runner
RUN apk add --no-cache dumb-init
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["dumb-init", "node", "dist/index.js"]
