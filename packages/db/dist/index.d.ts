import { PrismaClient } from '@prisma/client';
export { Prisma, PrismaClient, UserRole, TestRunStatus, TestResultStatus, TestStepStatus, } from '@prisma/client';
export type { Organization, User, Project, TestProfile, TestRun, TestResult, TestStep, Screenshot, Baseline, AgentConfig, AiCreditUsage, Notification, } from '@prisma/client';
declare global {
    var __prisma: PrismaClient | undefined;
}
export declare const db: PrismaClient;
export default db;
//# sourceMappingURL=index.d.ts.map