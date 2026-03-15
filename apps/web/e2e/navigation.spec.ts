import { test, expect } from '@playwright/test';

test.describe('Page Navigation', () => {
  test('home page redirects to login or dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const url = page.url();
    const validRedirect = url.includes('/auth/login') || url.includes('/dashboard');
    expect(validRedirect).toBeTruthy();
  });

  test('all main routes load without 500 errors', async ({ page }) => {
    const routes = ['/auth/login', '/auth/register'];
    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status(), `Route ${route} returned error`).toBeLessThan(500);
    }
  });

  test('protected routes redirect when unauthenticated', async ({ page }) => {
    const protectedRoutes = ['/dashboard', '/projects', '/settings', '/analytics'];
    for (const route of protectedRoutes) {
      await page.goto(route);
      await page.waitForTimeout(1500);
      const url = page.url();
      expect(url, `Route ${route} should redirect to login`).toContain('/auth/login');
    }
  });
});
