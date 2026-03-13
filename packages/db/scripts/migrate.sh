#!/usr/bin/env bash
# =============================================================================
# migrate.sh — Database migration runner for SemkiEst platform
#
# Usage:
#   ./scripts/migrate.sh [command] [options]
#
# Commands:
#   dev       Run prisma migrate dev (development, creates new migrations)
#   deploy    Run prisma migrate deploy (production, applies pending migrations)
#   status    Show current migration status
#   reset     Reset database and re-apply all migrations (DESTRUCTIVE)
#   rollback  Document rollback steps (Prisma does not have native down-migration)
#
# Environment variables:
#   DATABASE_URL  PostgreSQL connection string (required)
#   NODE_ENV      Environment (development | test | production)
#
# Examples:
#   DATABASE_URL=postgresql://... ./scripts/migrate.sh deploy
#   NODE_ENV=test ./scripts/migrate.sh dev --name add_index
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log()  { echo "[migrate] $*"; }
err()  { echo "[migrate] ERROR: $*" >&2; }
die()  { err "$*"; exit 1; }

require_database_url() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    die "DATABASE_URL environment variable is not set."
  fi
  log "Using DATABASE_URL: ${DATABASE_URL%%@*}@***"
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

cmd_dev() {
  log "Running 'prisma migrate dev' (development mode)…"
  require_database_url
  cd "$PACKAGE_DIR"
  npx prisma migrate dev "$@"
  log "Migration complete."
}

cmd_deploy() {
  log "Running 'prisma migrate deploy' (production mode)…"
  require_database_url
  cd "$PACKAGE_DIR"
  npx prisma migrate deploy
  log "Migration deployed successfully."
}

cmd_status() {
  log "Checking migration status…"
  require_database_url
  cd "$PACKAGE_DIR"
  npx prisma migrate status
}

cmd_reset() {
  log "WARNING: This will DESTROY all data in the database and re-apply migrations."
  if [[ "${CI:-false}" != "true" ]]; then
    read -r -p "Are you sure? Type 'yes' to continue: " confirm
    [[ "$confirm" == "yes" ]] || die "Aborted."
  fi
  require_database_url
  cd "$PACKAGE_DIR"
  npx prisma migrate reset --force
  log "Database reset complete."
}

cmd_rollback() {
  cat <<'EOF'
[migrate] Rollback Procedure
=============================

Prisma Migrate does NOT support automatic down-migrations. To roll back a
migration, follow these manual steps:

1. IDENTIFY the migration to roll back:
     npx prisma migrate status

2. REVERT the schema changes in prisma/schema.prisma to the previous state.

3. CREATE a new migration that undoes the changes:
     npx prisma migrate dev --name rollback_<description>

4. DEPLOY the rollback migration to the target environment:
     ./scripts/migrate.sh deploy

5. OPTIONAL — For a complete reset in development/staging:
     ./scripts/migrate.sh reset

Data rollback (if needed):
  - Restore from a database backup taken before the original migration.
  - Use pg_restore or a snapshot from your cloud provider (RDS, Supabase, etc.)

Best practices:
  - Always take a database snapshot before running migrations in production.
  - Test migrations in staging before applying to production.
  - Keep migrations small and reversible where possible.
EOF
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
  dev)      cmd_dev "$@" ;;
  deploy)   cmd_deploy "$@" ;;
  status)   cmd_status "$@" ;;
  reset)    cmd_reset "$@" ;;
  rollback) cmd_rollback "$@" ;;
  help|--help|-h)
    sed -n '/^# Usage/,/^# =/p' "$0" | head -n -1
    exit 0
    ;;
  *)
    err "Unknown command: '$COMMAND'"
    err "Valid commands: dev | deploy | status | reset | rollback | help"
    exit 1
    ;;
esac
