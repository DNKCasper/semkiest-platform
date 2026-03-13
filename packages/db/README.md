# @semkiest/db — Database Package

Prisma ORM setup, PostgreSQL schema, migrations, and seed data for the SemkiEst platform.

---

## Table of Contents

- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Migrations](#migrations)
  - [Creating a New Migration](#creating-a-new-migration)
  - [Deploying Migrations](#deploying-migrations)
  - [Checking Migration Status](#checking-migration-status)
  - [Rollback Procedure](#rollback-procedure)
- [Seeding](#seeding)
  - [Development Seed](#development-seed)
  - [Test Seed](#test-seed)
  - [Production](#production)
- [CI/CD Integration](#cicd-integration)
- [Schema Overview](#schema-overview)
- [Best Practices](#best-practices)

---

## Setup

```bash
# Install dependencies from the repo root
pnpm install

# Generate the Prisma client (required before building)
pnpm --filter @semkiest/db generate

# Build the package
pnpm --filter @semkiest/db build
```

---

## Environment Variables

Copy `.env.example` to `.env` in this package and fill in your values:

```bash
cp packages/db/.env.example packages/db/.env
```

| Variable       | Description                              | Example                                         |
|----------------|------------------------------------------|-------------------------------------------------|
| `DATABASE_URL` | PostgreSQL connection string (required)  | `postgresql://user:pass@localhost:5432/semkiest` |
| `NODE_ENV`     | Controls seeding behaviour               | `development` / `test` / `production`           |

---

## Migrations

All migration files live in `prisma/migrations/` and **must be committed to version control**. Prisma tracks which migrations have been applied via the `_prisma_migrations` table in the database.

### Creating a New Migration

Use `prisma migrate dev` during local development. This command:

1. Diffs the current `schema.prisma` against the live database.
2. Generates a new SQL migration file in `prisma/migrations/`.
3. Applies the migration to your local database.
4. Re-generates the Prisma client.

```bash
# Via pnpm script
pnpm --filter @semkiest/db migrate:dev

# With a descriptive name (recommended)
pnpm --filter @semkiest/db migrate:dev -- --name add_user_avatar

# Via the migration runner script
DATABASE_URL=postgresql://... ./packages/db/scripts/migrate.sh dev --name add_user_avatar
```

> **Important:** Never edit a migration file that has already been applied and committed. Instead, create a new migration.

### Deploying Migrations

In staging and production environments, use `prisma migrate deploy`. This command **only applies** pending migrations — it never creates new ones or prompts for input, making it safe for automated pipelines.

```bash
# Via pnpm script
pnpm --filter @semkiest/db migrate:deploy

# Via the migration runner script
DATABASE_URL=postgresql://... ./packages/db/scripts/migrate.sh deploy
```

### Checking Migration Status

```bash
# Via pnpm script
pnpm --filter @semkiest/db migrate:status

# Via the migration runner script
./packages/db/scripts/migrate.sh status
```

Output shows which migrations have been applied and whether any are pending.

### Rollback Procedure

Prisma does not support automatic down-migrations. Use the following approach:

1. **Identify** the migration to undo:
   ```bash
   ./packages/db/scripts/migrate.sh status
   ```

2. **Revert** `schema.prisma` to the desired previous state.

3. **Create** a new "rollback" migration:
   ```bash
   ./packages/db/scripts/migrate.sh dev --name rollback_<description>
   ```

4. **Deploy** the rollback migration to the target environment:
   ```bash
   ./packages/db/scripts/migrate.sh deploy
   ```

5. **Data recovery** — if data was lost, restore from a pre-migration database snapshot (see your cloud provider's backup tools: AWS RDS, Supabase PITR, etc.).

> **Best practice:** Always create a database snapshot/backup before applying migrations in production.

#### Development Reset

To completely reset the local database and re-apply all migrations from scratch:

```bash
pnpm --filter @semkiest/db migrate:reset
# OR
./packages/db/scripts/migrate.sh reset
```

> **Warning:** This is **destructive** — all data will be erased.

---

## Seeding

Seed behaviour is controlled by the `NODE_ENV` environment variable.

### Development Seed

Creates a rich, realistic dataset suitable for local development:

- 1 organization: **Acme Corp**
- 3 users: admin, manager, viewer (with hashed passwords)
- 2 projects: **Project Alpha** and **Project Beta**
- 3 test profiles across Chrome Desktop, Firefox Desktop, and Chrome Mobile
- 4 test runs with results, steps, and screenshots
- 3 baselines, 1 agent config, credit usage entries, and notifications

```bash
# Run via pnpm
pnpm --filter @semkiest/db seed:dev

# Or from the repo root
pnpm db:seed:dev
```

### Test Seed

Creates a minimal, deterministic dataset for fast CI test cycles. All IDs are stable so test assertions can reference them directly.

```bash
# Run via pnpm
pnpm --filter @semkiest/db seed:test

# Or from the repo root
pnpm db:seed:test
```

| Resource       | ID               | Details                              |
|----------------|------------------|--------------------------------------|
| Organization   | `test_org`       | "Test Org"                           |
| Admin user     | `test_user_admin`| admin@test.example.com               |
| Viewer user    | `test_user_viewer`| viewer@test.example.com             |
| Project        | `test_project`   | "Test Project"                       |
| Test profile   | `test_profile`   | Chromium, 1280×800                   |
| Test run       | `test_run`       | PASSED                               |
| Test result 1  | `test_result_1`  | "Homepage renders" — PASSED          |
| Test result 2  | `test_result_2`  | "Login flow" — FAILED                |

### Production

The seed script is a no-op in production (`NODE_ENV=production`). Migrations are applied via `prisma migrate deploy` only.

---

## CI/CD Integration

The CI pipeline (`.github/workflows/ci.yml`) runs migrations before tests:

```
1. Start PostgreSQL service
2. Install dependencies
3. Generate Prisma client
4. Run: prisma migrate deploy
5. (Optionally) Run: seed:test
6. Run: turbo test
```

See `.github/workflows/ci.yml` for the full configuration.

---

## Schema Overview

```
Organization
  └── User              (role: ADMIN | MANAGER | VIEWER)
  └── Project
        └── TestProfile (browser, viewport, env config)
              └── TestRun  (status: PENDING | RUNNING | PASSED | FAILED | …)
                    └── TestResult (per-test outcome)
                          └── TestStep   (action / expected / actual)
                                └── Screenshot (S3 key)
  └── AgentConfig       (AI model + concurrency settings)
  └── AiCreditUsage     (credit ledger entries)

Project
  └── Baseline          (reference screenshot S3 keys)

User
  └── Notification
```

All tables use:
- `TEXT` primary keys with prefixed IDs (e.g., `org_`, `user_`, `proj_`)
- `created_at` / `updated_at` timestamps
- `CASCADE` deletes on all foreign keys
- Indexes on foreign keys and frequently filtered columns

---

## Best Practices

### Writing New Migrations

1. Make **one logical change per migration** (add a table, add a column, add an index).
2. Use **descriptive names**: `--name add_project_archived_at` not `--name update`.
3. **Review the generated SQL** before committing — check for unintended table recreations.
4. **Test the migration** against a copy of the production database in staging first.
5. **Never modify** a migration file after it has been committed and applied.

### Schema Changes in Production

```bash
# 1. Take a database backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Apply the migration
./packages/db/scripts/migrate.sh deploy

# 3. Verify the migration applied cleanly
./packages/db/scripts/migrate.sh status
```

### Adding a New Model

1. Add the model to `prisma/schema.prisma`.
2. Run `pnpm --filter @semkiest/db migrate:dev -- --name add_<model_name>`.
3. Add seed data in `scripts/seed-dev.ts` and minimal data in `scripts/seed-test.ts`.
4. Re-export any new Prisma-generated types in `src/index.ts`.
