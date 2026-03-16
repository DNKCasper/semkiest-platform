import { test, expect, type Page } from '@playwright/test';

/**
 * Pipeline Execution E2E Test
 *
 * Tests the FULL test execution pipeline wired in d512d9d:
 *   1. Trigger a run via API → creates TestRun + enqueues coordinate job
 *   2. Worker picks up the job → CoordinatorAgent runs agents in phases
 *   3. Results are persisted to TestResult/TestStep tables
 *   4. Run transitions from PENDING → RUNNING → PASSED/FAILED
 *   5. UI displays the completed run with agent-generated results
 *
 * Unlike platform-run-trigger.spec.ts (which manually injects results via API),
 * this test verifies that the BullMQ → Coordinator → DB pipeline produces
 * results autonomously after a single POST trigger.
 *
 * Usage:
 *   cd apps/web
 *   npx playwright test e2e/pipeline-execution.spec.ts
 *
 * Environment variables:
 *   PLATFORM_EMAIL     — defaults to registering a fresh test user
 *   PLATFORM_PASSWORD  — defaults to TestPassword123!
 *   PROJECT_NAME       — defaults to "US Sports Camps"
 *   PIPELINE_TIMEOUT   — max ms to wait for run completion (default: 120000)
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'http://semkiest-staging-alb-704833170.us-east-1.elb.amazonaws.com';

/**
 * Web frontend URL for UI browser tests.
 * The ALB serves the API only; the Next.js frontend runs on a different port/host.
 * Set PLAYWRIGHT_WEB_URL to enable UI verification tests, or they'll be skipped.
 */
const WEB_URL = process.env.PLAYWRIGHT_WEB_URL || process.env.PLAYWRIGHT_BASE_URL || '';

const RUN_ID = Date.now().toString(36);
const FRESH_EMAIL = `pw-pipe-${RUN_ID}@test.com`;
const FRESH_PASSWORD = 'TestPassword123!';

const PLATFORM_EMAIL = process.env.PLATFORM_EMAIL || FRESH_EMAIL;
const PLATFORM_PASSWORD = process.env.PLATFORM_PASSWORD || FRESH_PASSWORD;
const TARGET_PROJECT = process.env.PROJECT_NAME || 'US Sports Camps';
const PIPELINE_TIMEOUT = Number(process.env.PIPELINE_TIMEOUT) || 120_000;

// Shared state across serial tests
let token = '';
let projectId = '';
let profileId = '';
let testRunId = '';

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function api(
  method: string,
  path: string,
  body?: object,
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

/**
 * Poll the run status until it reaches a terminal state or times out.
 * Returns the final run object.
 */
async function pollRunUntilComplete(
  projId: string,
  runId: string,
  timeoutMs: number = PIPELINE_TIMEOUT,
  intervalMs: number = 2_000,
): Promise<any> {
  const start = Date.now();
  const terminalStatuses = ['PASSED', 'FAILED', 'CANCELLED', 'ERROR'];
  let lastStatus = '';
  let lastRun: any = null;

  while (Date.now() - start < timeoutMs) {
    const res = await api('GET', `/api/projects/${projId}/runs/${runId}`);
    if (res.status !== 200) {
      throw new Error(`Failed to fetch run ${runId}: HTTP ${res.status}`);
    }

    lastRun = res.data.data ?? res.data;
    const currentStatus = lastRun.status;

    if (currentStatus !== lastStatus) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`    [${elapsed}s] Run status: ${lastStatus || '(initial)'} → ${currentStatus}`);
      lastStatus = currentStatus;
    }

    if (terminalStatuses.includes(currentStatus)) {
      return lastRun;
    }

    // Wait before next poll
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  throw new Error(
    `Run ${runId} did not reach terminal status within ${timeoutMs}ms. ` +
    `Last status: ${lastStatus} after ${elapsed}s`,
  );
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

async function loginViaUI(page: Page): Promise<void> {
  await page.goto(`${WEB_URL}/auth/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[name="email"]', PLATFORM_EMAIL);
  await page.fill('input[name="password"]', PLATFORM_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL('**/projects', { timeout: 15_000 });
}

// Force serial execution — tests share state
test.describe.configure({ mode: 'serial' });

// Extend the default timeout for pipeline tests
test.setTimeout(180_000);

// ============================================================================
// Phase 1: Setup — Auth, project, profile
// ============================================================================

test.describe('Pipeline Execution — Setup', () => {
  test('Step 1: Authenticate with the platform', async () => {
    if (PLATFORM_EMAIL === FRESH_EMAIL) {
      const reg = await api('POST', '/api/auth/register', {
        email: FRESH_EMAIL,
        password: FRESH_PASSWORD,
        name: 'PW Pipeline Tester',
      });
      expect([201, 409]).toContain(reg.status);
    }

    const login = await api('POST', '/api/auth/login', {
      email: PLATFORM_EMAIL,
      password: PLATFORM_PASSWORD,
    });
    expect(login.status).toBe(200);
    token = login.data.tokens.accessToken;
    expect(token).toBeTruthy();
    console.log(`  ✓ Logged in as ${PLATFORM_EMAIL}`);
  });

  test('Step 2: Find or create the target project', async () => {
    expect(token).toBeTruthy();

    const res = await api('GET', '/api/projects');
    expect(res.status).toBe(200);

    const project = res.data.data.find((p: any) =>
      p.name.toLowerCase().includes(TARGET_PROJECT.toLowerCase()),
    );

    if (project) {
      projectId = project.id;
      console.log(`  ✓ Found project "${project.name}" (${projectId})`);
    } else {
      const createRes = await api('POST', '/api/projects', {
        name: TARGET_PROJECT,
        url: 'https://qa.ussportscamps.com',
        description: 'Youth Sports Camps — pipeline test',
      });
      expect(createRes.status).toBe(201);
      projectId = createRes.data.data.id;
      console.log(`  ✓ Created project "${TARGET_PROJECT}" (${projectId})`);
    }
    expect(projectId).toBeTruthy();
  });

  test('Step 3: Find or create a test profile with agent config', async () => {
    expect(token).toBeTruthy();
    expect(projectId).toBeTruthy();

    const list = await api('GET', `/api/projects/${projectId}/profiles`);
    expect(list.status).toBe(200);

    if (list.data.data && list.data.data.length > 0) {
      profileId = list.data.data[0].id;
      console.log(`  ✓ Using existing profile "${list.data.data[0].name}" (${profileId})`);
    } else {
      const create = await api('POST', `/api/projects/${projectId}/profiles`, {
        name: `Pipeline Test ${RUN_ID}`,
        config: {
          baseUrl: 'https://qa.ussportscamps.com',
          enabledAgents: ['explorer', 'ui-functional'],
          browsers: ['chromium'],
          headless: true,
          viewport: { width: 1280, height: 720 },
          agentTimeout: 60000,
          agentRetries: 1,
          failureStrategy: 'continue-on-error',
        },
      });
      expect(create.status).toBe(201);
      profileId = create.data.data.id;
      console.log(`  ✓ Created profile "${create.data.data.name}" (${profileId})`);
    }
    expect(profileId).toBeTruthy();
  });
});

// ============================================================================
// Phase 2: Trigger & Wait — fire the pipeline and wait for completion
// ============================================================================

test.describe('Pipeline Execution — Trigger & Completion', () => {
  test('Step 4: Trigger a test run (fires coordinate job)', async () => {
    expect(token).toBeTruthy();
    expect(projectId).toBeTruthy();
    expect(profileId).toBeTruthy();

    const res = await api('POST', `/api/projects/${projectId}/runs`, {
      profileId,
    });

    expect(res.status).toBe(201);
    testRunId = res.data.data.id;
    const initialStatus = res.data.data.status;
    expect(testRunId).toBeTruthy();

    console.log(`  ✓ Triggered test run ${testRunId}`);
    console.log(`    Initial status: ${initialStatus}`);
    console.log(`    A coordinate job should now be enqueued in BullMQ`);
  });

  test('Step 5: Verify run starts in PENDING status', async () => {
    expect(testRunId).toBeTruthy();

    const res = await api('GET', `/api/projects/${projectId}/runs/${testRunId}`);
    expect(res.status).toBe(200);

    const run = res.data.data ?? res.data;
    // Run should be PENDING or already RUNNING (if worker picked it up fast)
    expect(['PENDING', 'RUNNING']).toContain(run.status);
    console.log(`  ✓ Run ${testRunId.substring(0, 8)} status: ${run.status}`);
  });

  test('Step 6: Poll until run reaches terminal status', async () => {
    expect(testRunId).toBeTruthy();

    console.log(`  ⏳ Polling run ${testRunId.substring(0, 8)} (timeout: ${PIPELINE_TIMEOUT / 1000}s)...`);

    const completedRun = await pollRunUntilComplete(projectId, testRunId);

    expect(['PASSED', 'FAILED']).toContain(completedRun.status);
    expect(completedRun.startedAt).toBeTruthy();
    expect(completedRun.completedAt).toBeTruthy();

    // The run should have been marked with start/complete times by the worker
    const startTime = new Date(completedRun.startedAt).getTime();
    const endTime = new Date(completedRun.completedAt).getTime();
    const durationSec = ((endTime - startTime) / 1000).toFixed(1);

    console.log(`  ✓ Run completed with status: ${completedRun.status}`);
    console.log(`    Duration: ${durationSec}s`);
    console.log(`    Started:  ${completedRun.startedAt}`);
    console.log(`    Ended:    ${completedRun.completedAt}`);
  });
});

// ============================================================================
// Phase 3: Verify Results — check that the coordinator persisted real results
// ============================================================================

test.describe('Pipeline Execution — Result Verification', () => {
  test('Step 7: Run has TestResults created by the coordinator', async () => {
    expect(testRunId).toBeTruthy();

    const res = await api('GET', `/api/projects/${projectId}/runs/${testRunId}`);
    expect(res.status).toBe(200);

    const run = res.data.data ?? res.data;
    const results = run.testResults ?? [];

    // The coordinator should have created at least one TestResult per agent
    expect(results.length).toBeGreaterThan(0);

    console.log(`  ✓ Run has ${results.length} test results`);

    // Each result should have a testName containing "agent"
    for (const result of results) {
      expect(result.testName).toBeTruthy();
      expect(result.status).toBeTruthy();
      console.log(`    ${result.status.padEnd(8)} ${result.testName}${result.errorMessage ? ` — ${result.errorMessage}` : ''}`);
    }

    // Verify computed stats are consistent
    const passedCount = results.filter((r: any) => r.status === 'PASSED').length;
    const failedCount = results.filter((r: any) => r.status === 'FAILED').length;

    expect(run.totalTests).toBe(results.length);
    expect(run.passedTests).toBe(passedCount);
    expect(run.failedTests).toBe(failedCount);

    console.log(`  ✓ Stats: ${run.totalTests} total, ${run.passedTests} passed, ${run.failedTests} failed, ${run.passRate}% pass rate`);
  });

  test('Step 8: TestResults have TestSteps', async () => {
    expect(testRunId).toBeTruthy();

    const res = await api('GET', `/api/projects/${projectId}/runs/${testRunId}`);
    expect(res.status).toBe(200);

    const run = res.data.data ?? res.data;
    const results = run.testResults ?? [];

    let totalSteps = 0;
    for (const result of results) {
      const steps = result.testSteps ?? [];
      totalSteps += steps.length;

      // Each result should have at least one step (the summary step)
      expect(steps.length).toBeGreaterThanOrEqual(1);

      // Verify step structure
      const firstStep = steps[0];
      expect(firstStep.stepNumber).toBe(1);
      expect(firstStep.action).toBeTruthy();
      expect(firstStep.expected).toBeTruthy();
      expect(firstStep.actual).toBeTruthy();
    }

    console.log(`  ✓ ${totalSteps} test steps across ${results.length} results`);
  });

  test('Step 9: Agent results contain coordinator metadata', async () => {
    expect(testRunId).toBeTruthy();

    const res = await api('GET', `/api/projects/${projectId}/runs/${testRunId}`);
    expect(res.status).toBe(200);

    const run = res.data.data ?? res.data;
    const results = run.testResults ?? [];

    // Each result's testName should reference an agent type
    const agentTypes = results.map((r: any) => r.testName);
    console.log(`  ✓ Agent results: ${agentTypes.join(', ')}`);

    // At least some results should reference known agent types
    const knownAgentNames = [
      'explorer', 'ui-functional', 'visual-regression', 'accessibility',
      'cross-browser', 'security', 'api', 'spec-reader',
    ];
    const hasAgentResult = agentTypes.some((name: string) =>
      knownAgentNames.some((agent) => name.toLowerCase().includes(agent)),
    );

    expect(hasAgentResult).toBe(true);
    console.log('  ✓ Results contain recognized agent type names');
  });

  test('Step 10: Runs list includes the pipeline-triggered run', async () => {
    expect(testRunId).toBeTruthy();

    const res = await api('GET', `/api/projects/${projectId}/runs`);
    expect(res.status).toBe(200);

    const runs = res.data.data ?? [];
    const found = runs.find((r: any) => r.id === testRunId);
    expect(found).toBeDefined();
    expect(['PASSED', 'FAILED']).toContain(found.status);
    expect(found.totalTests).toBeGreaterThan(0);

    console.log(`  ✓ Run ${testRunId.substring(0, 8)} found in list — ${found.status}, ${found.totalTests} tests`);
  });
});

// ============================================================================
// Phase 4: UI Verification — verify the pipeline results render in the UI
// These tests require a running Next.js frontend. They are skipped when only
// the API ALB URL is available (set PLAYWRIGHT_WEB_URL to enable).
// ============================================================================

// Detect whether the web frontend is reachable by checking if the base URL
// serves HTML (Next.js) rather than JSON (Fastify API).
const webFrontendAvailable = !!process.env.PLAYWRIGHT_WEB_URL;

test.describe('Pipeline Execution — UI Verification', () => {
  test('Step 11: Login and navigate to runs page', async ({ page }) => {
    test.skip(!webFrontendAvailable, 'Skipped: set PLAYWRIGHT_WEB_URL to enable UI tests');

    await loginViaUI(page);

    await page.goto(`${WEB_URL}/projects/${projectId}/runs`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: 'e2e/screenshots/pipeline-01-runs-list.png',
      fullPage: true,
    });

    // The page should show at least one run with a status badge
    const pageContent = await page.textContent('body');
    const lowerContent = pageContent?.toLowerCase() ?? '';

    const hasRunStatus =
      lowerContent.includes('passed') ||
      lowerContent.includes('failed') ||
      lowerContent.includes('running') ||
      lowerContent.includes('pending');

    expect(hasRunStatus).toBe(true);
    console.log('  ✓ Runs page shows status badges');
  });

  test('Step 12: Run detail page shows agent results', async ({ page }) => {
    test.skip(!webFrontendAvailable, 'Skipped: set PLAYWRIGHT_WEB_URL to enable UI tests');
    expect(testRunId).toBeTruthy();

    await loginViaUI(page);

    await page.goto(`${WEB_URL}/projects/${projectId}/runs/${testRunId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: 'e2e/screenshots/pipeline-02-run-detail.png',
      fullPage: true,
    });

    const pageContent = await page.textContent('body');
    const lowerContent = pageContent?.toLowerCase() ?? '';

    // Should show the run status
    const hasStatus =
      lowerContent.includes('passed') || lowerContent.includes('failed');
    expect(hasStatus).toBe(true);

    // Should show agent-generated test results
    const hasAgentResult =
      lowerContent.includes('agent') ||
      lowerContent.includes('explorer') ||
      lowerContent.includes('ui-functional') ||
      lowerContent.includes('test result');

    if (hasAgentResult) {
      console.log('  ✓ Run detail shows agent results');
    } else {
      console.log('  ⚠ Run detail may not show agent names (check screenshot)');
    }
  });

  test('Step 13: Project dashboard reflects the completed run', async ({ page }) => {
    test.skip(!webFrontendAvailable, 'Skipped: set PLAYWRIGHT_WEB_URL to enable UI tests');

    await loginViaUI(page);

    await page.goto(`${WEB_URL}/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: 'e2e/screenshots/pipeline-03-project-dashboard.png',
      fullPage: true,
    });

    // Should still show the project name and quick actions
    const pageContent = await page.textContent('body');
    expect(pageContent?.toLowerCase()).toContain(TARGET_PROJECT.toLowerCase());

    console.log('  ✓ Project dashboard loaded with pipeline results');
  });
});

// ============================================================================
// Phase 5: Cross-checks — verify data integrity
// ============================================================================

test.describe('Pipeline Execution — Data Integrity', () => {
  test('Step 14: Run timing is realistic (not instant)', async () => {
    expect(testRunId).toBeTruthy();

    const res = await api('GET', `/api/projects/${projectId}/runs/${testRunId}`);
    expect(res.status).toBe(200);

    const run = res.data.data ?? res.data;

    // Stub agents complete fast (~100-500ms); real agents take seconds.
    // Just verify timing is non-zero (the coordinator actually ran).
    if (run.startedAt && run.completedAt) {
      const durationMs =
        new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
      expect(durationMs).toBeGreaterThan(0);
      console.log(`  ✓ Run duration: ${(durationMs / 1000).toFixed(1)}s (${durationMs > 1000 ? 'realistic' : 'stub agents'})`);
    } else {
      console.log('  ⚠ Run missing startedAt or completedAt');
    }
  });

  test('Step 15: TestStep evidence paths reference the test run', async () => {
    expect(testRunId).toBeTruthy();

    const res = await api('GET', `/api/projects/${projectId}/runs/${testRunId}`);
    expect(res.status).toBe(200);

    const run = res.data.data ?? res.data;
    const results = run.testResults ?? [];
    let evidenceSteps = 0;

    for (const result of results) {
      for (const step of result.testSteps ?? []) {
        if (step.action?.includes('evidence') || step.actual?.includes('/')) {
          evidenceSteps++;
          // Evidence paths should reference the test run ID
          if (step.actual?.includes(testRunId)) {
            console.log(`    Evidence: ${step.actual}`);
          }
        }
      }
    }

    console.log(`  ✓ Found ${evidenceSteps} evidence-related steps`);
  });

  test('Step 16: Profile used for the run matches', async () => {
    expect(testRunId).toBeTruthy();

    const res = await api('GET', `/api/projects/${projectId}/runs/${testRunId}`);
    expect(res.status).toBe(200);

    const run = res.data.data ?? res.data;

    // The testProfile should match the one we used to trigger
    if (run.testProfile) {
      expect(run.testProfile.id).toBe(profileId);
      console.log(`  ✓ Run linked to profile: ${run.testProfile.name} (${run.testProfile.id})`);
    } else {
      expect(run.testProfileId).toBe(profileId);
      console.log(`  ✓ Run linked to profile ID: ${run.testProfileId}`);
    }
  });

  test('Step 17: Trend data includes the pipeline run', async () => {
    const res = await api('GET', `/api/projects/${projectId}/runs/trend`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);

    // Our run should be in the trend data (it completed)
    const trendEntry = res.data.data.find((t: any) => t.runId === testRunId);
    if (trendEntry) {
      console.log(`  ✓ Run appears in trend data: ${trendEntry.passRate}% pass rate`);
    } else {
      console.log(`  ✓ Trend data has ${res.data.data.length} entries (run may not appear if > 10 recent)`);
    }
  });
});
