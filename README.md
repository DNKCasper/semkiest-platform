# SemkiEst Platform

A modern collaborative application for managing projects, running automated tests, and integrating with third-party services. Built with Next.js 14, TypeScript, Turborepo, PostgreSQL/Prisma, and BullMQ.

## Features

- **Project Management** — Create, configure, and monitor projects across multiple environments
- **Automated Testing** — Schedule and run test suites with pass/fail tracking and analytics
- **Environment Management** — Manage configuration per environment (development, staging, production)
- **Background Jobs** — Async job processing via BullMQ for long-running tasks
- **Integrations** — Connect with Jira, Asana, Slack, and GitHub
- **File Storage** — S3/MinIO-compatible object storage for artifacts and uploads

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Backend | Express.js, TypeScript |
| Database | PostgreSQL 15 + Prisma ORM |
| Queue | BullMQ + Redis |
| Monorepo | Turborepo + pnpm workspaces |
| Storage | AWS S3 / MinIO |
| Testing | Jest, Playwright |

## Quick Start

```bash
# Prerequisites: Node.js >= 20, pnpm >= 9, Docker
cp .env.example .env
pnpm install
docker compose up -d        # Start PostgreSQL, Redis, MinIO
pnpm run db:migrate         # Run database migrations
pnpm dev                    # Start all services
```

- Web dashboard: http://localhost:3000
- API server: http://localhost:3001

See [docs/SETUP.md](docs/SETUP.md) for full setup instructions.

## Repository Structure

```
semkiest-platform/
├── apps/
│   ├── api/          # Express REST API backend
│   ├── web/          # Next.js 14 web dashboard
│   └── worker/       # BullMQ background job processor
├── packages/
│   ├── db/           # Prisma schema, migrations, seed data
│   ├── shared-config/# Zod-validated environment schemas + TS configs
│   ├── shared-types/ # Shared TypeScript type definitions
│   └── shared-utils/ # Shared utility functions
├── docs/             # Technical documentation
├── .env.example      # Environment variable template
├── turbo.json        # Turborepo task pipeline
└── pnpm-workspace.yaml
```

## Documentation

| Document | Description |
|----------|-------------|
| [docs/SETUP.md](docs/SETUP.md) | Initial setup and prerequisites |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Development workflow and conventions |
| [docs/api-reference.md](docs/api-reference.md) | REST API reference |
| [docs/DATABASE.md](docs/DATABASE.md) | Database schema and relationships |
| [docs/architecture/](docs/architecture/) | Architecture decision records (ADRs) |
| [docs/agents/creating-agents.md](docs/agents/creating-agents.md) | Guide to creating new agent types |
| [docs/integrations/](docs/integrations/) | Third-party integration setup guides |

## Common Commands

```bash
pnpm dev                    # Start all services in watch mode
pnpm build                  # Build all packages
pnpm test                   # Run all tests
pnpm lint                   # Lint all packages
pnpm typecheck              # Type-check all packages
pnpm run db:migrate         # Run pending database migrations
pnpm run db:seed            # Seed the database with sample data
```

## Contributing

1. Branch from `main`: `git checkout -b feature/SEM-XXX-short-description`
2. Follow [Conventional Commits](https://www.conventionalcommits.org/): `feat(SEM-123): add feature`
3. Ensure `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass
4. Open a pull request against `main`

## License

Proprietary — SemkiEst Platform. All rights reserved.
