import { PrismaClient } from '@prisma/client';

// Re-export all generated types and enums for consumers of this package.
export {
  Prisma,
  PrismaClient,
  UserRole,
  TestRunStatus,
  TestResultStatus,
  TestStepStatus,
} from '@prisma/client';

export type {
  Organization,
  User,
  Project,
  TestProfile,
  TestRun,
  TestResult,
  TestStep,
  Screenshot,
  Baseline,
  AgentConfig,
  AiCreditUsage,
  Notification,
} from '@prisma/client';

// ─── Singleton Prisma Client ──────────────────────────────────────────────────
// In production we create a single instance. In development/test environments
// Next.js hot-reloading can create multiple instances, so we cache it on the
// global object to avoid exhausting the connection pool.

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });
}

export const db: PrismaClient =
  global.__prisma ?? createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  global.__prisma = db;
}

export default db;
