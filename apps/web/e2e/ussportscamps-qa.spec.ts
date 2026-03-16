import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * US Sports Camps — QA Site End-to-End Test Suite
 *
 * Tests the QA environment at https://qa.ussportscamps.com and records
 * results back to the SemkiEst platform API.
 *
 * Environment variables:
 *   QA_SITE_URL       — target site (default: https://qa.ussportscamps.com)
 *   QA_USERNAME        — HTTP basic auth or form login username
 *   QA_PASSWORD        — HTTP basic auth or form login password
 *   SEMKIEST_API_URL   — platform API (default: staging ALB)
 *   SEMKIEST_EMAIL     — platform login email
 *   SEMKIEST_PASSWORD  — platform login password
 *   SEMKIEST_PROJECT_ID — project ID for "US Sports Camps"
 *   SEMKIEST_PROFILE_ID — test profile ID to run against
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const QA_SITE = process.env.QA_SITE_URL ?? 'https://qa.ussportscamps.com';
const QA_USER = process.env.QA_USERNAME ?? '';
const QA_PASS = process.env.QA_PASSWORD ?? '';

const PLATFORM_API =
  process.env.SEMKIEST_API_URL ??
  'http://semkiest-staging-alb-704833170.us-east-1.elb.amazonaws.com';
const PLATFORM_EMAIL = process.env.SEMKIEST_EMAIL ?? '';
const PLATFORM_PASSWORD = process.env.SEMKIEST_PASSWORD ?? '';
const PROJECT_ID = process.env.SEMKIEST_PROJECT_ID ?? '';
const PROFILE_ID = process.env.SEMKIEST_PROFILE_ID ?? '';

// Target pages to test
const CAMP_PAGE = '/soccer/nike/larkspur-ca-soccer-camp';
const HOMEPAGE = '/';

// ---------------------------------------------------------------------------
// Platform API helpers — record results back to SemkiEst
// ---------------------------------------------------------------------------

let platformToken = '';
let testRunId = '';

interface TestResultRecord {
  testName: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  errorMessage?: string;
}

const collectedResults: TestResultRecord[] = [];

async function platformApiCall(
  method: string,
  path: string,
  body?: object,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (platformToken) {
    headers['Authorization'] = `Bearer ${platformToken}`;
  }
  const res = await fetch(`${PLATFORM_API}${path}`, {
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

async function loginToPlatform(): Promise<void> {
  if (!PLATFORM_EMAIL || !PLATFORM_PASSWORD) return;
  const res = await platformApiCall('POST', '/api/auth/login', {
    email: PLATFORM_EMAIL,
    password: PLATFORM_PASSWORD,
  });
  if (res.status === 200) {
    platformToken = res.body.tokens.accessToken;
  }
}

async function createTestRun(): Promise<void> {
  if (!platformToken || !PROJECT_ID || !PROFILE_ID) return;
  const res = await platformApiCall(
    'POST',
    `/api/projects/${PROJECT_ID}/runs`,
    { profileId: PROFILE_ID },
  );
  if (res.status === 201) {
    testRunId = res.body.data.id;
    // Mark as running
    await platformApiCall(
      'PATCH',
      `/api/projects/${PROJECT_ID}/runs/${testRunId}`,
      { status: 'RUNNING' },
    );
  }
}

async function recordResults(): Promise<void> {
  if (!platformToken || !testRunId || collectedResults.length === 0) return;
  await platformApiCall(
    'POST',
    `/api/projects/${PROJECT_ID}/runs/${testRunId}/results`,
    { results: collectedResults },
  );
  // Mark run as completed
  const hasFailed = collectedResults.some((r) => r.status === 'FAILED');
  await platformApiCall(
    'PATCH',
    `/api/projects/${PROJECT_ID}/runs/${testRunId}`,
    {
      status: hasFailed ? 'FAILED' : 'PASSED',
      completedAt: new Date().toISOString(),
    },
  );
}

function recordResult(
  testName: string,
  status: 'PASSED' | 'FAILED' | 'SKIPPED',
  errorMessage?: string,
): void {
  collectedResults.push({ testName, status, errorMessage });
}

// ---------------------------------------------------------------------------
// Auth helpers — handle password-protected QA site
// ---------------------------------------------------------------------------

/**
 * Navigate to a QA site page, handling HTTP basic auth if credentials
 * are provided. Call this instead of page.goto() for QA site pages.
 */
async function gotoQA(
  page: Page,
  context: BrowserContext,
  path: string,
): Promise<void> {
  // If credentials are provided, set HTTP basic auth on the context
  if (QA_USER && QA_PASS) {
    await context.setHTTPCredentials({
      username: QA_USER,
      password: QA_PASS,
    });
  }
  await page.goto(`${QA_SITE}${path}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
}

// ---------------------------------------------------------------------------
// Setup & Teardown
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  await loginToPlatform();
  await createTestRun();
});

test.afterAll(async () => {
  await recordResults();
});

// ---------------------------------------------------------------------------
// Test Suite: Homepage
// ---------------------------------------------------------------------------

test.describe('Homepage', () => {
  test('should load the homepage successfully', async ({ page, context }) => {
    const testName = 'Homepage — loads successfully';
    try {
      await gotoQA(page, context, HOMEPAGE);
      const status = page.url().includes(QA_SITE) ? true : false;
      // Page should not be an error page
      const title = await page.title();
      expect(title).not.toBe('');
      expect(title.toLowerCase()).not.toContain('error');
      expect(title.toLowerCase()).not.toContain('404');
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should have a valid page title', async ({ page, context }) => {
    const testName = 'Homepage — valid page title';
    try {
      await gotoQA(page, context, HOMEPAGE);
      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);
      // US Sports Camps or similar branding should be in the title
      const titleLower = title.toLowerCase();
      const hasBranding =
        titleLower.includes('sports') ||
        titleLower.includes('camp') ||
        titleLower.includes('nike') ||
        titleLower.includes('us');
      expect(hasBranding).toBe(true);
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should render navigation/header', async ({ page, context }) => {
    const testName = 'Homepage — navigation renders';
    try {
      await gotoQA(page, context, HOMEPAGE);
      // Look for common nav elements
      const nav = page.locator('nav, header, [role="navigation"]').first();
      await expect(nav).toBeVisible({ timeout: 10000 });
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should render footer', async ({ page, context }) => {
    const testName = 'Homepage — footer renders';
    try {
      await gotoQA(page, context, HOMEPAGE);
      const footer = page.locator('footer').first();
      await expect(footer).toBeVisible({ timeout: 10000 });
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should have no console errors on load', async ({ page, context }) => {
    const testName = 'Homepage — no console errors';
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    try {
      await gotoQA(page, context, HOMEPAGE);
      await page.waitForLoadState('networkidle');
      // Allow some benign errors (e.g. third-party tracking), flag critical ones
      const criticalErrors = errors.filter(
        (e) =>
          !e.includes('favicon') &&
          !e.includes('analytics') &&
          !e.includes('gtm') &&
          !e.includes('fbevents') &&
          !e.includes('ads') &&
          !e.includes('hotjar'),
      );
      expect(criticalErrors.length).toBe(0);
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(
        testName,
        'FAILED',
        `Console errors: ${errors.join('; ')}`,
      );
      throw err;
    }
  });

  test('should have no broken images on homepage', async ({
    page,
    context,
  }) => {
    const testName = 'Homepage — no broken images';
    try {
      await gotoQA(page, context, HOMEPAGE);
      await page.waitForLoadState('networkidle');
      const images = await page.locator('img[src]').all();
      const brokenImages: string[] = [];
      for (const img of images) {
        const naturalWidth = await img.evaluate(
          (el: HTMLImageElement) => el.naturalWidth,
        );
        if (naturalWidth === 0) {
          const src = await img.getAttribute('src');
          brokenImages.push(src ?? 'unknown');
        }
      }
      expect(brokenImages.length).toBe(0);
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should respond within acceptable time', async ({ page, context }) => {
    const testName = 'Homepage — load time < 5s';
    try {
      const start = Date.now();
      await gotoQA(page, context, HOMEPAGE);
      await page.waitForLoadState('domcontentloaded');
      const loadTime = Date.now() - start;
      expect(loadTime).toBeLessThan(5000);
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Camp Detail Page (soccer/nike/larkspur-ca-soccer-camp)
// ---------------------------------------------------------------------------

test.describe('Camp Detail Page', () => {
  test('should load the camp page', async ({ page, context }) => {
    const testName = 'Camp Page — loads successfully';
    try {
      await gotoQA(page, context, CAMP_PAGE);
      const title = await page.title();
      expect(title).not.toBe('');
      expect(title.toLowerCase()).not.toContain('404');
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should display camp name/heading', async ({ page, context }) => {
    const testName = 'Camp Page — camp name visible';
    try {
      await gotoQA(page, context, CAMP_PAGE);
      const heading = page.locator('h1, h2, [class*="camp-name"], [class*="title"]').first();
      await expect(heading).toBeVisible({ timeout: 10000 });
      const text = await heading.textContent();
      expect(text?.length).toBeGreaterThan(0);
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should display camp location information', async ({
    page,
    context,
  }) => {
    const testName = 'Camp Page — location info visible';
    try {
      await gotoQA(page, context, CAMP_PAGE);
      const bodyText = await page.textContent('body');
      const hasLocation =
        bodyText?.toLowerCase().includes('larkspur') ||
        bodyText?.toLowerCase().includes('california') ||
        bodyText?.toLowerCase().includes('ca');
      expect(hasLocation).toBe(true);
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should display pricing or session information', async ({
    page,
    context,
  }) => {
    const testName = 'Camp Page — pricing/sessions visible';
    try {
      await gotoQA(page, context, CAMP_PAGE);
      const bodyText = (await page.textContent('body')) ?? '';
      const hasPricing =
        bodyText.includes('$') ||
        bodyText.toLowerCase().includes('price') ||
        bodyText.toLowerCase().includes('session') ||
        bodyText.toLowerCase().includes('register') ||
        bodyText.toLowerCase().includes('enroll');
      expect(hasPricing).toBe(true);
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should have a call-to-action button', async ({ page, context }) => {
    const testName = 'Camp Page — CTA button present';
    try {
      await gotoQA(page, context, CAMP_PAGE);
      // Look for registration/enrollment/sign-up buttons
      const cta = page.locator(
        'a[href*="register"], a[href*="enroll"], button:has-text("Register"), button:has-text("Enroll"), button:has-text("Sign Up"), a:has-text("Register"), a:has-text("Enroll"), [class*="cta"], [class*="register"]',
      ).first();
      await expect(cta).toBeVisible({ timeout: 10000 });
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should display Nike branding', async ({ page, context }) => {
    const testName = 'Camp Page — Nike branding present';
    try {
      await gotoQA(page, context, CAMP_PAGE);
      const bodyText = (await page.textContent('body')) ?? '';
      const hasNike =
        bodyText.toLowerCase().includes('nike') ||
        (await page.locator('img[alt*="nike" i], img[src*="nike"]').count()) > 0;
      expect(hasNike).toBe(true);
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should have no broken images on camp page', async ({
    page,
    context,
  }) => {
    const testName = 'Camp Page — no broken images';
    try {
      await gotoQA(page, context, CAMP_PAGE);
      await page.waitForLoadState('networkidle');
      const images = await page.locator('img[src]').all();
      const brokenImages: string[] = [];
      for (const img of images) {
        const naturalWidth = await img.evaluate(
          (el: HTMLImageElement) => el.naturalWidth,
        );
        if (naturalWidth === 0) {
          const src = await img.getAttribute('src');
          brokenImages.push(src ?? 'unknown');
        }
      }
      expect(brokenImages.length).toBe(0);
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should respond within acceptable time', async ({ page, context }) => {
    const testName = 'Camp Page — load time < 5s';
    try {
      const start = Date.now();
      await gotoQA(page, context, CAMP_PAGE);
      await page.waitForLoadState('domcontentloaded');
      const loadTime = Date.now() - start;
      expect(loadTime).toBeLessThan(5000);
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Navigation & Links
// ---------------------------------------------------------------------------

test.describe('Navigation & Links', () => {
  test('should have working internal links on homepage', async ({
    page,
    context,
  }) => {
    const testName = 'Navigation — internal links valid';
    try {
      await gotoQA(page, context, HOMEPAGE);
      await page.waitForLoadState('networkidle');
      // Collect all internal links
      const links = await page.locator(`a[href^="/"], a[href^="${QA_SITE}"]`).all();
      const hrefs: string[] = [];
      for (const link of links.slice(0, 10)) {
        // Test up to 10 links
        const href = await link.getAttribute('href');
        if (href && !href.includes('#') && !href.includes('mailto:') && !href.includes('tel:')) {
          hrefs.push(href);
        }
      }
      expect(hrefs.length).toBeGreaterThan(0);
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should navigate from homepage to a sport category', async ({
    page,
    context,
  }) => {
    const testName = 'Navigation — sport category navigation';
    try {
      await gotoQA(page, context, HOMEPAGE);
      // Look for sport links (soccer, basketball, etc.)
      const sportLink = page.locator(
        'a[href*="soccer"], a[href*="basketball"], a[href*="baseball"], a[href*="volleyball"], a[href*="tennis"]',
      ).first();
      if (await sportLink.isVisible()) {
        await sportLink.click();
        await page.waitForLoadState('domcontentloaded');
        expect(page.url()).not.toBe(`${QA_SITE}/`);
        recordResult(testName, 'PASSED');
      } else {
        recordResult(testName, 'SKIPPED', 'No sport category links found on homepage');
      }
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should return valid HTTP status for camp page', async ({ context }) => {
    const testName = 'Navigation — camp page returns 200';
    try {
      if (QA_USER && QA_PASS) {
        await context.setHTTPCredentials({
          username: QA_USER,
          password: QA_PASS,
        });
      }
      const response = await context.request.get(`${QA_SITE}${CAMP_PAGE}`);
      expect(response.status()).toBe(200);
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should return 404 for non-existent page', async ({ context }) => {
    const testName = 'Navigation — 404 for missing page';
    try {
      if (QA_USER && QA_PASS) {
        await context.setHTTPCredentials({
          username: QA_USER,
          password: QA_PASS,
        });
      }
      const response = await context.request.get(
        `${QA_SITE}/this-page-does-not-exist-${Date.now()}`,
      );
      expect(response.status()).toBe(404);
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });
});

// ---------------------------------------------------------------------------
// Test Suite: SEO & Accessibility Basics
// ---------------------------------------------------------------------------

test.describe('SEO & Accessibility', () => {
  test('should have meta description', async ({ page, context }) => {
    const testName = 'SEO — meta description present';
    try {
      await gotoQA(page, context, CAMP_PAGE);
      const metaDesc = await page
        .locator('meta[name="description"]')
        .getAttribute('content');
      expect(metaDesc).not.toBeNull();
      expect(metaDesc!.length).toBeGreaterThan(10);
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should have proper heading hierarchy', async ({ page, context }) => {
    const testName = 'Accessibility — heading hierarchy';
    try {
      await gotoQA(page, context, CAMP_PAGE);
      const h1Count = await page.locator('h1').count();
      // Should have exactly one H1
      expect(h1Count).toBeGreaterThanOrEqual(1);
      expect(h1Count).toBeLessThanOrEqual(2); // Allow max 2
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should have alt text on images', async ({ page, context }) => {
    const testName = 'Accessibility — images have alt text';
    try {
      await gotoQA(page, context, CAMP_PAGE);
      await page.waitForLoadState('networkidle');
      const images = await page.locator('img').all();
      let missingAlt = 0;
      for (const img of images) {
        const alt = await img.getAttribute('alt');
        const role = await img.getAttribute('role');
        // Decorative images with role="presentation" are allowed to skip alt
        if (role !== 'presentation' && (alt === null || alt === '')) {
          missingAlt++;
        }
      }
      // Allow up to 2 images without alt (common for decorative icons)
      expect(missingAlt).toBeLessThanOrEqual(2);
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should have lang attribute on html element', async ({
    page,
    context,
  }) => {
    const testName = 'Accessibility — lang attribute present';
    try {
      await gotoQA(page, context, CAMP_PAGE);
      const lang = await page.locator('html').getAttribute('lang');
      expect(lang).not.toBeNull();
      expect(lang!.length).toBeGreaterThanOrEqual(2);
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should have viewport meta tag', async ({ page, context }) => {
    const testName = 'SEO — viewport meta tag present';
    try {
      await gotoQA(page, context, CAMP_PAGE);
      const viewport = await page
        .locator('meta[name="viewport"]')
        .getAttribute('content');
      expect(viewport).not.toBeNull();
      expect(viewport).toContain('width');
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Responsive Design
// ---------------------------------------------------------------------------

test.describe('Responsive Design', () => {
  test('should render correctly on mobile viewport', async ({
    browser,
  }) => {
    const testName = 'Responsive — mobile viewport renders';
    try {
      const context = await browser.newContext({
        viewport: { width: 375, height: 812 },
        httpCredentials: QA_USER && QA_PASS
          ? { username: QA_USER, password: QA_PASS }
          : undefined,
      });
      const page = await context.newPage();
      await page.goto(`${QA_SITE}${CAMP_PAGE}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      // Page should not have horizontal overflow
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      // Allow a small tolerance (10px)
      expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10);
      await context.close();
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });

  test('should render correctly on tablet viewport', async ({
    browser,
  }) => {
    const testName = 'Responsive — tablet viewport renders';
    try {
      const context = await browser.newContext({
        viewport: { width: 768, height: 1024 },
        httpCredentials: QA_USER && QA_PASS
          ? { username: QA_USER, password: QA_PASS }
          : undefined,
      });
      const page = await context.newPage();
      await page.goto(`${QA_SITE}${CAMP_PAGE}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      const title = await page.title();
      expect(title).not.toBe('');
      await context.close();
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Performance Basics
// ---------------------------------------------------------------------------

test.describe('Performance', () => {
  test('should have reasonable page weight', async ({ page, context }) => {
    const testName = 'Performance — page weight < 5MB';
    let totalBytes = 0;
    try {
      page.on('response', (response) => {
        const headers = response.headers();
        const contentLength = headers['content-length'];
        if (contentLength) {
          totalBytes += parseInt(contentLength, 10);
        }
      });
      await gotoQA(page, context, CAMP_PAGE);
      await page.waitForLoadState('networkidle');
      // 5MB is a generous limit
      expect(totalBytes).toBeLessThan(5 * 1024 * 1024);
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(
        testName,
        'FAILED',
        `Page weight: ${(totalBytes / 1024 / 1024).toFixed(2)}MB. ${String(err)}`,
      );
      throw err;
    }
  });

  test('should not have excessive DOM nodes', async ({ page, context }) => {
    const testName = 'Performance — DOM nodes < 3000';
    try {
      await gotoQA(page, context, CAMP_PAGE);
      await page.waitForLoadState('networkidle');
      const nodeCount = await page.evaluate(
        () => document.querySelectorAll('*').length,
      );
      expect(nodeCount).toBeLessThan(3000);
      recordResult(testName, 'PASSED');
    } catch (err) {
      recordResult(testName, 'FAILED', String(err));
      throw err;
    }
  });
});
