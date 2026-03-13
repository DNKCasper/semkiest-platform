/**
 * Prisma seed entry point.
 *
 * Detects the current NODE_ENV and delegates to the appropriate seeder:
 *   - development → rich dataset (seed-dev)
 *   - test         → minimal dataset (seed-test)
 *   - production   → no seeding (migration only)
 */

import { PrismaClient } from '@prisma/client';
import { seedDevelopment } from '../scripts/seed-dev';
import { seedTest } from '../scripts/seed-test';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const env = process.env.NODE_ENV ?? 'development';

  console.log(`[seed] NODE_ENV="${env}"`);

  switch (env) {
    case 'development':
      await seedDevelopment(prisma);
      break;
    case 'test':
      await seedTest(prisma);
      break;
    case 'production':
      console.log('[seed] Production environment — skipping seed data.');
      break;
    default:
      console.warn(
        `[seed] Unknown NODE_ENV "${env}", falling back to development seed.`,
      );
      await seedDevelopment(prisma);
  }
}

main()
  .catch((err) => {
    console.error('[seed] Fatal error during seeding:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
