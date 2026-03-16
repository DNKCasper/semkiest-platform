import { test, expect, type Page } from '@playwright/test';

/**
 * E2E tests for the Profile Management + Test Run Trigger pipeline.
 *
 * Prerequisites:
 * - Staging API is running and reachable
 * - Frontend dev server is running (or using PLAYWRIGHT_BASE_URL)
 */

const API =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://semkiest-staging-alb-704833170.us-east-1.elb.amazonaws.com';

const RUN_ID = `e2e-${Date.now()}`;
const EMAIL = `e2e-profiles-${RUN_ID}@test.com`;
const PASSWORD = 'E2ePassword123!';

// Shared state across tests in this file
let accessToken = '';
let projectId = '';
let profileId = '';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiCall(
  method: string,
  path: string,
  body?: object,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json: any;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

async function registerAndLogin(): Promise<void> {
  // Register
  await apiCall('POST', '/api/auth/register', {
    email: EMAIL,
    password: PASSWORD,
    name: 'E2E Profile Tester',
  });

  // Login
  const loginRes = await apiCall('POST', '/api/auth/login', {
    email: EMAIL,
    password: PASSWORD,
  });

  expect(loginRes.status).toBe(200);
  accessToken = loginRes.body.tokens.accessToken;
}

async function createProject(): Promise<string> {
  const res = await apiCall('POST', '/api/projects', {
    name: `E2E Profiles Project ${RUN_ID}`,
    url: 'https://example.com',
    description: 'Created by Playwright for profile/run E2E tests',
  });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

async function loginViaUI(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"], input[type="email"]', EMAIL);
  await page.fill('input[name="password"], input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // Wait for navigation away from login
  await page.waitForURL(/\/(projects|dashboard)/, { timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Setup — runs once before all tests in this file
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  await registerAndLogin();
  projectId = await createProject();
});

// ---------------------------------------------------------------------------
// API-level tests
// ---------------------------------------------------------------------------

test.describe('Profile CRUD API', () => {
  test('should create a profile', async () => {
    const res = await apiCall('POST', `/api/projects/${projectId}/profiles`, {
      name: `Smoke Test ${RUN_ID}`,
      config: { browsers: ['chromium'], headless: true },
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.name).toContain('Smoke Test');
    profileId = res.body.data.id;
  });

  test('should list profiles for the project', async () => {
    const res = await apiCall('GET', `/api/projects/${projectId}/profiles`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const found = res.body.data.find((p: any) => p.id === profileId);
    expect(found).toBeDefined();
  });

  test('should get a single profile', async () => {
    const res = await apiCall(
      'GET',
      `/api/projects/${projectId}/profiles/${profileId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(profileId);
    expect(res.body.data.name).toContain('Smoke Test');
  });

  test('should update a profile', async () => {
    const res = await apiCall(
      'PUT',
      `/api/projects/${projectId}/profiles/${profileId}`,
      {
        name: `Updated Smoke ${RUN_ID}`,
        config: { browsers: ['chromium', 'firefox'], headless: false },
      },
    );
    expect(res.status).toBe(200);
    expect(res.body.data.name).toContain('Updated Smoke');
  });

  test('should reject profile creation with empty name', async () => {
    const res = await apiCall('POST', `/api/projects/${projectId}/profiles`, {
      name: '',
      config: {},
    });
    expect(res.status).toBe(400);
  });

  test('should return 404 for non-existent profile', async () => {
    const res = await apiCall(
      'GET',
      `/api/projects/${projectId}/profiles/non-existent-id`,
    );
    expect(res.status).toBe(404);
  });
});

test.describe('Test Run API', () => {
  let testRunId = '';

  test('should trigger a test run', async () => {
    const res = await apiCall('POST', `/api/projects/${projectId}/runs`, {
      profileId,
      triggerType: 'manual',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.status).toBe('PENDING');
    testRunId = res.body.data.id;
  });

  test('should list test runs', async () => {
    const res = await apiCall('GET', `/api/projects/${projectId}/runs`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.pagination).toHaveProperty('total');
  });

  test('should list runs with status filter', async () => {
    const res = await apiCall(
      'GET',
      `/api/projects/${projectId}/runs?status=PENDING`,
    );
    expect(res.status).toBe(200);
    for (const run of res.body.data) {
      expect(run.status).toBe('PENDING');
    }
  });

  test('should get run detail', async () => {
    expect(testRunId).not.toBe('');
    const res = await apiCall(
      'GET',
      `/api/projects/${projectId}/runs/${testRunId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(testRunId);
    expect(res.body.data).toHaveProperty('testResults');
    expect(res.body.data).toHaveProperty('testProfile');
  });

  test('should update run status', async () => {
    expect(testRunId).not.toBe('');
    const res = await apiCall(
      'PATCH',
      `/api/projects/${projectId}/runs/${testRunId}`,
      { status: 'RUNNING' },
    );
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('RUNNING');
  });

  test('should record test results', async () => {
    expect(testRunId).not.toBe('');
    const res = await apiCall(
      'POST',
      `/api/projects/${projectId}/runs/${testRunId}/results`,
      {
        results: [
          { testName: 'Homepage loads', status: 'PASSED' },
          { testName: 'Login flow', status: 'PASSED' },
          {
            testName: 'Dashboard render',
            status: 'FAILED',
            errorMessage: 'Timeout waiting for chart',
          },
        ],
      },
    );
    expect(res.status).toBe(201);
    expect(res.body.data.resultsCreated).toBe(3);
  });

  test('should include results in run detail after recording', async () => {
    expect(testRunId).not.toBe('');
    const res = await apiCall(
      'GET',
      `/api/projects/${projectId}/runs/${testRunId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.totalTests).toBe(3);
    expect(res.body.data.passedTests).toBe(2);
    expect(res.body.data.failedTests).toBe(1);
    expect(res.body.data.passRate).toBeGreaterThan(0);
  });

  test('should return trend data', async () => {
    const res = await apiCall(
      'GET',
      `/api/projects/${projectId}/runs/trend`,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('should reject trigger with missing profileId', async () => {
    const res = await apiCall('POST', `/api/projects/${projectId}/runs`, {
      triggerType: 'manual',
    });
    expect(res.status).toBe(400);
  });

  test('should reject trigger with non-existent profile', async () => {
    const res = await apiCall('POST', `/api/projects/${projectId}/runs`, {
      profileId: 'non-existent-profile-id',
      triggerType: 'manual',
    });
    expect(res.status).toBe(404);
  });
});

test.describe('Profile deletion', () => {
  test('should delete a profile', async () => {
    // Create a temp profile to delete
    const createRes = await apiCall(
      'POST',
      `/api/projects/${projectId}/profiles`,
      {
        name: `Deletable ${RUN_ID}`,
        config: {},
      },
    );
    expect(createRes.status).toBe(201);
    const delId = createRes.body.data.id;

    const delRes = await apiCall(
      'DELETE',
      `/api/projects/${projectId}/profiles/${delId}`,
    );
    expect([200, 204]).toContain(delRes.status);

    // Verify it's gone
    const getRes = await apiCall(
      'GET',
      `/api/projects/${projectId}/profiles/${delId}`,
    );
    expect(getRes.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// UI-level tests
// ---------------------------------------------------------------------------

test.describe('Profile Management UI', () => {
  test('should navigate to profiles page', async ({ page }) => {
    await loginViaUI(page);
    await page.goto(`/projects/${projectId}/profiles`);
    await expect(page.locator('h1, h2').first()).toContainText(/profiles/i, {
      timeout: 10000,
    });
  });

  test('should display existing profiles', async ({ page }) => {
    await loginViaUI(page);
    await page.goto(`/projects/${projectId}/profiles`);
    // Wait for profiles to load (we created at least one)
    await page.waitForSelector('[data-testid="profile-card"], .card, article', {
      timeout: 10000,
    }).catch(() => {
      // May not have data-testid, look for profile name text
    });
    const content = await page.textContent('body');
    expect(content).toContain('Updated Smoke');
  });

  test('project detail page should show run trigger', async ({ page }) => {
    await loginViaUI(page);
    await page.goto(`/projects/${projectId}`);
    await expect(page.locator('text=Run Test')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Test Profiles')).toBeVisible();
    await expect(page.locator('text=Test Runs')).toBeVisible();
  });

  test('project detail page should link to profiles', async ({ page }) => {
    await loginViaUI(page);
    await page.goto(`/projects/${projectId}`);
    const profileLink = page.locator(`a[href*="/projects/${projectId}/profiles"]`);
    await expect(profileLink).toBeVisible({ timeout: 10000 });
  });

  test('project detail page should link to runs', async ({ page }) => {
    await loginViaUI(page);
    await page.goto(`/projects/${projectId}`);
    const runsLink = page.locator(`a[href*="/projects/${projectId}/runs"]`);
    await expect(runsLink).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Run History UI', () => {
  test('should show run history page with data', async ({ page }) => {
    await loginViaUI(page);
    await page.goto(`/projects/${projectId}/runs`);
    await expect(
      page.locator('h1, h2').first(),
    ).toContainText(/test run/i, { timeout: 10000 });
  });
});
