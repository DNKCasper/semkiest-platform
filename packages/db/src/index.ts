import { PrismaClient } from '@prisma/client';

// Re-export all Prisma types for consumers
export { Prisma, PrismaClient } from '@prisma/client';
export type { AiCreditUsage } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Singleton Prisma client instance.
 * Reuses the same connection across hot-reloads in development.
 */
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
