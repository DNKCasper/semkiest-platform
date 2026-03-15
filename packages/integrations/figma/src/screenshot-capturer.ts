/**
 * ScreenshotCapturer — uses Playwright to capture screenshots of live web pages.
 *
 * Supports:
 *  - Full page or specific element/selector targeting
 *  - Custom viewport configuration (to match Figma frame dimensions)
 *  - Screenshot buffering for comparison
 */

import type { Browser } from 'playwright';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/**
 * Configuration for screenshot capture.
 */
export interface ScreenshotCaptureConfig {
  /**
   * Viewport width in pixels. Defaults to 1280.
   */
  viewportWidth?: number;

  /**
   * Viewport height in pixels. Defaults to 720.
   */
  viewportHeight?: number;

  /**
   * Maximum time to wait for page load in milliseconds. Defaults to 30000.
   */
  timeoutMs?: number;

  /**
   * When true, waits for networkidle event before capturing. Default: true
   */
  waitForNetworkIdle?: boolean;

  /**
   * Device scale factor (1 or 2 for retina). Default: 1
   */
  deviceScaleFactor?: 1 | 2;
}

/**
 * Result of a screenshot capture.
 */
export interface CaptureResult {
  /**
   * Raw PNG buffer of the screenshot.
   */
  imageBuffer: Buffer;

  /**
   * Width of the captured image in pixels.
   */
  width: number;

  /**
   * Height of the captured image in pixels.
   */
  height: number;

  /**
   * URL that was captured.
   */
  url: string;

  /**
   * Timestamp when the screenshot was taken.
   */
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// ScreenshotCapturer class
// ---------------------------------------------------------------------------

/**
 * Captures screenshots of live web pages using Playwright.
 *
 * @example
 * ```ts
 * const capturer = new ScreenshotCapturer({
 *   viewportWidth: 800,
 *   viewportHeight: 600,
 *   waitForNetworkIdle: true,
 * });
 *
 * const result = await capturer.captureFullPage('https://example.com');
 * console.log(`Captured ${result.width}x${result.height} image`);
 * ```
 */
export class ScreenshotCapturer {
  private readonly config: Required<ScreenshotCaptureConfig>;
  private browser?: Browser;

  constructor(config: Partial<ScreenshotCaptureConfig> = {}, browser?: Browser) {
    this.config = {
      viewportWidth: config.viewportWidth ?? 1280,
      viewportHeight: config.viewportHeight ?? 720,
      timeoutMs: config.timeoutMs ?? 30000,
      waitForNetworkIdle: config.waitForNetworkIdle ?? true,
      deviceScaleFactor: config.deviceScaleFactor ?? 1,
    };
    this.browser = browser;
  }

  /**
   * Sets the browser instance to use for capturing.
   * Call this if you didn't provide a browser in the constructor.
   */
  setBrowser(browser: Browser): void {
    this.browser = browser;
  }

  /**
   * Captures a screenshot of the full page.
   *
   * @param url - URL to navigate to
   * @returns Screenshot capture result with image buffer
   */
  async captureFullPage(url: string): Promise<CaptureResult> {
    if (!this.browser) {
      throw new Error('ScreenshotCapturer: browser is not set. Call setBrowser() or provide it in constructor.');
    }

    const page = await this.browser.newPage({
      viewport: {
        width: this.config.viewportWidth,
        height: this.config.viewportHeight,
      },
      deviceScaleFactor: this.config.deviceScaleFactor,
    });

    try {
      const waitUntil = this.config.waitForNetworkIdle ? 'networkidle' : 'load';
      await page.goto(url, {
        waitUntil,
        timeout: this.config.timeoutMs,
      });

      // Get actual viewport dimensions
      const viewportSize = page.viewportSize();
      if (!viewportSize) {
        throw new Error('ScreenshotCapturer: failed to determine viewport size');
      }

      // Capture full page screenshot
      const imageBuffer = await page.screenshot({
        fullPage: true,
        type: 'png',
      });

      return {
        imageBuffer: imageBuffer as Buffer,
        width: viewportSize.width,
        height: viewportSize.height,
        url,
        timestamp: new Date(),
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Captures a screenshot of a specific element matching the given selector.
   *
   * @param url - URL to navigate to
   * @param selector - CSS selector of the element to capture
   * @returns Screenshot capture result with image buffer
   */
  async captureElement(url: string, selector: string): Promise<CaptureResult> {
    if (!this.browser) {
      throw new Error('ScreenshotCapturer: browser is not set. Call setBrowser() or provide it in constructor.');
    }

    const page = await this.browser.newPage({
      viewport: {
        width: this.config.viewportWidth,
        height: this.config.viewportHeight,
      },
      deviceScaleFactor: this.config.deviceScaleFactor,
    });

    try {
      const waitUntil = this.config.waitForNetworkIdle ? 'networkidle' : 'load';
      await page.goto(url, {
        waitUntil,
        timeout: this.config.timeoutMs,
      });

      // Wait for the element to be visible
      await page.waitForSelector(selector, { timeout: this.config.timeoutMs });

      // Get the element
      const element = await page.$(selector);
      if (!element) {
        throw new Error(`ScreenshotCapturer: element matching "${selector}" not found`);
      }

      // Get element bounding box to determine actual dimensions
      const boundingBox = await element.boundingBox();
      if (!boundingBox) {
        throw new Error(`ScreenshotCapturer: could not determine bounding box for "${selector}"`);
      }

      // Capture just the element
      const imageBuffer = (await element.screenshot({
        type: 'png',
      })) as Buffer;

      return {
        imageBuffer,
        width: Math.round(boundingBox.width),
        height: Math.round(boundingBox.height),
        url,
        timestamp: new Date(),
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Captures a screenshot of a specific region of the page.
   *
   * @param url - URL to navigate to
   * @param region - Region to capture {x, y, width, height}
   * @returns Screenshot capture result with image buffer
   */
  async captureRegion(
    url: string,
    region: { x: number; y: number; width: number; height: number },
  ): Promise<CaptureResult> {
    if (!this.browser) {
      throw new Error('ScreenshotCapturer: browser is not set. Call setBrowser() or provide it in constructor.');
    }

    const page = await this.browser.newPage({
      viewport: {
        width: this.config.viewportWidth,
        height: this.config.viewportHeight,
      },
      deviceScaleFactor: this.config.deviceScaleFactor,
    });

    try {
      const waitUntil = this.config.waitForNetworkIdle ? 'networkidle' : 'load';
      await page.goto(url, {
        waitUntil,
        timeout: this.config.timeoutMs,
      });

      // Capture specific region
      const imageBuffer = (await page.screenshot({
        type: 'png',
        clip: {
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height,
        },
      })) as Buffer;

      return {
        imageBuffer,
        width: region.width,
        height: region.height,
        url,
        timestamp: new Date(),
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Gets current configuration.
   */
  getConfig(): Readonly<Required<ScreenshotCaptureConfig>> {
    return { ...this.config };
  }

  /**
   * Updates configuration for future captures.
   */
  updateConfig(config: Partial<ScreenshotCaptureConfig>): void {
    if (config.viewportWidth !== undefined) {
      (this.config as any).viewportWidth = config.viewportWidth;
    }
    if (config.viewportHeight !== undefined) {
      (this.config as any).viewportHeight = config.viewportHeight;
    }
    if (config.timeoutMs !== undefined) {
      (this.config as any).timeoutMs = config.timeoutMs;
    }
    if (config.waitForNetworkIdle !== undefined) {
      (this.config as any).waitForNetworkIdle = config.waitForNetworkIdle;
    }
    if (config.deviceScaleFactor !== undefined) {
      (this.config as any).deviceScaleFactor = config.deviceScaleFactor;
    }
  }
}
