import { BrowserDiffEngine } from './browser-diff';
import { BrowserTestResult } from './compatibility-report';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePng(fillByte: number, size = 1024): Buffer {
  return Buffer.alloc(size, fillByte);
}

const screenshotChromium = makePng(0x10);
const screenshotFirefox = makePng(0x10); // identical
const screenshotWebkit = makePng(0xff); // very different

const baseResult: Omit<BrowserTestResult, 'browser' | 'screenshot'> = {
  testId: 'test-1',
  testName: 'Homepage',
  passed: true,
  duration: 200,
  url: 'https://example.com',
};

const chromiumResult: BrowserTestResult = {
  ...baseResult,
  browser: 'chromium',
  screenshot: screenshotChromium,
};

const firefoxResult: BrowserTestResult = {
  ...baseResult,
  browser: 'firefox',
  screenshot: screenshotFirefox,
};

const webkitResult: BrowserTestResult = {
  ...baseResult,
  browser: 'webkit',
  screenshot: screenshotWebkit,
};

const noScreenshotResult: BrowserTestResult = {
  ...baseResult,
  browser: 'firefox',
  screenshot: undefined,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BrowserDiffEngine', () => {
  let engine: BrowserDiffEngine;

  beforeEach(() => {
    engine = new BrowserDiffEngine(0.01);
  });

  describe('generateDiffs()', () => {
    it('returns one diff for two browsers on the same test', () => {
      const diffs = engine.generateDiffs([chromiumResult, firefoxResult]);
      expect(diffs).toHaveLength(1);
      expect(diffs[0]!.browser1).toBe('chromium');
      expect(diffs[0]!.browser2).toBe('firefox');
    });

    it('returns three diffs for three browsers on the same test', () => {
      const diffs = engine.generateDiffs([
        chromiumResult,
        firefoxResult,
        webkitResult,
      ]);
      expect(diffs).toHaveLength(3);
    });

    it('marks identical screenshots as no difference', () => {
      const diffs = engine.generateDiffs([chromiumResult, firefoxResult]);
      expect(diffs[0]!.hasDifferences).toBe(false);
    });

    it('flags significantly different screenshots', () => {
      const diffs = engine.generateDiffs([chromiumResult, webkitResult]);
      expect(diffs[0]!.hasDifferences).toBe(true);
    });

    it('handles missing screenshots without crashing', () => {
      const diffs = engine.generateDiffs([chromiumResult, noScreenshotResult]);
      expect(diffs).toHaveLength(1);
      expect(diffs[0]!.hasDifferences).toBe(false);
      expect(diffs[0]!.diffPixels).toBe(0);
    });

    it('returns empty array for single browser result', () => {
      const diffs = engine.generateDiffs([chromiumResult]);
      expect(diffs).toHaveLength(0);
    });

    it('returns empty array for empty input', () => {
      const diffs = engine.generateDiffs([]);
      expect(diffs).toHaveLength(0);
    });

    it('handles results from different tests independently', () => {
      const test2Result: BrowserTestResult = {
        ...chromiumResult,
        testId: 'test-2',
        testName: 'About page',
      };
      const diffs = engine.generateDiffs([chromiumResult, firefoxResult, test2Result]);
      // test-1: chromium vs firefox (1 pair)
      // test-2: chromium only (0 pairs)
      expect(diffs).toHaveLength(1);
    });
  });

  describe('compareScreenshots()', () => {
    it('reports no diff for identical buffers', () => {
      const diff = engine.compareScreenshots(
        'chromium',
        'firefox',
        screenshotChromium,
        screenshotFirefox,
        'test-1',
        'https://example.com',
      );
      expect(diff.hasDifferences).toBe(false);
      expect(diff.diffPixels).toBe(0);
    });

    it('reports diff for different buffers', () => {
      const diff = engine.compareScreenshots(
        'chromium',
        'webkit',
        screenshotChromium,
        screenshotWebkit,
        'test-1',
        'https://example.com',
      );
      expect(diff.hasDifferences).toBe(true);
      expect(diff.diffPixels).toBeGreaterThan(0);
    });

    it('respects custom threshold option', () => {
      // With a very high threshold (1.0), even a large diff is not flagged
      const diff = engine.compareScreenshots(
        'chromium',
        'webkit',
        screenshotChromium,
        screenshotWebkit,
        'test-1',
        'https://example.com',
        { threshold: 1.0 },
      );
      expect(diff.hasDifferences).toBe(false);
    });

    it('returns correct metadata', () => {
      const diff = engine.compareScreenshots(
        'chromium',
        'firefox',
        screenshotChromium,
        screenshotFirefox,
        'test-42',
        'https://example.com/page',
      );
      expect(diff.browser1).toBe('chromium');
      expect(diff.browser2).toBe('firefox');
      expect(diff.testId).toBe('test-42');
      expect(diff.url).toBe('https://example.com/page');
      expect(diff.threshold).toBe(0.01);
    });
  });

  describe('filterSignificant()', () => {
    it('returns only diffs with hasDifferences = true', () => {
      const diffs = engine.generateDiffs([
        chromiumResult,
        firefoxResult,
        webkitResult,
      ]);
      const significant = engine.filterSignificant(diffs);
      expect(significant.every((d) => d.hasDifferences)).toBe(true);
    });
  });

  describe('summarise()', () => {
    it('groups diffs by browser pair', () => {
      const diffs = engine.generateDiffs([
        chromiumResult,
        firefoxResult,
        webkitResult,
      ]);
      const summary = engine.summarise(diffs);
      expect(Object.keys(summary)).toHaveLength(3);
      expect(summary['chromium:firefox']).toBeDefined();
    });

    it('counts total and significant diffs per pair', () => {
      const diffs = engine.generateDiffs([
        chromiumResult, // same as firefox → no diff
        firefoxResult,
        webkitResult, // different from both → diff
      ]);
      const summary = engine.summarise(diffs);
      expect(summary['chromium:firefox']!.total).toBe(1);
      expect(summary['chromium:firefox']!.significant).toBe(0);
      expect(summary['chromium:webkit']!.significant).toBe(1);
    });
  });
});
