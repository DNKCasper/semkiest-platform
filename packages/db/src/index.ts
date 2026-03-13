import { PrismaClient } from '@prisma/client';

/**
 * Singleton Prisma client instance for database access.
 * Reuses the existing client in development to avoid exhausting connection pools
 * during hot reloads.
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { UserRole } from '@prisma/client';
export type { User } from '@prisma/client';
