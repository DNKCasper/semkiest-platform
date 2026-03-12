/**
 * @semkiest/db
 * Database client and utilities for the SemkiEst platform.
 * Uses Prisma ORM with PostgreSQL.
 */

import { PrismaClient } from '@prisma/client';

/** Singleton Prisma client instance */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
export * from '@prisma/client';
