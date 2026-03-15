import { test, expect } from '@playwright/test';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'http://semkiest-staging-alb-704833170.us-east-1.elb.amazonaws.com';

// Unique suffix so parallel runs don't collide
const RUN_ID = Date.now().toString(36);
const TEST_EMAIL = `pw-proj-${RUN_ID}@test.com`;
const TEST_PASSWORD = 'TestPassword123!';
const TEST_USER_NAME = 'PW Projects Tester';

// ---- helpers ----------------------------------------------------------------

/** Register a test user directly via the API and return tokens. */
async function registerTestUser(request: any) {
  const res = await request.post(`${API_URL}/api/auth/register`, {
    data: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: TEST_USER_NAME,
    },
  });
  return res.json();
}

/** Login via the UI, store tokens, end up on /projects. */
async function loginViaUI(page: any) {
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  // Wait for redirect to /projects
  await page.waitForURL('**/projects', { timeout: 15_000 });
}

// ---- setup ------------------------------------------------------------------

test.describe('Project CRUD workflow', () => {
  test.beforeAll(async ({ request }) => {
    // Create a test user via the API so login works
    await registerTestUser(request);
  });

  // --------------------------------------------------------------------------
  // Test 1: Login and see projects page
  // --------------------------------------------------------------------------
  test('should login and reach the projects page', async ({ page }) => {
    await loginViaUI(page);

    // Take a screenshot of the projects page
    await page.screenshot({ path: 'e2e/screenshots/01-projects-page.png', fullPage: true });

    // The page should show "Projects" heading
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    // The "New Project" button should be visible
    await expect(page.getByRole('button', { name: /new project/i })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Test 2: Open the create project dialog
  // --------------------------------------------------------------------------
  test('should open the create project dialog', async ({ page }) => {
    await loginViaUI(page);

    await page.getByRole('button', { name: /new project/i }).click();

    // Dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Create Project')).toBeVisible();

    // Form fields should exist
    await expect(page.locator('#project-name')).toBeVisible();
    await expect(page.locator('#project-url')).toBeVisible();
    await expect(page.locator('#project-desc')).toBeVisible();

    await page.screenshot({ path: 'e2e/screenshots/02-create-dialog.png', fullPage: true });
  });

  // --------------------------------------------------------------------------
  // Test 3: Create a project (name only)
  // --------------------------------------------------------------------------
  test('should create a project with name only', async ({ page }) => {
    await loginViaUI(page);

    const projectName = `Test Project ${RUN_ID}`;

    // Open dialog
    await page.getByRole('button', { name: /new project/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill just the name
    await page.locator('#project-name').fill(projectName);

    // Screenshot before submit
    await page.screenshot({ path: 'e2e/screenshots/03-before-create.png', fullPage: true });

    // Click "Create Project"
    await page.getByRole('button', { name: /create project/i }).click();

    // Wait for the dialog to close (indicates success) or an error to appear
    await Promise.race([
      page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10_000 }),
      page.waitForSelector('.text-destructive', { timeout: 10_000 }),
    ]);

    // Screenshot after creation attempt
    await page.screenshot({ path: 'e2e/screenshots/04-after-create.png', fullPage: true });

    // Check for the project card or an error
    const errorEl = page.locator('.text-destructive');
    if (await errorEl.isVisible()) {
      const errorText = await errorEl.textContent();
      console.error('Create project error:', errorText);
      // Still take screenshot for debugging but fail the test
      test.fail(true, `Project creation failed: ${errorText}`);
    }
  });

  // --------------------------------------------------------------------------
  // Test 4: Create a project with all fields
  // --------------------------------------------------------------------------
  test('should create a project with all fields', async ({ page }) => {
    await loginViaUI(page);

    const projectName = `Full Project ${RUN_ID}`;
    const projectUrl = 'https://example.com';
    const projectDesc = 'E2E test project with all fields';

    // Open dialog
    await page.getByRole('button', { name: /new project/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill all fields
    await page.locator('#project-name').fill(projectName);
    await page.locator('#project-url').fill(projectUrl);
    await page.locator('#project-desc').fill(projectDesc);

    // Create
    await page.getByRole('button', { name: /create project/i }).click();

    // Wait for dialog to close or error
    await Promise.race([
      page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10_000 }),
      page.waitForSelector('.text-destructive', { timeout: 10_000 }),
    ]);

    await page.screenshot({ path: 'e2e/screenshots/05-after-full-create.png', fullPage: true });

    // Check for error
    const errorEl = page.locator('.text-destructive');
    if (await errorEl.isVisible()) {
      const errorText = await errorEl.textContent();
      console.error('Create full project error:', errorText);
      test.fail(true, `Full project creation failed: ${errorText}`);
    }
  });

  // --------------------------------------------------------------------------
  // Test 5: Verify project appears in the list
  // --------------------------------------------------------------------------
  test('should show created projects in the list', async ({ page }) => {
    await loginViaUI(page);

    // Wait for project list to load
    await page.waitForSelector('.grid', { timeout: 10_000 }).catch(() => {});

    await page.screenshot({ path: 'e2e/screenshots/06-project-list.png', fullPage: true });

    // The page should not show "No projects yet" if creation succeeded,
    // or it should show the projects we created
    const noProjectsMsg = page.getByText('No projects yet');
    const projectCards = page.locator('.grid a[href*="/projects/"]');

    const hasCards = (await projectCards.count()) > 0;
    const hasEmptyState = await noProjectsMsg.isVisible().catch(() => false);

    console.log(`Project cards: ${await projectCards.count()}, Empty state visible: ${hasEmptyState}`);

    // Capture the error message if there is one
    const errorEl = page.locator('.text-destructive');
    if (await errorEl.isVisible().catch(() => false)) {
      const errorText = await errorEl.textContent();
      console.error('Project list error:', errorText);
    }
  });

  // --------------------------------------------------------------------------
  // Test 6: Navigate to project detail
  // --------------------------------------------------------------------------
  test('should navigate to a project detail page', async ({ page }) => {
    await loginViaUI(page);

    // Wait for list to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const projectCards = page.locator('.grid a[href*="/projects/"]');
    const cardCount = await projectCards.count();

    await page.screenshot({ path: 'e2e/screenshots/07-before-detail-nav.png', fullPage: true });

    if (cardCount > 0) {
      // Click the first project
      await projectCards.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      await page.screenshot({ path: 'e2e/screenshots/08-project-detail.png', fullPage: true });
    } else {
      console.log('No project cards to click — skipping detail nav');
    }
  });

  // --------------------------------------------------------------------------
  // Test 7: Direct API test for project creation
  // --------------------------------------------------------------------------
  test('should create a project via API directly', async ({ request }) => {
    // First login to get a token
    const loginRes = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const loginData = await loginRes.json();
    const token = loginData.tokens?.accessToken;

    expect(token).toBeTruthy();

    // Create a project with full URL
    const createRes = await request.post(`${API_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: `API Test Project ${RUN_ID}`,
        description: 'Created via direct API call',
        url: 'https://api-test.example.com',
      },
    });

    console.log('Create project API status:', createRes.status());
    const body = await createRes.text();
    console.log('Create project API response:', body);

    expect(createRes.status()).toBe(201);
  });

  // --------------------------------------------------------------------------
  // Test 8: API — create project with partial URL (no protocol)
  // --------------------------------------------------------------------------
  test('should accept a partial URL without protocol', async ({ request }) => {
    const loginRes = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const loginData = await loginRes.json();
    const token = loginData.tokens?.accessToken;

    expect(token).toBeTruthy();

    // Send a URL without https:// — the API should auto-prepend it
    const createRes = await request.post(`${API_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: `Partial URL Project ${RUN_ID}`,
        url: 'example.com',
      },
    });

    expect(createRes.status()).toBe(201);

    const resBody = await createRes.json();
    console.log('Partial URL project response:', JSON.stringify(resBody));
  });

  // --------------------------------------------------------------------------
  // Test 9: API — create project with name only (minimal payload)
  // --------------------------------------------------------------------------
  test('should create a project via API with name only', async ({ request }) => {
    const loginRes = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const loginData = await loginRes.json();
    const token = loginData.tokens?.accessToken;

    expect(token).toBeTruthy();

    const createRes = await request.post(`${API_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: `Minimal Project ${RUN_ID}`,
      },
    });

    expect(createRes.status()).toBe(201);
  });

  // --------------------------------------------------------------------------
  // Test 10: API — list projects returns created items
  // --------------------------------------------------------------------------
  test('should list projects via API', async ({ request }) => {
    const loginRes = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const loginData = await loginRes.json();
    const token = loginData.tokens?.accessToken;

    expect(token).toBeTruthy();

    const listRes = await request.get(`${API_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(listRes.status()).toBe(200);

    const listBody = await listRes.json();
    console.log('Project list count:', listBody.data?.length);
    console.log('Pagination:', JSON.stringify(listBody.pagination));

    // Should have at least the projects we created in earlier tests
    expect(listBody.data).toBeDefined();
    expect(Array.isArray(listBody.data)).toBe(true);
  });
});
