import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Singleton PrismaClient instance.
 * Uses a global reference in development to prevent exhausting connection pool
 * due to hot-reloading creating multiple instances.
 */
export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;

// Re-export Prisma types for convenience
export { Prisma } from '@prisma/client';
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
