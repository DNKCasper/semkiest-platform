import { PrismaClient } from '@prisma/client';
/**
 * Singleton PrismaClient instance.
 * Uses a global reference in development to prevent exhausting connection pool
 * due to hot-reloading creating multiple instances.
 */
export declare const prisma: PrismaClient;
export default prisma;
export { Prisma } from '@prisma/client';
export type { Organization, User, Project, TestProfile, TestRun, TestResult, TestStep, Screenshot, Baseline, AgentConfig, AiCreditUsage, Notification, } from '@prisma/client';
//# sourceMappingURL=index.d.ts.map