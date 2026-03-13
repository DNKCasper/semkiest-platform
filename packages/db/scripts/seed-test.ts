/**
 * Test seed script.
 *
 * Creates a minimal, predictable dataset for fast test cycles:
 *   - 1 organization ("Test Org")
 *   - 2 users (admin, viewer)
 *   - 1 project with 1 test profile
 *   - 1 test run with 2 results and their steps
 *
 * All IDs are stable so test assertions can reference them directly.
 *
 * Usage:
 *   pnpm --filter @semkiest/db seed:test
 */

import {
  PrismaClient,
  UserRole,
  TestRunStatus,
  TestResultStatus,
  TestStepStatus,
} from '@prisma/client';
import * as crypto from 'crypto';

/** Deterministic fake password hash for test users */
function fakePasswordHash(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function seedTest(prisma: PrismaClient): Promise<void> {
  console.log('[seed:test] Starting test seed…');

  // Organization
  await prisma.organization.upsert({
    where: { id: 'test_org' },
    update: {},
    create: {
      id: 'test_org',
      name: 'Test Org',
    },
  });

  // Users
  await prisma.user.upsert({
    where: { email: 'admin@test.example.com' },
    update: {},
    create: {
      id: 'test_user_admin',
      email: 'admin@test.example.com',
      orgId: 'test_org',
      role: UserRole.ADMIN,
      passwordHash: fakePasswordHash('test-admin-password'),
    },
  });

  await prisma.user.upsert({
    where: { email: 'viewer@test.example.com' },
    update: {},
    create: {
      id: 'test_user_viewer',
      email: 'viewer@test.example.com',
      orgId: 'test_org',
      role: UserRole.VIEWER,
      passwordHash: fakePasswordHash('test-viewer-password'),
    },
  });

  // Project
  await prisma.project.upsert({
    where: { id: 'test_project' },
    update: {},
    create: {
      id: 'test_project',
      orgId: 'test_org',
      name: 'Test Project',
      description: 'Minimal project for automated tests',
    },
  });

  // Test Profile
  await prisma.testProfile.upsert({
    where: { id: 'test_profile' },
    update: {},
    create: {
      id: 'test_profile',
      projectId: 'test_project',
      name: 'Default',
      config: {
        browser: 'chromium',
        viewport: { width: 1280, height: 800 },
        headless: true,
        baseUrl: 'http://localhost:3000',
      },
    },
  });

  // Test Run
  await prisma.testRun.upsert({
    where: { id: 'test_run' },
    update: {},
    create: {
      id: 'test_run',
      testProfileId: 'test_profile',
      status: TestRunStatus.PASSED,
      startedAt: new Date('2026-01-01T00:00:00Z'),
      completedAt: new Date('2026-01-01T00:01:00Z'),
    },
  });

  // Test Result 1 — PASSED
  await prisma.testResult.upsert({
    where: { id: 'test_result_1' },
    update: {},
    create: {
      id: 'test_result_1',
      testRunId: 'test_run',
      testName: 'Homepage renders',
      status: TestResultStatus.PASSED,
    },
  });

  await prisma.testStep.upsert({
    where: { id: 'test_step_1_1' },
    update: {},
    create: {
      id: 'test_step_1_1',
      testResultId: 'test_result_1',
      stepNumber: 1,
      action: 'Navigate to /',
      expected: 'HTTP 200',
      actual: 'HTTP 200',
      status: TestStepStatus.PASSED,
    },
  });

  await prisma.screenshot.upsert({
    where: { id: 'test_screenshot_1' },
    update: {},
    create: {
      id: 'test_screenshot_1',
      testStepId: 'test_step_1_1',
      s3Key: 'screenshots/test/homepage.png',
    },
  });

  // Test Result 2 — FAILED
  await prisma.testResult.upsert({
    where: { id: 'test_result_2' },
    update: {},
    create: {
      id: 'test_result_2',
      testRunId: 'test_run',
      testName: 'Login flow',
      status: TestResultStatus.FAILED,
      errorMessage: 'Element "#login-btn" not found',
    },
  });

  await prisma.testStep.upsert({
    where: { id: 'test_step_2_1' },
    update: {},
    create: {
      id: 'test_step_2_1',
      testResultId: 'test_result_2',
      stepNumber: 1,
      action: 'Navigate to /login',
      expected: 'HTTP 200',
      actual: 'HTTP 200',
      status: TestStepStatus.PASSED,
    },
  });

  await prisma.testStep.upsert({
    where: { id: 'test_step_2_2' },
    update: {},
    create: {
      id: 'test_step_2_2',
      testResultId: 'test_result_2',
      stepNumber: 2,
      action: 'Click #login-btn',
      expected: 'Element visible',
      actual: 'Element not found',
      status: TestStepStatus.FAILED,
    },
  });

  // Agent config
  await prisma.agentConfig.upsert({
    where: { id: 'test_agent_config' },
    update: {},
    create: {
      id: 'test_agent_config',
      orgId: 'test_org',
      configJson: { model: 'claude-haiku-4-5-20251001', maxConcurrentTests: 1 },
      active: true,
    },
  });

  console.log('[seed:test] Test seed completed successfully.');
}

// Allow running as standalone script
if (require.main === module) {
  const prisma = new PrismaClient();
  seedTest(prisma)
    .catch((err) => {
      console.error('[seed:test] Fatal error:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
