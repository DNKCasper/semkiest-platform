# Development Guide

Day-to-day development workflow, conventions, and best practices for the SemkiEst Platform.

## Prerequisites

Complete the [Setup Guide](SETUP.md) before starting development.

## Development Workflow

### Starting Services

```bash
pnpm dev          # Start all apps and packages in watch mode
```

Or start individual services:

```bash
pnpm --filter @semkiest/web dev      # Next.js frontend only
pnpm --filter @semkiest/api dev      # API server only
pnpm --filter @semkiest/worker dev   # Background worker only
```

### Building

```bash
pnpm build        # Build all packages (respects dependency order)
```

Turborepo caches build artifacts. Only changed packages and their dependents rebuild.

### Linting

```bash
pnpm lint         # Lint all packages
pnpm --filter @semkiest/web lint     # Lint a single package
```

### Type Checking

```bash
pnpm typecheck    # Type-check all packages
```

### Testing

```bash
pnpm test                                    # Run all tests
pnpm --filter @semkiest/shared-config test   # Test a specific package
pnpm test -- --watch                         # Watch mode
pnpm test -- --coverage                      # Coverage report
```

## Monorepo Structure

```
semkiest-platform/
├── apps/
│   ├── api/          # Express REST API (port 3001)
│   ├── web/          # Next.js frontend (port 3000)
│   └── worker/       # BullMQ worker process
├── packages/
│   ├── db/           # Prisma client and migrations
│   ├── shared-config/# Environment schemas (Zod) + shared TS configs
│   ├── shared-types/ # Shared TypeScript interfaces
│   └── shared-utils/ # Shared utility functions
```

### Package Naming

| Package directory | npm name |
|-------------------|----------|
| `apps/api` | `@semkiest/api` |
| `apps/web` | `@semkiest/web` |
| `apps/worker` | `@semkiest/worker` |
| `packages/db` | `@semkiest/db` |
| `packages/shared-config` | `@semkiest/shared-config` |
| `packages/shared-types` | `@semkiest/shared-types` |
| `packages/shared-utils` | `@semkiest/shared-utils` |

### Adding a New Package Dependency

```bash
# Add a dependency to a specific package
pnpm --filter @semkiest/api add express

# Add a workspace package dependency
pnpm --filter @semkiest/api add @semkiest/shared-types
```

## Code Conventions

### TypeScript

- Strict mode is enabled globally (`"strict": true`)
- No `any` types — use `unknown` with type guards, or generics
- Exported interfaces and functions must have JSDoc comments
- Use path aliases for workspace packages: `import { Foo } from '@semkiest/shared-types'`

### File Naming

| Content | Convention | Example |
|---------|-----------|---------|
| Components | PascalCase | `ProjectCard.tsx` |
| Utilities / hooks | camelCase | `useProjects.ts` |
| Type files | `*.types.ts` | `project.types.ts` |
| Test files | `*.test.ts` or `*.spec.ts` | `project.test.ts` |
| Route handlers | camelCase | `projectRoutes.ts` |

### Directory Layout

| Location | What goes there |
|----------|----------------|
| `apps/api/src/routes/` | Express route handlers |
| `apps/api/src/middleware/` | Express middleware |
| `apps/web/app/` | Next.js App Router pages |
| `apps/web/components/` | React components |
| `apps/web/lib/` | Client utilities and API clients |
| `packages/shared-types/src/` | Shared TypeScript interfaces |
| `packages/shared-utils/src/` | Pure utility functions |
| `packages/db/prisma/` | Prisma schema and migrations |

### Environment Variables

All environment variables are validated with Zod at startup. To add a new variable:

1. Add it to the relevant schema in `packages/shared-config/src/env/`
2. Add a matching entry to `.env.example` with a description
3. Update the relevant section of [docs/SETUP.md](SETUP.md)

Example:

```typescript
// packages/shared-config/src/env/api.ts
MY_NEW_VAR: z.string().min(1).default('default-value'),
```

### Logging

Use structured logging — never use `console.log` in production code. The API server uses a structured logger (pino/winston) accessible via the `LOG_LEVEL` environment variable.

```typescript
// Good
logger.info({ projectId }, 'Project created');
logger.error({ err, projectId }, 'Failed to create project');

// Bad
console.log('Project created:', projectId);
```

## Database Development

### Creating a Migration

After modifying `packages/db/prisma/schema.prisma`:

```bash
pnpm --filter @semkiest/db run db:migrate
# Prisma will prompt for a migration name, e.g., "add_project_tags"
```

### Regenerating the Prisma Client

Run this after any schema change:

```bash
pnpm --filter @semkiest/db run db:generate
```

### Resetting the Database

Wipes all data and reruns all migrations (development only):

```bash
pnpm --filter @semkiest/db exec prisma migrate reset
```

## Git Workflow

### Branch Naming

```
feature/SEM-123-short-description
fix/SEM-456-bug-description
chore/SEM-789-maintenance-task
```

### Commit Messages (Conventional Commits)

```
feat(SEM-123): add project tagging support
fix(SEM-456): handle null owner in project list
chore(SEM-789): update Prisma to 5.15
docs(SEM-101): update API reference for projects endpoint
test(SEM-202): add unit tests for env validation
refactor(SEM-303): extract project filtering logic
```

Commit messages are validated by `commitlint` on commit.

### Pull Request Process

1. Branch from `main`
2. Keep PRs focused — one story per PR
3. Ensure CI passes: build, lint, typecheck, tests
4. Fill in the PR template
5. Request review from at least one team member

## CI/CD

GitHub Actions runs on every push and pull request:

| Job | What it checks |
|-----|---------------|
| `build` | `pnpm turbo run build` succeeds |
| `lint` | `pnpm turbo run lint` with zero errors |
| `typecheck` | `pnpm turbo run typecheck` with zero errors |
| `test` | `pnpm turbo run test` with coverage |
| `security` | CodeQL static analysis |

See [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) for details.

## Turborepo Caching

Turborepo caches task outputs locally (`.turbo/`) and optionally in a remote cache. To clear the local cache:

```bash
pnpm turbo run clean
rm -rf .turbo
```

## Useful Scripts Reference

```bash
# Development
pnpm dev                                    # Start all services
pnpm build                                  # Build all packages
pnpm lint                                   # Lint all packages
pnpm typecheck                              # Type-check all packages
pnpm test                                   # Run all tests

# Database
pnpm --filter @semkiest/db run db:generate  # Generate Prisma client
pnpm --filter @semkiest/db run db:migrate   # Create and run migration
pnpm --filter @semkiest/db run db:push      # Sync schema without migration
pnpm --filter @semkiest/db run db:seed      # Seed sample data

# Docker
docker compose up -d                        # Start infrastructure
docker compose down                         # Stop infrastructure
docker compose logs -f                      # Follow all logs
```
