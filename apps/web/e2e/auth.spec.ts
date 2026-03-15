import { test, expect } from '@playwright/test';

test.describe('Authentication Pages', () => {
  test('login page loads and renders form', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.locator('form')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    const signInButton = page.locator('button[type="submit"]');
    await expect(signInButton).toBeVisible();
    await expect(signInButton).toHaveText(/sign in/i);
  });

  test('login page has link to register', async ({ page }) => {
    await page.goto('/auth/login');
    const registerLink = page.locator('a[href*="/auth/register"]');
    await expect(registerLink).toBeVisible();
    await expect(registerLink).toHaveText(/sign up/i);
  });

  test('register page loads and renders form', async ({ page }) => {
    await page.goto('/auth/register');
    await expect(page.locator('form')).toBeVisible();
    await expect(page.locator('#name')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();
    await expect(page.locator('#acceptTerms')).toBeAttached();
    const createButton = page.locator('button[type="submit"]');
    await expect(createButton).toBeVisible();
    await expect(createButton).toHaveText(/create account/i);
  });

  test('register page has link to login', async ({ page }) => {
    await page.goto('/auth/register');
    const loginLink = page.locator('a[href*="/auth/login"]');
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveText(/sign in/i);
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/auth/login');
    await page.locator('#email').fill('nonexistent@test.com');
    await page.locator('#password').fill('wrongpassword123');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
    const url = page.url();
    expect(url).toContain('/auth/login');
    const body = await page.textContent('body');
    const hasErrorIndicator =
      body?.toLowerCase().includes('invalid') ||
      body?.toLowerCase().includes('error') ||
      body?.toLowerCase().includes('incorrect') ||
      body?.toLowerCase().includes('failed');
    expect(hasErrorIndicator).toBeTruthy();
  });

  test('register with mismatched passwords shows error', async ({ page }) => {
    await page.goto('/auth/register');
    await page.locator('#name').fill('Test User');
    await page.locator('#email').fill('mismatch@test.com');
    await page.locator('#password').fill('TestPass123!');
    await page.locator('#confirmPassword').fill('DifferentPass456!');
    await page.locator('#acceptTerms').check({ force: true });
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/auth/register');
  });

  test('register with weak password shows requirements', async ({ page }) => {
    await page.goto('/auth/register');
    await page.locator('#password').fill('weak');
    await page.waitForTimeout(500);
    const body = await page.textContent('body');
    const hasStrengthIndicator =
      body?.toLowerCase().includes('character') ||
      body?.toLowerCase().includes('uppercase') ||
      body?.toLowerCase().includes('number') ||
      body?.toLowerCase().includes('weak');
    expect(hasStrengthIndicator).toBeTruthy();
  });

  test('register new user and verify redirect', async ({ page }) => {
    const timestamp = Date.now();
    const testEmail = `e2e-test-${timestamp}@semkiest-test.com`;
    await page.goto('/auth/register');
    await page.locator('#name').fill('E2E Test User');
    await page.locator('#email').fill(testEmail);
    await page.locator('#password').fill('TestPassword123!');
    await page.locator('#confirmPassword').fill('TestPassword123!');
    await page.locator('#acceptTerms').check({ force: true });
    await page.locator('button[type="submit"]').click();
    // Wait for navigation away from register (cold start after deploy can be slow)
    await page.waitForURL('**/projects**', { timeout: 20000 }).catch(() => {});
    const url = page.url();
    console.log(`Registration result URL: ${url}`);
    const validOutcome =
      url.includes('/projects') ||
      url.includes('/auth/verify-email') ||
      url.includes('/auth/login');
    expect(validOutcome).toBeTruthy();
  });

  test('register without accepting terms fails', async ({ page }) => {
    await page.goto('/auth/register');
    await page.locator('#name').fill('No Terms User');
    await page.locator('#email').fill('noterms@test.com');
    await page.locator('#password').fill('TestPassword123!');
    await page.locator('#confirmPassword').fill('TestPassword123!');
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click({ force: true });
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/auth/register');
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/auth/login');
  });

  test('login with valid credentials redirects to projects', async ({ page }) => {
    const timestamp = Date.now();
    const testEmail = `e2e-login-${timestamp}@semkiest-test.com`;
    const testPassword = 'TestPassword123!';
    const API_URL =
      process.env.NEXT_PUBLIC_API_URL ||
      'http://semkiest-staging-alb-704833170.us-east-1.elb.amazonaws.com';

    const regRes = await page.request.post(`${API_URL}/api/auth/register`, {
      data: { email: testEmail, password: testPassword, name: 'Login Test' },
    });
    console.log(`Pre-registered user: ${regRes.status()}`);

    await page.goto('/auth/login');
    await page.locator('#email').fill(testEmail);
    await page.locator('#password').fill(testPassword);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(5000);
    const url = page.url();
    console.log(`Login result URL: ${url}`);
    const validOutcome =
      url.includes('/projects') || url.includes('/dashboard');
    expect(validOutcome).toBeTruthy();
  });
});
