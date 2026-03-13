import { PrismaClient } from '@prisma/client';

/** Singleton PrismaClient instance shared across the process. */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;

// Re-export Prisma types for convenience
export { Prisma, ScheduleStatus, RunStatus } from '@prisma/client';
export type {
  Schedule,
  ScheduleRun,
} from '@prisma/client';
