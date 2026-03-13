import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { ScreenshotCapture } from '../screenshot-capture.js';
import { VIEWPORTS } from '../types.js';
import type { SitemapPage } from '../types.js';

// ---------------------------------------------------------------------------
// Playwright mock
// ---------------------------------------------------------------------------

const mockScreenshotBuffer = Buffer.from('fake-png-data');

const mockElement = {
  screenshot: jest.fn<() => Promise<Buffer>>().mockResolvedValue(mockScreenshotBuffer),
};

const mockPage = {
  goto: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  screenshot: jest.fn<() => Promise<Buffer>>().mockResolvedValue(mockScreenshotBuffer),
  waitForSelector: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  waitForTimeout: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  $: jest.fn<(selector: string) => Promise<typeof mockElement | null>>().mockResolvedValue(mockElement),
};

const mockContext = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

const mockBrowser = {
  newContext: jest.fn().mockResolvedValue(mockContext),
  close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue(mockBrowser),
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScreenshotCapture', () => {
  let capture: ScreenshotCapture;

  beforeEach(() => {
    capture = new ScreenshotCapture();
    jest.clearAllMocks();
    // Re-attach mocks after clearing
    mockPage.goto.mockResolvedValue(undefined);
    mockPage.screenshot.mockResolvedValue(mockScreenshotBuffer);
    mockPage.waitForSelector.mockResolvedValue(undefined);
    mockPage.waitForTimeout.mockResolvedValue(undefined);
    mockPage.$.mockResolvedValue(mockElement);
    mockElement.screenshot.mockResolvedValue(mockScreenshotBuffer);
    mockContext.newPage.mockResolvedValue(mockPage);
    mockContext.close.mockResolvedValue(undefined);
    mockBrowser.newContext.mockResolvedValue(mockContext);
    mockBrowser.close.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await capture.close();
  });

  describe('captureFullPage', () => {
    it('returns a Buffer of PNG bytes', async () => {
      const result = await capture.captureFullPage('https://example.com', VIEWPORTS.desktop);
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result).toEqual(mockScreenshotBuffer);
    });

    it('navigates to the given URL with networkidle', async () => {
      await capture.captureFullPage('https://example.com', VIEWPORTS.mobile);
      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', { waitUntil: 'networkidle' });
    });

    it('applies the correct viewport dimensions', async () => {
      await capture.captureFullPage('https://example.com', VIEWPORTS.tablet);
      expect(mockBrowser.newContext).toHaveBeenCalledWith({
        viewport: { width: 768, height: 1024 },
      });
    });

    it('waits for selector when provided', async () => {
      await capture.captureFullPage('https://example.com', VIEWPORTS.desktop, {
        waitForSelector: '#main',
      });
      expect(mockPage.waitForSelector).toHaveBeenCalledWith('#main', { state: 'visible' });
    });

    it('waits for timeout when provided', async () => {
      await capture.captureFullPage('https://example.com', VIEWPORTS.desktop, {
        waitForTimeout: 500,
      });
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(500);
    });

    it('does not wait for timeout when value is 0', async () => {
      await capture.captureFullPage('https://example.com', VIEWPORTS.desktop, {
        waitForTimeout: 0,
      });
      expect(mockPage.waitForTimeout).not.toHaveBeenCalled();
    });

    it('closes browser context after capture', async () => {
      await capture.captureFullPage('https://example.com', VIEWPORTS.desktop);
      expect(mockContext.close).toHaveBeenCalled();
    });
  });

  describe('captureElement', () => {
    it('returns element screenshot when selector matches', async () => {
      const result = await capture.captureElement('https://example.com', '#header', VIEWPORTS.desktop);
      expect(result).toEqual(mockScreenshotBuffer);
      expect(mockPage.$).toHaveBeenCalledWith('#header');
      expect(mockElement.screenshot).toHaveBeenCalled();
    });

    it('falls back to full-page screenshot when selector does not match', async () => {
      mockPage.$.mockResolvedValueOnce(null);
      const result = await capture.captureElement('https://example.com', '#missing', VIEWPORTS.desktop);
      expect(result).toEqual(mockScreenshotBuffer);
      expect(mockPage.screenshot).toHaveBeenCalledWith({ fullPage: true, type: 'png' });
    });
  });

  describe('captureMultipleViewports', () => {
    it('captures all built-in viewports by default', async () => {
      const results = await capture.captureMultipleViewports('https://example.com');
      expect(results.size).toBe(Object.keys(VIEWPORTS).length);
      expect(results.has('mobile')).toBe(true);
      expect(results.has('tablet')).toBe(true);
      expect(results.has('desktop')).toBe(true);
      expect(results.has('xl')).toBe(true);
    });

    it('captures only specified viewports', async () => {
      const results = await capture.captureMultipleViewports('https://example.com', [
        VIEWPORTS.mobile,
        VIEWPORTS.desktop,
      ]);
      expect(results.size).toBe(2);
      expect(results.has('mobile')).toBe(true);
      expect(results.has('desktop')).toBe(true);
    });

    it('returns Buffers for each viewport', async () => {
      const results = await capture.captureMultipleViewports('https://example.com', [VIEWPORTS.desktop]);
      const screenshot = results.get('desktop');
      expect(Buffer.isBuffer(screenshot)).toBe(true);
    });
  });

  describe('capturePages', () => {
    const pages: SitemapPage[] = [
      { url: 'https://example.com/home', name: 'home' },
      { url: 'https://example.com/about', name: 'about', selectors: ['#hero'] },
    ];

    it('returns results for each page and viewport combination', async () => {
      const results = await capture.capturePages(pages, {
        viewports: [VIEWPORTS.desktop, VIEWPORTS.mobile],
      });
      // 2 pages × 2 viewports = 4 full-page captures + 1 element capture for #hero
      expect(results.length).toBe(5);
    });

    it('includes correct metadata in each result', async () => {
      const results = await capture.capturePages([pages[0]], {
        viewports: [VIEWPORTS.desktop],
      });
      const result = results[0];
      expect(result.url).toBe('https://example.com/home');
      expect(result.page).toBe('home');
      expect(result.viewport).toEqual(VIEWPORTS.desktop);
      expect(result.capturedAt).toBeInstanceOf(Date);
      expect(Buffer.isBuffer(result.screenshot)).toBe(true);
    });

    it('merges page-level and option-level selectors', async () => {
      const results = await capture.capturePages(
        [{ url: 'https://example.com', name: 'home', selectors: ['#hero'] }],
        { viewports: [VIEWPORTS.desktop], selectors: ['footer'] },
      );
      const elementResults = results.filter((r) => r.element !== undefined);
      expect(elementResults.map((r) => r.element)).toEqual(
        expect.arrayContaining(['footer', '#hero']),
      );
    });

    it('sets element field on element-level results', async () => {
      const results = await capture.capturePages(
        [{ url: 'https://example.com', name: 'home', selectors: ['#header'] }],
        { viewports: [VIEWPORTS.desktop] },
      );
      const elementResult = results.find((r) => r.element !== undefined);
      expect(elementResult?.element).toBe('#header');
    });
  });

  describe('close', () => {
    it('closes the browser', async () => {
      await capture.init();
      await capture.close();
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('is idempotent when called multiple times', async () => {
      await capture.close();
      await capture.close();
      // Should not throw
    });
  });
});
