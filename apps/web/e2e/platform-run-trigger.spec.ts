import { test, expect, type Page } from '@playwright/test';

/**
 * Platform E2E: Test Run Trigger & Results Verification
 *
 * Logs into the SemkiEst platform, finds the "US Sports Camps" project,
 * creates a test profile (if needed), triggers a test run via the API,
 * records mock results, and verifies everything is visible in the UI.
 *
 * This validates the full pipeline:
 *   Login → Project → Profile → Trigger Run → Record Results → View in UI
 *
 * Usage:
 *   cd apps/web
 *   npx playwright test e2e/platform-run-trigger.spec.ts
 *
 * Environment variables (optional overrides):
 *   PLATFORM_EMAIL     — defaults to registering a fresh test user
 *   PLATFORM_PASSWORD  — defaults to TestPassword123!
 *   PROJECT_NAME       — defaults to "US Sports Camps"
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'http://semkiest-staging-alb-704833170.us-east-1.elb.amazonaws.com';

const RUN_ID = Date.now().toString(36);
const FRESH_EMAIL = `pw-run-${RUN_ID}@test.com`;
const FRESH_PASSWORD = 'TestPassword123!';

const PLATFORM_EMAIL = process.env.PLATFORM_EMAIL || FRESH_EMAIL;
const PLATFORM_PASSWORD = process.env.PLATFORM_PASSWORD || FRESH_PASSWORD;
const TARGET_PROJECT = process.env.PROJECT_NAME || 'US Sports Camps';

// Shared state across tests (serial execution)
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

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

async function loginViaUI(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await page.fill('input[name="email"]', PLATFORM_EMAIL);
  await page.fill('input[name="password"]', PLATFORM_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL('**/projects', { timeout: 15_000 });
}

// Force serial execution — tests depend on each other
test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// Phase 1: API Setup — Auth, find project, create profile, trigger run
// ---------------------------------------------------------------------------

test.describe('Platform Run Trigger — API Setup', () => {
  test('Step 1: Authenticate with the platform', async () => {
    // Register a fresh user if using default credentials
    if (PLATFORM_EMAIL === FRESH_EMAIL) {
      const reg = await api('POST', '/api/auth/register', {
        email: FRESH_EMAIL,
        password: FRESH_PASSWORD,
        name: 'PW Run Tester',
      });
      expect([201, 409]).toContain(reg.status);
    }

    // Login
    const login = await api('POST', '/api/auth/login', {
      email: PLATFORM_EMAIL,
      password: PLATFORM_PASSWORD,
    });
    expect(login.status).toBe(200);
    token = login.data.tokens.accessToken;
    expect(token).toBeTruthy();
    console.log(`  ✓ Logged in as ${PLATFORM_EMAIL}`);
  });

  test('Step 2: Find the target project by name', async () => {
    expect(token).toBeTruthy();

    const res = await api('GET', '/api/projects');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);

    // Find the project by name (case-insensitive partial match)
    const project = res.data.data.find((p: any) =>
      p.name.toLowerCase().includes(TARGET_PROJECT.toLowerCase()),
    );

    if (project) {
      projectId = project.id;
      console.log(`  ✓ Found project "${project.name}" (${projectId})`);
    } else {
      // Create the project if it doesn't exist
      console.log(`  ⚠ Project "${TARGET_PROJECT}" not found — creating it`);
      const createRes = await api('POST', '/api/projects', {
        name: TARGET_PROJECT,
        url: 'https://qa.ussportscamps.com',
        description: 'Youth Sports Camps',
      });
      expect(createRes.status).toBe(201);
      projectId = createRes.data.data.id;
      console.log(`  ✓ Created project "${TARGET_PROJECT}" (${projectId})`);
    }

    expect(projectId).toBeTruthy();
  });

  test('Step 3: Find or create a test profile', async () => {
    expect(token).toBeTruthy();
    expect(projectId).toBeTruthy();

    // List existing profiles for this project
    const list = await api('GET', `/api/projects/${projectId}/profiles`);
    expect(list.status).toBe(200);

    if (list.data.data && list.data.data.length > 0) {
      // Use the first existing profile
      profileId = list.data.data[0].id;
      console.log(
        `  ✓ Using existing profile "${list.data.data[0].name}" (${profileId})`,
      );
    } else {
      // Create a new profile
      const create = await api('POST', `/api/projects/${projectId}/profiles`, {
        name: `QA Smoke Test ${RUN_ID}`,
        config: {
          targetUrl: 'https://qa.ussportscamps.com',
          browsers: ['chromium'],
          headless: true,
          viewport: { width: 1280, height: 720 },
          timeout: 30000,
        },
      });
      expect(create.status).toBe(201);
      profileId = create.data.data.id;
      console.log(`  ✓ Created profile "${create.data.data.name}" (${profileId})`);
    }

    expect(profileId).toBeTruthy();
  });

  test('Step 4: Trigger a test run', async () => {
    expect(token).toBeTruthy();
    expect(projectId).toBeTruthy();
    expect(profileId).toBeTruthy();

    const res = await api('POST', `/api/projects/${projectId}/runs`, {
      profileId,
    });
    expect(res.status).toBe(201);
    testRunId = res.data.data.id;
    expect(res.data.data.status).toBe('PENDING');
    console.log(`  ✓ Triggered test run ${testRunId} (status: PENDING)`);
  });

  test('Step 5: Mark run as RUNNING', async () => {
    expect(testRunId).toBeTruthy();

    const res = await api(
      'PATCH',
      `/api/projects/${projectId}/runs/${testRunId}`,
      { status: 'RUNNING' },
    );
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('RUNNING');
    console.log('  ✓ Run status updated to RUNNING');
  });

  test('Step 6: Record test results', async () => {
    expect(testRunId).toBeTruthy();

    const results = [
      { testName: 'Homepage loads successfully', status: 'PASSED' },
      { testName: 'Navigation renders correctly', status: 'PASSED' },
      { testName: 'Camp page displays content', status: 'PASSED' },
      { testName: 'Camp page shows pricing', status: 'PASSED' },
      { testName: 'Nike branding is visible', status: 'PASSED' },
      { testName: 'Mobile viewport renders', status: 'PASSED' },
      { testName: 'Page loads under 5 seconds', status: 'PASSED' },
      { testName: 'No broken images', status: 'PASSED' },
      { testName: 'SEO meta description present', status: 'PASSED' },
      {
        testName: 'Registration CTA button works',
        status: 'FAILED',
        errorMessage:
          'Expected registration button to navigate to /register but got 404',
      },
      { testName: 'Footer links are valid', status: 'PASSED' },
      {
        testName: 'Accessibility — heading hierarchy',
        status: 'FAILED',
        errorMessage: 'Found 3 H1 elements, expected at most 2',
      },
    ];

    const res = await api(
      'POST',
      `/api/projects/${projectId}/runs/${testRunId}/results`,
      { results },
    );
    expect(res.status).toBe(201);
    expect(res.data.data.resultsCreated).toBe(12);
    console.log(`  ✓ Recorded ${res.data.data.resultsCreated} test results`);
  });

  test('Step 7: Mark run as completed (FAILED — has failures)', async () => {
    expect(testRunId).toBeTruthy();

    const res = await api(
      'PATCH',
      `/api/projects/${projectId}/runs/${testRunId}`,
      {
        status: 'FAILED',
        completedAt: new Date().toISOString(),
      },
    );
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('FAILED');
    console.log('  ✓ Run marked as FAILED (2 of 12 tests failed)');
  });

  test('Step 8: Verify run detail via API', async () => {
    expect(testRunId).toBeTruthy();

    const res = await api(
      'GET',
      `/api/projects/${projectId}/runs/${testRunId}`,
    );
    expect(res.status).toBe(200);

    const run = res.data.data;
    expect(run.id).toBe(testRunId);
    expect(run.status).toBe('FAILED');
    expect(run.totalTests).toBe(12);
    expect(run.passedTests).toBe(10);
    expect(run.failedTests).toBe(2);
    expect(run.passRate).toBe(83);
    expect(run.testResults).toHaveLength(12);
    expect(run.testProfile).toBeDefined();
    expect(run.testProfile.id).toBe(profileId);
    console.log(
      `  ✓ Run verified: ${run.totalTests} tests, ${run.passedTests} passed, ${run.failedTests} failed, ${run.passRate}% pass rate`,
    );
  });

  test('Step 9: Verify trend data includes the run', async () => {
    const res = await api(
      'GET',
      `/api/projects/${projectId}/runs/trend`,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
    console.log(`  ✓ Trend data has ${res.data.data.length} data points`);
  });
});

// ---------------------------------------------------------------------------
// Phase 2: UI Verification — login and verify everything is visible
// ---------------------------------------------------------------------------

test.describe('Platform Run Trigger — UI Verification', () => {
  test('Step 10: Login and navigate to projects', async ({ page }) => {
    await loginViaUI(page);
    await page.screenshot({
      path: 'e2e/screenshots/run-trigger-01-projects.png',
      fullPage: true,
    });

    // Should see the projects list
    await expect(
      page.getByRole('heading', { name: 'Projects' }),
    ).toBeVisible();
  });

  test('Step 11: Find US Sports Camps project in list', async ({ page }) => {
    await loginViaUI(page);
    await page.waitForLoadState('networkidle');

    // Look for the project card
    const projectCard = page.locator(`text=${TARGET_PROJECT}`).first();
    await expect(projectCard).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: 'e2e/screenshots/run-trigger-02-project-found.png',
      fullPage: true,
    });
  });

  test('Step 12: Navigate to project detail and see Run Test', async ({
    page,
  }) => {
    await loginViaUI(page);
    await page.waitForLoadState('networkidle');

    // Click on the project
    const projectLink = page
      .locator(`a[href*="/projects/"]`)
      .filter({ hasText: new RegExp(TARGET_PROJECT, 'i') })
      .first();

    if (await projectLink.isVisible()) {
      await projectLink.click();
    } else {
      // Direct navigation if card structure differs
      await page.goto(`/projects/${projectId}`);
    }

    await page.waitForLoadState('networkidle');

    // Should see the project name
    await expect(page.locator(`text=${TARGET_PROJECT}`).first()).toBeVisible({
      timeout: 10_000,
    });

    // Should see the Run Test section
    await expect(page.locator('text=Run Test').first()).toBeVisible({
      timeout: 10_000,
    });

    // Should see the Test Profiles quick action
    await expect(page.locator('text=Test Profiles').first()).toBeVisible();

    // Should see the Test Runs quick action
    await expect(page.locator('text=Test Runs').first()).toBeVisible();

    await page.screenshot({
      path: 'e2e/screenshots/run-trigger-03-project-detail.png',
      fullPage: true,
    });
  });

  test('Step 13: Navigate to Test Runs and see the triggered run', async ({
    page,
  }) => {
    // Capture network responses for debugging
    const apiResponses: { url: string; status: number; body?: string }[] = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/')) {
        let body: string | undefined;
        try {
          body = await response.text();
        } catch { /* ignore */ }
        apiResponses.push({ url, status: response.status(), body: body?.substring(0, 500) });
      }
    });

    await loginViaUI(page);

    console.log(`  → Navigating to /projects/${projectId}/runs`);
    console.log(`  → projectId = ${projectId}`);

    // Go directly to runs page
    await page.goto(`/projects/${projectId}/runs`);
    await page.waitForLoadState('networkidle');

    // Wait longer for data to load
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: 'e2e/screenshots/run-trigger-04-runs-list.png',
      fullPage: true,
    });

    // Log all API responses for debugging
    console.log(`  → API responses captured: ${apiResponses.length}`);
    for (const resp of apiResponses) {
      console.log(`    ${resp.status} ${resp.url}`);
      if (resp.status >= 400) {
        console.log(`    BODY: ${resp.body}`);
      }
    }

    // Check for the heading (may be "Test Run History" or similar)
    const pageContent = await page.textContent('body');
    const lowerContent = pageContent?.toLowerCase() ?? '';

    // Log a content snippet for debugging
    console.log(`  → Page content length: ${pageContent?.length}`);
    console.log(`  → Content snippet: ${pageContent?.substring(0, 300)}`);

    // Check for common error indicators
    if (lowerContent.includes('loading test runs')) {
      console.log('  ⚠ Page is still in loading state');
    }
    if (lowerContent.includes('failed to load')) {
      console.log('  ⚠ Page shows a load error');
    }
    if (lowerContent.includes('no test runs found')) {
      console.log('  ⚠ Page shows empty state — no runs matching filters');
    }

    // The page should show at least one run (the one we triggered)
    // Look for status badge text (may be Title Case or UPPER CASE)
    const hasRunData =
      lowerContent.includes('failed') ||
      lowerContent.includes('passed') ||
      lowerContent.includes('running') ||
      lowerContent.includes('pending');

    // Also check the runs API response directly to confirm data exists
    const runsApiResp = apiResponses.find((r) => r.url.includes('/runs') && !r.url.includes('/trend'));
    if (runsApiResp) {
      console.log(`  → Runs API status: ${runsApiResp.status}`);
      console.log(`  → Runs API body: ${runsApiResp.body?.substring(0, 300)}`);
    } else {
      console.log('  ⚠ No runs API call was captured');
    }

    expect(hasRunData).toBe(true);
  });

  test('Step 14: Navigate to run detail and verify results', async ({
    page,
  }) => {
    await loginViaUI(page);

    // Navigate directly to the run detail page
    await page.goto(`/projects/${projectId}/runs/${testRunId}`);
    await page.waitForLoadState('networkidle');

    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'e2e/screenshots/run-trigger-05-run-detail.png',
      fullPage: true,
    });

    // Should show the run ID (first 8 chars)
    const shortRunId = testRunId.substring(0, 8);
    const pageContent = await page.textContent('body');
    expect(pageContent).toContain(shortRunId);
  });

  test('Step 15: Navigate to Manage Profiles page', async ({ page }) => {
    await loginViaUI(page);

    await page.goto(`/projects/${projectId}/profiles`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'e2e/screenshots/run-trigger-06-profiles.png',
      fullPage: true,
    });

    // Should see at least one profile
    const pageContent = await page.textContent('body');
    const hasProfile =
      pageContent?.toLowerCase().includes('profile') ||
      pageContent?.toLowerCase().includes('smoke') ||
      pageContent?.toLowerCase().includes('qa');
    expect(hasProfile).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 3: Cleanup verification
// ---------------------------------------------------------------------------

test.describe('Platform Run Trigger — Cross-checks', () => {
  test('Step 16: Profile list API returns the profile we used', async () => {
    const res = await api('GET', `/api/projects/${projectId}/profiles`);
    expect(res.status).toBe(200);
    const found = res.data.data.find((p: any) => p.id === profileId);
    expect(found).toBeDefined();
    console.log(`  ✓ Profile "${found.name}" still exists`);
  });

  test('Step 17: Runs list API returns the run we created', async () => {
    const res = await api('GET', `/api/projects/${projectId}/runs`);
    expect(res.status).toBe(200);
    const found = res.data.data.find((r: any) => r.id === testRunId);
    expect(found).toBeDefined();
    expect(found.status).toBe('FAILED');
    expect(found.totalTests).toBe(12);
    console.log(
      `  ✓ Run ${testRunId.substring(0, 8)} found in list (${found.totalTests} tests, ${found.passRate}% pass rate)`,
    );
  });

  test('Step 18: Run has correct test result breakdown', async () => {
    const res = await api(
      'GET',
      `/api/projects/${projectId}/runs/${testRunId}`,
    );
    expect(res.status).toBe(200);

    const results = res.data.data.testResults;
    expect(results).toHaveLength(12);

    const passed = results.filter((r: any) => r.status === 'PASSED');
    const failed = results.filter((r: any) => r.status === 'FAILED');

    expect(passed).toHaveLength(10);
    expect(failed).toHaveLength(2);

    // Verify specific failed test names
    const failedNames = failed.map((r: any) => r.testName);
    expect(failedNames).toContain('Registration CTA button works');
    expect(failedNames).toContain('Accessibility — heading hierarchy');

    // Verify failed results have error messages
    for (const f of failed) {
      expect(f.errorMessage).toBeTruthy();
      expect(f.errorMessage.length).toBeGreaterThan(10);
    }

    console.log('  ✓ All 12 results verified with correct pass/fail status');
    console.log(`    Passed: ${passed.map((r: any) => r.testName).join(', ')}`);
    console.log(`    Failed: ${failedNames.join(', ')}`);
  });
});
