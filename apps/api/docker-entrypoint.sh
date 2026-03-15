#!/bin/sh
set -e

echo "=== SemkiEst API Startup ==="

# -----------------------------------------------------------------------
# 1. Schema safety-net: ensure critical columns exist even if a Prisma
#    migration was recorded as applied but its SQL never actually ran.
# -----------------------------------------------------------------------
echo "Running schema safety-net..."
cat packages/db/prisma/ensure-schema.sql | npx prisma db execute --stdin --schema=packages/db/prisma/schema.prisma \
  && echo "Schema safety-net applied successfully" \
  || echo "WARNING: Schema safety-net failed (non-fatal, continuing...)"

# -----------------------------------------------------------------------
# 2. Run Prisma migrations
# -----------------------------------------------------------------------
echo "Running Prisma migrations..."
npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma \
  || echo "WARNING: Prisma migration failed — server starting anyway"

# -----------------------------------------------------------------------
# 3. Start the API server
# -----------------------------------------------------------------------
echo "Starting API server..."
exec node apps/api/dist/server.js
