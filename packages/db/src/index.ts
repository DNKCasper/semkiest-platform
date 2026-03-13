import { PrismaClient } from '@prisma/client';

// Re-export all generated Prisma types for consumers
export * from '@prisma/client';

/**
 * Singleton Prisma client.
 * Uses a global variable in development to prevent multiple connections
 * due to hot-module replacement.
 */
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
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

export default prisma;
