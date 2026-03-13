import { PrismaClient } from '@prisma/client';

// Singleton pattern: reuse connection in dev (prevents hot-reload exhaustion)
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  global.__prisma = prisma;
}

export type { Prisma, Organization, ScoringConfig, Project, QualityScore } from '@prisma/client';
