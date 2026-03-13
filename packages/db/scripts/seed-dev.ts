/**
 * Development seed script.
 *
 * Creates a rich, realistic dataset suitable for local development:
 *   - 1 organization ("Acme Corp")
 *   - 3 users (admin, manager, viewer)
 *   - 2 projects with test profiles
 *   - Multiple test runs with results, steps, and screenshots
 *   - Baseline images and agent configuration
 *   - Sample notifications and AI credit usage
 *
 * Usage:
 *   pnpm --filter @semkiest/db seed:dev
 */

import {
  PrismaClient,
  UserRole,
  TestRunStatus,
  TestResultStatus,
  TestStepStatus,
} from '@prisma/client';
import * as crypto from 'crypto';

/** Deterministic fake password hash for development users */
function fakePasswordHash(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function seedDevelopment(prisma: PrismaClient): Promise<void> {
  console.log('[seed:dev] Starting development seed…');

  // ------------------------------------------------------------------
  // Organization
  // ------------------------------------------------------------------
  const org = await prisma.organization.upsert({
    where: { id: 'org_acme' },
    update: {},
    create: {
      id: 'org_acme',
      name: 'Acme Corp',
    },
  });
  console.log(`[seed:dev] Organization: ${org.name} (${org.id})`);

  // ------------------------------------------------------------------
  // Users
  // ------------------------------------------------------------------
  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@acme.example.com' },
      update: {},
      create: {
        id: 'user_admin',
        email: 'admin@acme.example.com',
        orgId: org.id,
        role: UserRole.ADMIN,
        passwordHash: fakePasswordHash('admin-dev-password'),
      },
    }),
    prisma.user.upsert({
      where: { email: 'manager@acme.example.com' },
      update: {},
      create: {
        id: 'user_manager',
        email: 'manager@acme.example.com',
        orgId: org.id,
        role: UserRole.MANAGER,
        passwordHash: fakePasswordHash('manager-dev-password'),
      },
    }),
    prisma.user.upsert({
      where: { email: 'viewer@acme.example.com' },
      update: {},
      create: {
        id: 'user_viewer',
        email: 'viewer@acme.example.com',
        orgId: org.id,
        role: UserRole.VIEWER,
        passwordHash: fakePasswordHash('viewer-dev-password'),
      },
    }),
  ]);
  console.log(`[seed:dev] Users: ${users.map((u) => u.email).join(', ')}`);

  // ------------------------------------------------------------------
  // Projects
  // ------------------------------------------------------------------
  const projectAlpha = await prisma.project.upsert({
    where: { id: 'proj_alpha' },
    update: {},
    create: {
      id: 'proj_alpha',
      orgId: org.id,
      name: 'Project Alpha',
      description: 'End-to-end tests for the main customer-facing dashboard.',
    },
  });

  const projectBeta = await prisma.project.upsert({
    where: { id: 'proj_beta' },
    update: {},
    create: {
      id: 'proj_beta',
      orgId: org.id,
      name: 'Project Beta',
      description: 'Regression suite for the admin panel and API layer.',
    },
  });
  console.log(
    `[seed:dev] Projects: ${projectAlpha.name}, ${projectBeta.name}`,
  );

  // ------------------------------------------------------------------
  // Test Profiles
  // ------------------------------------------------------------------
  const profileChrome = await prisma.testProfile.upsert({
    where: { id: 'profile_chrome_desktop' },
    update: {},
    create: {
      id: 'profile_chrome_desktop',
      projectId: projectAlpha.id,
      name: 'Chrome Desktop',
      config: {
        browser: 'chromium',
        viewport: { width: 1280, height: 800 },
        headless: true,
        baseUrl: 'http://localhost:3000',
      },
    },
  });

  const profileFirefox = await prisma.testProfile.upsert({
    where: { id: 'profile_firefox_desktop' },
    update: {},
    create: {
      id: 'profile_firefox_desktop',
      projectId: projectAlpha.id,
      name: 'Firefox Desktop',
      config: {
        browser: 'firefox',
        viewport: { width: 1280, height: 800 },
        headless: true,
        baseUrl: 'http://localhost:3000',
      },
    },
  });

  const profileMobile = await prisma.testProfile.upsert({
    where: { id: 'profile_chrome_mobile' },
    update: {},
    create: {
      id: 'profile_chrome_mobile',
      projectId: projectBeta.id,
      name: 'Chrome Mobile',
      config: {
        browser: 'chromium',
        viewport: { width: 375, height: 812 },
        headless: true,
        baseUrl: 'http://localhost:3000',
        deviceScaleFactor: 2,
      },
    },
  });
  console.log(
    `[seed:dev] Profiles: ${profileChrome.name}, ${profileFirefox.name}, ${profileMobile.name}`,
  );

  // ------------------------------------------------------------------
  // Test Runs, Results, Steps, Screenshots
  // ------------------------------------------------------------------
  await seedTestRun(prisma, {
    runId: 'run_alpha_01',
    profileId: profileChrome.id,
    status: TestRunStatus.PASSED,
    startedAt: new Date('2026-03-10T08:00:00Z'),
    completedAt: new Date('2026-03-10T08:04:32Z'),
  });

  await seedTestRun(prisma, {
    runId: 'run_alpha_02',
    profileId: profileChrome.id,
    status: TestRunStatus.FAILED,
    startedAt: new Date('2026-03-11T09:00:00Z'),
    completedAt: new Date('2026-03-11T09:02:18Z'),
  });

  await seedTestRun(prisma, {
    runId: 'run_alpha_03',
    profileId: profileFirefox.id,
    status: TestRunStatus.PASSED,
    startedAt: new Date('2026-03-11T10:00:00Z'),
    completedAt: new Date('2026-03-11T10:05:10Z'),
  });

  await seedTestRun(prisma, {
    runId: 'run_beta_01',
    profileId: profileMobile.id,
    status: TestRunStatus.RUNNING,
    startedAt: new Date('2026-03-12T07:00:00Z'),
    completedAt: null,
  });

  // ------------------------------------------------------------------
  // Baselines
  // ------------------------------------------------------------------
  const baselineKeys = [
    'baselines/proj_alpha/home-hero-1280x800.png',
    'baselines/proj_alpha/dashboard-overview-1280x800.png',
    'baselines/proj_beta/admin-users-375x812.png',
  ];
  for (const [i, s3Key] of baselineKeys.entries()) {
    await prisma.baseline.upsert({
      where: { id: `baseline_${i + 1}` },
      update: {},
      create: {
        id: `baseline_${i + 1}`,
        projectId: i < 2 ? projectAlpha.id : projectBeta.id,
        name: s3Key.split('/').pop()!.replace('.png', ''),
        s3Key,
      },
    });
  }
  console.log(`[seed:dev] Baselines: ${baselineKeys.length} created`);

  // ------------------------------------------------------------------
  // Agent Config
  // ------------------------------------------------------------------
  await prisma.agentConfig.upsert({
    where: { id: 'agent_acme_default' },
    update: {},
    create: {
      id: 'agent_acme_default',
      orgId: org.id,
      configJson: {
        model: 'claude-sonnet-4-6',
        maxConcurrentTests: 4,
        screenshotOnFailure: true,
        retryCount: 2,
        timeout: 30000,
      },
      active: true,
    },
  });
  console.log('[seed:dev] Agent config created');

  // ------------------------------------------------------------------
  // AI Credit Usage
  // ------------------------------------------------------------------
  const creditEntries = [
    { credits: 10, reason: 'Test analysis: run_alpha_01' },
    { credits: 15, reason: 'Test analysis: run_alpha_02 (failure diagnosis)' },
    { credits: 8, reason: 'Test analysis: run_alpha_03' },
  ];
  for (const [i, entry] of creditEntries.entries()) {
    await prisma.aiCreditUsage.upsert({
      where: { id: `credit_${i + 1}` },
      update: {},
      create: {
        id: `credit_${i + 1}`,
        orgId: org.id,
        creditsUsed: entry.credits,
        reason: entry.reason,
      },
    });
  }
  console.log(`[seed:dev] AI credit entries: ${creditEntries.length} created`);

  // ------------------------------------------------------------------
  // Notifications
  // ------------------------------------------------------------------
  const notifications = [
    {
      id: 'notif_1',
      userId: users[0].id,
      message: 'Test run run_alpha_02 failed — 1 test failed.',
      read: false,
    },
    {
      id: 'notif_2',
      userId: users[1].id,
      message: 'Project Alpha — new baseline images approved.',
      read: true,
    },
    {
      id: 'notif_3',
      userId: users[2].id,
      message: 'Welcome to SemkiEst! Start by creating your first test profile.',
      read: false,
    },
  ];
  for (const notif of notifications) {
    await prisma.notification.upsert({
      where: { id: notif.id },
      update: {},
      create: notif,
    });
  }
  console.log(`[seed:dev] Notifications: ${notifications.length} created`);

  console.log('[seed:dev] Development seed completed successfully.');
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

interface SeedRunOptions {
  runId: string;
  profileId: string;
  status: TestRunStatus;
  startedAt: Date;
  completedAt: Date | null;
}

async function seedTestRun(
  prisma: PrismaClient,
  opts: SeedRunOptions,
): Promise<void> {
  const run = await prisma.testRun.upsert({
    where: { id: opts.runId },
    update: {},
    create: {
      id: opts.runId,
      testProfileId: opts.profileId,
      status: opts.status,
      startedAt: opts.startedAt,
      completedAt: opts.completedAt ?? undefined,
    },
  });

  const testCases = [
    'Homepage renders correctly',
    'User can log in with valid credentials',
    'Dashboard displays correct metrics',
  ];

  for (const [i, testName] of testCases.entries()) {
    const isFailed =
      opts.status === TestRunStatus.FAILED && i === testCases.length - 1;
    const resultStatus: TestResultStatus = isFailed
      ? TestResultStatus.FAILED
      : opts.status === TestRunStatus.RUNNING
        ? TestResultStatus.RUNNING
        : TestResultStatus.PASSED;

    const result = await prisma.testResult.upsert({
      where: { id: `${run.id}_result_${i + 1}` },
      update: {},
      create: {
        id: `${run.id}_result_${i + 1}`,
        testRunId: run.id,
        testName,
        status: resultStatus,
        errorMessage: isFailed
          ? `Expected element ".metric-card" to be visible but it was not found.`
          : undefined,
      },
    });

    const steps = buildSteps(testName, resultStatus);
    for (const [j, step] of steps.entries()) {
      const testStep = await prisma.testStep.upsert({
        where: { id: `${result.id}_step_${j + 1}` },
        update: {},
        create: {
          id: `${result.id}_step_${j + 1}`,
          testResultId: result.id,
          stepNumber: j + 1,
          action: step.action,
          expected: step.expected,
          actual: step.actual,
          status: step.status,
        },
      });

      // Attach a screenshot to the last step of each result
      if (j === steps.length - 1) {
        await prisma.screenshot.upsert({
          where: { id: `${testStep.id}_screenshot` },
          update: {},
          create: {
            id: `${testStep.id}_screenshot`,
            testStepId: testStep.id,
            s3Key: `screenshots/${run.id}/${result.id}/step_${j + 1}.png`,
          },
        });
      }
    }
  }

  console.log(
    `[seed:dev] Test run ${run.id} seeded (${testCases.length} results)`,
  );
}

interface StepDef {
  action: string;
  expected: string;
  actual: string;
  status: TestStepStatus;
}

function buildSteps(testName: string, resultStatus: TestResultStatus): StepDef[] {
  const baseSteps: StepDef[] = [
    {
      action: 'Navigate to homepage',
      expected: 'Page title contains "SemkiEst"',
      actual: 'Page title contains "SemkiEst"',
      status: TestStepStatus.PASSED,
    },
    {
      action: 'Wait for main content to load',
      expected: 'Element ".main-content" is visible',
      actual: 'Element ".main-content" is visible',
      status: TestStepStatus.PASSED,
    },
    {
      action: `Assert: ${testName}`,
      expected: 'Assertion passes',
      actual:
        resultStatus === TestResultStatus.FAILED
          ? 'Assertion failed — element not found'
          : 'Assertion passes',
      status:
        resultStatus === TestResultStatus.FAILED
          ? TestStepStatus.FAILED
          : TestStepStatus.PASSED,
    },
  ];
  return baseSteps;
}

// Allow running as standalone script
if (require.main === module) {
  const prisma = new PrismaClient();
  seedDevelopment(prisma)
    .catch((err) => {
      console.error('[seed:dev] Fatal error:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
