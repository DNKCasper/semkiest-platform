/**
 * CrossBrowserAgent tests.
 *
 * Playwright browser launches are fully mocked so these tests run in standard
 * Jest without requiring actual browser binaries.
 */

import * as fs from 'fs';
import { CrossBrowserAgent } from './cross-browser-agent';
import { BrowserMatrix } from './browser-matrix';

// ---------------------------------------------------------------------------
// Playwright mock
// ---------------------------------------------------------------------------

/** Minimal fluent mock for a Playwright Page */
const mockPage = {
  goto: jest.fn().mockResolvedValue(undefined),
  click: jest.fn().mockResolvedValue(undefined),
  fill: jest.fn().mockResolvedValue(undefined),
  locator: jest.fn().mockReturnValue({
    waitFor: jest.fn().mockResolvedValue(undefined),
    textContent: jest.fn().mockResolvedValue('expected text'),
  }),
  waitForTimeout: jest.fn().mockResolvedValue(undefined),
  screenshot: jest.fn().mockResolvedValue(Buffer.from('')),
};

const mockContext = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockBrowser = {
  newContext: jest.fn().mockResolvedValue(mockContext),
  close: jest.fn().mockResolvedValue(undefined),
};

jest.mock('playwright', () => ({
  chromium: { launch: jest.fn().mockResolvedValue(mockBrowser) },
  firefox: { launch: jest.fn().mockResolvedValue(mockBrowser) },
  webkit: { launch: jest.fn().mockResolvedValue(mockBrowser) },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const minimalTestCase = {
  id: 'tc-1',
  name: 'Basic navigation',
  url: 'https://example.com',
  steps: [
    { action: 'navigate' as const, value: 'https://example.com' },
  ],
};

const singleBrowserMatrix: BrowserMatrix = {
  browsers: [
    {
      browser: 'chromium',
      viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
      enabled: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CrossBrowserAgent', () => {
  let agent: CrossBrowserAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new CrossBrowserAgent({ name: 'test-cross-browser' });
  });

  describe('run() — success path', () => {
    it('returns success=true when all tests pass', async () => {
      const result = await agent.run({
        testCases: [minimalTestCase],
        browserMatrix: singleBrowserMatrix,
      });
      expect(result.success).toBe(true);
    });

    it('produces one result per browser×viewport×test combination', async () => {
      const matrix: BrowserMatrix = {
        browsers: [
          {
            browser: 'chromium',
            viewports: [
              { name: 'mobile', width: 375, height: 667 },
              { name: 'desktop', width: 1920, height: 1080 },
            ],
            enabled: true,
          },
          {
            browser: 'firefox',
            viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
            enabled: true,
          },
        ],
      };

      const result = await agent.run({ testCases: [minimalTestCase], browserMatrix: matrix });
      expect(result.data?.results).toHaveLength(3); // 2 chromium viewports + 1 firefox
    });

    it('skips disabled browsers', async () => {
      const matrix: BrowserMatrix = {
        browsers: [
          {
            browser: 'chromium',
            viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
            enabled: true,
          },
          {
            browser: 'firefox',
            viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
            enabled: false,
          },
        ],
      };

      const result = await agent.run({ testCases: [minimalTestCase], browserMatrix: matrix });
      const browsers = result.data?.results.map((r) => r.browser) ?? [];
      expect(browsers).not.toContain('firefox');
    });
  });

  describe('summary', () => {
    it('correctly counts passed and failed results', async () => {
      const { chromium } = require('playwright');
      // Make chromium fail once
      const failingPage = {
        ...mockPage,
        goto: jest.fn().mockRejectedValueOnce(new Error('nav failed')),
        screenshot: jest.fn().mockResolvedValue(Buffer.from('')),
      };
      const failingContext = { newPage: jest.fn().mockResolvedValue(failingPage), close: jest.fn() };
      const failingBrowser = { newContext: jest.fn().mockResolvedValue(failingContext), close: jest.fn() };
      chromium.launch.mockResolvedValueOnce(failingBrowser);

      const result = await agent.run({
        testCases: [minimalTestCase],
        browserMatrix: singleBrowserMatrix,
      });

      expect(result.data?.summary.failed).toBe(1);
      expect(result.data?.summary.passed).toBe(0);
    });

    it('perBrowser tracks pass/fail per engine', async () => {
      const matrix: BrowserMatrix = {
        browsers: [
          {
            browser: 'chromium',
            viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
            enabled: true,
          },
          {
            browser: 'firefox',
            viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
            enabled: true,
          },
        ],
      };

      const result = await agent.run({ testCases: [minimalTestCase], browserMatrix: matrix });
      const summary = result.data?.summary;

      expect(summary?.perBrowser['chromium']).toBeDefined();
      expect(summary?.perBrowser['firefox']).toBeDefined();
      expect(summary?.browsersRun).toContain('chromium');
      expect(summary?.browsersRun).toContain('firefox');
    });
  });

  describe('screenshot capture', () => {
    it('sets screenshotPath when screenshotDir is provided', async () => {
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const result = await agent.run({
        testCases: [minimalTestCase],
        browserMatrix: singleBrowserMatrix,
        screenshotDir: '/tmp/screenshots',
      });

      expect(result.data?.results[0]?.screenshotPath).toBeDefined();
      expect(result.data?.results[0]?.screenshotPath).toContain('chromium');
    });

    it('does not set screenshotPath when screenshotDir is omitted', async () => {
      const result = await agent.run({
        testCases: [minimalTestCase],
        browserMatrix: singleBrowserMatrix,
      });
      expect(result.data?.results[0]?.screenshotPath).toBeUndefined();
    });
  });

  describe('test step execution', () => {
    it('calls page.goto for navigate steps', async () => {
      await agent.run({
        testCases: [minimalTestCase],
        browserMatrix: singleBrowserMatrix,
      });
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ waitUntil: 'networkidle' }),
      );
    });

    it('calls page.click for click steps', async () => {
      const tc = {
        ...minimalTestCase,
        steps: [{ action: 'click' as const, selector: '#btn' }],
      };
      await agent.run({ testCases: [tc], browserMatrix: singleBrowserMatrix });
      expect(mockPage.click).toHaveBeenCalledWith('#btn', expect.any(Object));
    });

    it('calls page.fill for fill steps', async () => {
      const tc = {
        ...minimalTestCase,
        steps: [{ action: 'fill' as const, selector: '#input', value: 'hello' }],
      };
      await agent.run({ testCases: [tc], browserMatrix: singleBrowserMatrix });
      expect(mockPage.fill).toHaveBeenCalledWith('#input', 'hello', expect.any(Object));
    });

    it('uses page.locator for assert steps', async () => {
      const tc = {
        ...minimalTestCase,
        steps: [{ action: 'assert' as const, selector: '#el', expected: 'expected text' }],
      };
      await agent.run({ testCases: [tc], browserMatrix: singleBrowserMatrix });
      expect(mockPage.locator).toHaveBeenCalledWith('#el');
    });
  });

  describe('browser context isolation', () => {
    it('closes browser and context after each test', async () => {
      await agent.run({
        testCases: [minimalTestCase],
        browserMatrix: singleBrowserMatrix,
      });
      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });
});
