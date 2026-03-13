import { PrismaClient } from '@prisma/client';

// Re-export Prisma types for use across packages
export { Prisma, ProjectStatus, UserRole } from '@prisma/client';
export type {
  Organization,
  User,
  Project,
  TestProfile,
} from '@prisma/client';

/**
 * Singleton Prisma client instance.
 * Uses global singleton pattern to prevent multiple instances during hot reload.
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
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
