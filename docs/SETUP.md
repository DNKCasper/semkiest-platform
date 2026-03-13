# Setup Guide

This guide walks you through getting the SemkiEst Platform running locally from scratch.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | >= 20.0.0 | [nodejs.org](https://nodejs.org) or `nvm use` |
| pnpm | >= 9.0.0 | `npm install -g pnpm@9` |
| Docker + Docker Compose | Latest stable | [docker.com](https://www.docker.com) |
| Git | >= 2.40 | — |

Check your versions:

```bash
node --version   # v20.x.x
pnpm --version   # 9.x.x
docker --version # Docker version 24.x.x
```

If you use `nvm`, run `nvm use` at the repo root — the `.nvmrc` file pins Node.js 20.

## 1. Clone the Repository

```bash
git clone <repo-url> semkiest-platform
cd semkiest-platform
```

## 2. Install Dependencies

```bash
pnpm install
```

This installs all workspace dependencies across every package in a single command.

## 3. Configure Environment Variables

```bash
cp .env.example .env
```

Then open `.env` and replace every `CHANGE_ME` placeholder with a real value:

| Variable | How to generate |
|----------|----------------|
| `JWT_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `DATABASE_URL` | Keep the Docker default or use your own PostgreSQL instance |
| `REDIS_URL` | Keep the Docker default or use your own Redis instance |

> The full list of variables with descriptions is in [`.env.example`](../.env.example).

## 4. Start Infrastructure Services

```bash
docker compose up -d
```

This starts:
- **PostgreSQL** on port `5432` (user: `semkiest`, password: `semkiest_password`, db: `semkiest`)
- **Redis** on port `6379`
- **MinIO** (S3-compatible storage) on ports `9000` (API) and `9001` (console)

Verify all services are running:

```bash
docker compose ps
```

## 5. Set Up the Database

```bash
# Generate the Prisma client
pnpm --filter @semkiest/db run db:generate

# Run migrations
pnpm --filter @semkiest/db run db:migrate

# (Optional) Seed with sample data
pnpm --filter @semkiest/db run db:seed
```

## 6. Start the Development Servers

```bash
pnpm dev
```

Turborepo starts all services in parallel with hot-reloading:

| Service | URL |
|---------|-----|
| Web dashboard | http://localhost:3000 |
| API server | http://localhost:3001 |
| MinIO console | http://localhost:9001 (user: `minioadmin`, password: `minioadmin`) |

## Verifying the Installation

1. Open http://localhost:3000 — you should see the projects dashboard.
2. The page at http://localhost:3001/health should return `{"status":"ok"}`.
3. Creating a project via the UI should persist it to the database.

## Troubleshooting

### `pnpm install` fails

- Ensure you are running pnpm >= 9: `pnpm --version`
- Delete `node_modules` and the lockfile and retry: `rm -rf node_modules pnpm-lock.yaml && pnpm install`

### Database connection errors

- Confirm the Docker containers are running: `docker compose ps`
- Verify `DATABASE_URL` in `.env` matches the Docker Compose credentials
- Check PostgreSQL logs: `docker compose logs db`

### Redis connection errors

- Check Redis logs: `docker compose logs redis`
- Ensure `REDIS_URL=redis://localhost:6379` in `.env`

### Port conflicts

If a port is already in use, either stop the conflicting process or override the port in `.env` (e.g., `PORT=3002` for the API).

### Prisma client is out of date

After pulling new migrations from the remote, regenerate the client:

```bash
pnpm --filter @semkiest/db run db:generate
```

## Next Steps

- [Development Guide](DEVELOPMENT.md) — workflow, conventions, and testing
- [API Reference](api-reference.md) — REST endpoint documentation
- [Database Guide](DATABASE.md) — schema, migrations, and seed data
