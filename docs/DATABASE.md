# Database Guide

The SemkiEst Platform uses **PostgreSQL 15** with **Prisma ORM** for all persistent data.

- Schema location: `packages/db/prisma/schema.prisma`
- Migrations: `packages/db/prisma/migrations/`
- Seed data: `packages/db/prisma/seed.ts`
- Prisma client package: `@semkiest/db`

## Entity Relationship Overview

```mermaid
erDiagram
    User {
        string id PK
        string email UK
        string name
        string passwordHash
        string role
        datetime createdAt
        datetime updatedAt
    }

    Project {
        string id PK
        string name
        string description
        string[] urls
        string environment
        string status
        string[] tags
        string owner
        string team
        string createdById FK
        datetime createdAt
        datetime updatedAt
        datetime lastRunAt
    }

    TestRun {
        string id PK
        string projectId FK
        string status
        int totalTests
        int passedTests
        int failedTests
        datetime startedAt
        datetime completedAt
        datetime createdAt
    }

    TestResult {
        string id PK
        string testRunId FK
        string name
        string status
        int durationMs
        string errorMessage
        string url
        datetime createdAt
    }

    JobQueue {
        string id PK
        string type
        string status
        json payload
        string projectId FK
        int attempts
        int maxAttempts
        datetime scheduledAt
        datetime startedAt
        datetime completedAt
        datetime createdAt
    }

    User ||--o{ Project : "creates"
    Project ||--o{ TestRun : "has"
    Project ||--o{ JobQueue : "queues"
    TestRun ||--o{ TestResult : "contains"
```

## Tables

### `User`

Stores authenticated users of the platform.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `String` | PK, CUID | Unique identifier |
| `email` | `String` | UNIQUE, NOT NULL | Login email address |
| `name` | `String` | NOT NULL | Display name |
| `passwordHash` | `String` | NOT NULL | bcrypt hash of password |
| `role` | `String` | NOT NULL, default `user` | `user` or `admin` |
| `createdAt` | `DateTime` | NOT NULL, default now | Record creation timestamp |
| `updatedAt` | `DateTime` | NOT NULL, auto-updated | Last modification timestamp |

### `Project`

The primary organizational unit — a set of URLs to test in a given environment.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `String` | PK, CUID | Unique identifier |
| `name` | `String` | NOT NULL | Display name |
| `description` | `String` | nullable | Optional description |
| `urls` | `String[]` | NOT NULL | URLs under test |
| `environment` | `String` | NOT NULL | `development`, `staging`, or `production` |
| `status` | `String` | NOT NULL, default `active` | `active`, `inactive`, or `archived` |
| `tags` | `String[]` | NOT NULL, default `[]` | Arbitrary labels |
| `owner` | `String` | nullable | Owner email or identifier |
| `team` | `String` | nullable | Team name |
| `createdById` | `String` | FK → User.id | User who created the project |
| `createdAt` | `DateTime` | NOT NULL, default now | Creation timestamp |
| `updatedAt` | `DateTime` | NOT NULL, auto-updated | Last update timestamp |
| `lastRunAt` | `DateTime` | nullable | Timestamp of the most recent test run |

**Indexes:** `createdById`, `environment`, `status`, composite `(environment, status)`

### `TestRun`

A single execution of the full test suite for a project.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `String` | PK, CUID | Unique identifier |
| `projectId` | `String` | FK → Project.id | Owning project |
| `status` | `String` | NOT NULL | `pending`, `running`, `passed`, `failed`, `cancelled` |
| `totalTests` | `Int` | NOT NULL, default `0` | Total number of test cases |
| `passedTests` | `Int` | NOT NULL, default `0` | Number of passing tests |
| `failedTests` | `Int` | NOT NULL, default `0` | Number of failing tests |
| `startedAt` | `DateTime` | nullable | When execution began |
| `completedAt` | `DateTime` | nullable | When execution finished |
| `createdAt` | `DateTime` | NOT NULL, default now | Creation timestamp |

**Indexes:** `projectId`, `status`, `createdAt`

### `TestResult`

An individual test case outcome within a test run.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `String` | PK, CUID | Unique identifier |
| `testRunId` | `String` | FK → TestRun.id | Parent test run |
| `name` | `String` | NOT NULL | Test case name |
| `status` | `String` | NOT NULL | `passed` or `failed` |
| `durationMs` | `Int` | NOT NULL | Execution duration in milliseconds |
| `errorMessage` | `String` | nullable | Failure message if status is `failed` |
| `url` | `String` | nullable | URL being tested |
| `createdAt` | `DateTime` | NOT NULL, default now | Creation timestamp |

**Indexes:** `testRunId`, `status`

### `JobQueue`

Tracks background jobs dispatched to BullMQ.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `String` | PK, CUID | Unique identifier |
| `type` | `String` | NOT NULL | Job type identifier (e.g., `run-tests`) |
| `status` | `String` | NOT NULL | `pending`, `active`, `completed`, `failed` |
| `payload` | `Json` | NOT NULL | Arbitrary job input data |
| `projectId` | `String` | FK → Project.id, nullable | Associated project |
| `attempts` | `Int` | NOT NULL, default `0` | Number of execution attempts |
| `maxAttempts` | `Int` | NOT NULL, default `3` | Retry limit |
| `scheduledAt` | `DateTime` | nullable | Scheduled execution time |
| `startedAt` | `DateTime` | nullable | Actual start time |
| `completedAt` | `DateTime` | nullable | Completion time |
| `createdAt` | `DateTime` | NOT NULL, default now | Creation timestamp |

**Indexes:** `type`, `status`, `projectId`, `scheduledAt`

## Migrations

### Running Migrations

```bash
# Development — creates a new migration file and applies it
pnpm --filter @semkiest/db run db:migrate

# Production — applies pending migrations without creating new files
pnpm --filter @semkiest/db exec prisma migrate deploy
```

### Creating a Migration

1. Edit `packages/db/prisma/schema.prisma`
2. Run `pnpm --filter @semkiest/db run db:migrate` and enter a descriptive name (e.g., `add_project_tags`)
3. Commit the generated migration file alongside the schema change

### Rolling Back

Prisma does not support automatic rollbacks. To undo a migration in development:

```bash
pnpm --filter @semkiest/db exec prisma migrate reset
# This drops all data and rereplays migrations from scratch.
```

For production rollbacks, apply a new migration that reverses the change.

## Connection Pooling

The `DATABASE_URL` environment variable is used for application queries. If you run PgBouncer in front of PostgreSQL, set `DIRECT_URL` to the direct connection string — Prisma uses `DIRECT_URL` for migrations.

```env
DATABASE_URL=postgresql://semkiest:pass@pgbouncer:6432/semkiest?schema=public
DIRECT_URL=postgresql://semkiest:pass@postgres:5432/semkiest?schema=public
```

## Seed Data

The seed script at `packages/db/prisma/seed.ts` creates sample users and projects for development.

```bash
pnpm --filter @semkiest/db run db:seed
```

Default seed data:
- 1 admin user: `admin@semkiest.com` / `password123`
- 1 regular user: `user@semkiest.com` / `password123`
- 3 sample projects across different environments

> **Note:** Never run the seed script against a production database.

## Backup and Restore

```bash
# Backup
pg_dump -U semkiest -d semkiest > backup_$(date +%Y%m%d).sql

# Restore
psql -U semkiest -d semkiest < backup_20240115.sql
```

For Docker:

```bash
docker compose exec db pg_dump -U semkiest semkiest > backup.sql
docker compose exec -T db psql -U semkiest semkiest < backup.sql
```
