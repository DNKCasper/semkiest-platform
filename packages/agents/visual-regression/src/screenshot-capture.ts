import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { CaptureOptions, CaptureResult, ScreenshotOptions, SitemapPage, Viewport } from './types.js';
import { VIEWPORTS } from './types.js';

/**
 * Handles all Playwright-based screenshot capture for the visual regression agent.
 *
 * Supports:
 * - Full-page captures across configurable viewports
 * - Element-level captures via CSS selectors
 * - Bulk capture from sitemap page lists
 *
 * @example
 * ```ts
 * const capture = new ScreenshotCapture();
 * const screenshot = await capture.captureFullPage('https://example.com', VIEWPORTS.desktop);
 * await capture.close();
 * ```
 */
export class ScreenshotCapture {
  private browser: Browser | null = null;

  /**
   * Launches a headless Chromium browser. Called automatically on first use,
   * but can be called eagerly to warm up the browser.
   */
  async init(): Promise<void> {
    if (this.browser === null) {
      this.browser = await chromium.launch({ headless: true });
    }
  }

  /**
   * Captures a full-page screenshot at the given viewport.
   *
   * @param url - Page URL to open.
   * @param viewport - Viewport dimensions to apply.
   * @param options - Additional capture options.
   * @returns PNG image bytes.
   */
  async captureFullPage(
    url: string,
    viewport: Viewport,
    options: Pick<ScreenshotOptions, 'waitForSelector' | 'waitForTimeout'> = {},
  ): Promise<Buffer> {
    return this.withPage(viewport, async (page) => {
      await this.navigateAndWait(page, url, options);
      const buffer = await page.screenshot({ fullPage: true, type: 'png' });
      return Buffer.from(buffer);
    });
  }

  /**
   * Captures a screenshot of a specific DOM element identified by `selector`.
   * Falls back to a full-page capture when the selector matches no element.
   *
   * @param url - Page URL to open.
   * @param selector - CSS selector targeting the element to capture.
   * @param viewport - Viewport dimensions to apply.
   * @param options - Additional capture options.
   * @returns PNG image bytes.
   */
  async captureElement(
    url: string,
    selector: string,
    viewport: Viewport,
    options: Pick<ScreenshotOptions, 'waitForSelector' | 'waitForTimeout'> = {},
  ): Promise<Buffer> {
    return this.withPage(viewport, async (page) => {
      await this.navigateAndWait(page, url, options);
      const element = await page.$(selector);
      if (element === null) {
        const buffer = await page.screenshot({ fullPage: true, type: 'png' });
        return Buffer.from(buffer);
      }
      const buffer = await element.screenshot({ type: 'png' });
      return Buffer.from(buffer);
    });
  }

  /**
   * Captures full-page screenshots across multiple viewports for a single URL.
   *
   * @param url - Page URL to open.
   * @param viewports - List of viewports to capture. Defaults to all built-in viewports.
   * @param options - Additional capture options.
   * @returns Map from viewport name to PNG bytes.
   */
  async captureMultipleViewports(
    url: string,
    viewports: Viewport[] = Object.values(VIEWPORTS),
    options: Pick<ScreenshotOptions, 'waitForSelector' | 'waitForTimeout'> = {},
  ): Promise<Map<string, Buffer>> {
    const results = new Map<string, Buffer>();
    for (const viewport of viewports) {
      const screenshot = await this.captureFullPage(url, viewport, options);
      results.set(viewport.name, screenshot);
    }
    return results;
  }

  /**
   * Captures screenshots for a list of sitemap pages across all configured viewports.
   * For each page, captures full-page and optionally element-level screenshots.
   *
   * @param pages - Pages to capture.
   * @param options - Capture configuration.
   * @returns Flat list of capture results.
   */
  async capturePages(pages: SitemapPage[], options: CaptureOptions = {}): Promise<CaptureResult[]> {
    const viewports = options.viewports ?? Object.values(VIEWPORTS);
    const captureOpts = {
      waitForSelector: options.waitForSelector,
      waitForTimeout: options.waitForTimeout,
    };

    const results: CaptureResult[] = [];

    for (const sitemapPage of pages) {
      for (const viewport of viewports) {
        // Full-page capture
        const fullPageScreenshot = await this.captureFullPage(sitemapPage.url, viewport, captureOpts);
        results.push({
          url: sitemapPage.url,
          page: sitemapPage.name,
          viewport,
          screenshot: fullPageScreenshot,
          capturedAt: new Date(),
        });

        // Element-level captures
        const selectors = [
          ...(options.selectors ?? []),
          ...(sitemapPage.selectors ?? []),
        ];
        for (const selector of selectors) {
          const elementScreenshot = await this.captureElement(
            sitemapPage.url,
            selector,
            viewport,
            captureOpts,
          );
          results.push({
            url: sitemapPage.url,
            page: sitemapPage.name,
            viewport,
            screenshot: elementScreenshot,
            element: selector,
            capturedAt: new Date(),
          });
        }
      }
    }

    return results;
  }

  /**
   * Closes the underlying browser. Should be called when the agent is done capturing.
   */
  async close(): Promise<void> {
    if (this.browser !== null) {
      await this.browser.close();
      this.browser = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async getBrowser(): Promise<Browser> {
    if (this.browser === null) {
      await this.init();
    }
    return this.browser as Browser;
  }

  private async withPage<T>(
    viewport: Viewport,
    fn: (page: Page) => Promise<T>,
  ): Promise<T> {
    const browser = await this.getBrowser();
    const context: BrowserContext = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page: Page = await context.newPage();
    try {
      return await fn(page);
    } finally {
      await context.close();
    }
  }

  private async navigateAndWait(
    page: Page,
    url: string,
    options: Pick<ScreenshotOptions, 'waitForSelector' | 'waitForTimeout'>,
  ): Promise<void> {
    await page.goto(url, { waitUntil: 'networkidle' });
    if (options.waitForSelector !== undefined) {
      await page.waitForSelector(options.waitForSelector, { state: 'visible' });
    }
    if (options.waitForTimeout !== undefined && options.waitForTimeout > 0) {
      await page.waitForTimeout(options.waitForTimeout);
    }
  }
}
