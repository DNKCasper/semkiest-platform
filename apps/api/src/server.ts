import Fastify from 'fastify';
import cors from '@fastify/cors';
import fjwt from '@fastify/jwt';

import { registerRoutes } from './routes';

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
});

// Register CORS - allow all origins in staging, restrict in production
server.register(cors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// Register JWT plugin
server.register(fjwt, {
  secret: process.env.JWT_SECRET ?? 'change-me-in-production',
});

// Register all API routes
registerRoutes(server);

// Health check
server.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Log all registered routes on startup for debugging
server.addHook('onReady', async () => {
  const routes = server.printRoutes({ commonPrefix: false });
  server.log.info(`Registered routes:\n${routes}`);
});

// ---------------------------------------------------------------------------
// Ensure critical DB columns exist before the server accepts requests.
// This runs the same ALTER TABLE IF NOT EXISTS statements that the
// entrypoint migration should have applied, using the live Prisma client
// so there are no shell/file/permission issues.
// ---------------------------------------------------------------------------
async function ensureDbSchema(): Promise<void> {
  let prisma: any;
  try {
    const dbModule = await import('@semkiest/db');
    prisma = dbModule.prisma || dbModule.default?.prisma;
  } catch {
    try {
      const dbModule = await import('@sem/database');
      prisma = dbModule.prisma || dbModule.default?.prisma;
    } catch {
      server.log.warn('ensureDbSchema: could not import Prisma — skipping');
      return;
    }
  }
  if (!prisma?.$executeRawUnsafe) {
    server.log.warn('ensureDbSchema: prisma.$executeRawUnsafe not available — skipping');
    return;
  }

  const statements = [
    'ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "url" TEXT',
    "ALTER TABLE \"projects\" ADD COLUMN IF NOT EXISTS \"status\" TEXT NOT NULL DEFAULT 'ACTIVE'",
    'ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3)',
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" TEXT',
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" TEXT',
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false',
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMP(3)',
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3)',
    "ALTER TABLE \"users\" ADD COLUMN IF NOT EXISTS \"previous_passwords\" TEXT[] DEFAULT ARRAY[]::TEXT[]",
  ];

  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err: unknown) {
      server.log.warn(`ensureDbSchema: ${sql} — ${err instanceof Error ? err.message : err}`);
    }
  }
  server.log.info('ensureDbSchema: safety-net columns verified');
}

const start = async (): Promise<void> => {
  try {
    await ensureDbSchema();
    const port = Number(process.env.PORT ?? 3001);
    const host = process.env.HOST ?? '0.0.0.0';
    await server.listen({ port, host });
    server.log.info(`Server listening on http://${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

export { server };
