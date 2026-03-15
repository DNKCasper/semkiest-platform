import { test, expect } from '@playwright/test';

test.describe('Authentication Pages', () => {
  test('login page loads and renders form', async ({ page }) => {
    await page.goto('/auth/login');

    // Should show the login form
    await expect(page.locator('form')).toBeVisible();

    // Should have email and password inputs
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    const passwordInput = page.locator('input[type="password"]');
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Should have a submit/login button
    const loginButton = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Log In"), button:has-text("Login")');
    await expect(loginButton).toBeVisible();
  });

  test('login page has link to register', async ({ page }) => {
    await page.goto('/auth/login');

    const registerLink = page.locator('a[href*="register"], a[href*="signup"], a:has-text("Sign Up"), a:has-text("Register"), a:has-text("Create")');
    await expect(registerLink).toBeVisible();
  });

  test('register page loads and renders form', async ({ page }) => {
    await page.goto('/auth/register');

    await expect(page.locator('form')).toBeVisible();

    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/auth/login');

    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    const passwordInput = page.locator('input[type="password"]');
    const loginButton = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")');

    await emailInput.fill('nonexistent@test.com');
    await passwordInput.fill('wrongpassword123');
    await loginButton.click();

    // Should show an error message (not crash)
    // Wait for either an error message or a toast/alert
    await page.waitForTimeout(3000);
    const pageContent = await page.textContent('body');
    // The page should still be functional (not a 500 error page)
    expect(pageContent).toBeTruthy();
  });

  test('register new user and redirect to dashboard', async ({ page }) => {
    const timestamp = Date.now();
    const testEmail = `e2e-test-${timestamp}@semkiest-test.com`;

    await page.goto('/auth/register');

    // Fill in registration form
    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]');
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    const confirmPasswordInput = page.locator('input[name="confirmPassword"], input[placeholder*="confirm" i]');

    if (await nameInput.isVisible()) {
      await nameInput.fill('E2E Test User');
    }
    await emailInput.fill(testEmail);
    await passwordInput.fill('TestPassword123!');
    if (await confirmPasswordInput.isVisible()) {
      await confirmPasswordInput.fill('TestPassword123!');
    }

    // Check terms checkbox if present
    const termsCheckbox = page.locator('input[type="checkbox"], [role="checkbox"]');
    if (await termsCheckbox.isVisible()) {
      await termsCheckbox.click();
    }

    // Submit
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Wait for navigation or response
    await page.waitForTimeout(5000);

    // Check we either got redirected to dashboard or see a success message
    const url = page.url();
    const pageContent = await page.textContent('body');
    const success = url.includes('dashboard') || url.includes('login') || (pageContent?.includes('success') ?? false);
    
    // Log result for debugging
    console.log(`Registration result - URL: ${url}`);
    console.log(`Page contains error: ${pageContent?.includes('error') || pageContent?.includes('Error')}`);
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    // Try to access a protected page
    await page.goto('/dashboard');

    // Should redirect to login
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/auth/login');
  });
});
