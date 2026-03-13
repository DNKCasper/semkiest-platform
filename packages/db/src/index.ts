import { PrismaClient } from '@prisma/client';

/**
 * Global singleton Prisma client for the SemkiEst platform.
 *
 * In development, the client is stored on `globalThis` to survive hot-reloads
 * without creating runaway connections. In production a single instance is
 * created once per process.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

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

export * from '@prisma/client';
