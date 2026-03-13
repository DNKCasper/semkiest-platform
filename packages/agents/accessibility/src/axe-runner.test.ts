/**
 * Unit tests for AxeRunner.
 *
 * Playwright and @axe-core/playwright are mocked so these tests run without a
 * real browser. Integration / E2E tests that spin up an actual browser should
 * live in a separate test suite.
 */

import { AxeRunner, type AxeRunnerConfig } from './axe-runner';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAnalyze = jest.fn();
const mockExclude = jest.fn();
const mockWithTags = jest.fn();

// @axe-core/playwright AxeBuilder chain: withTags().exclude().analyze()
jest.mock('@axe-core/playwright', () => {
  return jest.fn().mockImplementation(() => ({
    withTags: mockWithTags.mockReturnThis(),
    exclude: mockExclude.mockReturnThis(),
    analyze: mockAnalyze,
  }));
});

const mockPageClose = jest.fn();
const mockPageGoto = jest.fn();
const mockPage = {
  goto: mockPageGoto,
  close: mockPageClose,
};

const mockContextNewPage = jest.fn().mockResolvedValue(mockPage);
const mockContextClose = jest.fn();
const mockContext = {
  newPage: mockContextNewPage,
  close: mockContextClose,
};

const mockBrowserNewContext = jest.fn().mockResolvedValue(mockContext);
const mockBrowserClose = jest.fn();
const mockBrowser = {
  newContext: mockBrowserNewContext,
  close: mockBrowserClose,
};

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue(mockBrowser),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeAxeResults = (overrides: Partial<ReturnType<typeof buildAxeResults>> = {}) =>
  buildAxeResults(overrides);

function buildAxeResults(overrides: {
  violations?: unknown[];
  passes?: unknown[];
  incomplete?: unknown[];
  inapplicable?: unknown[];
}) {
  return {
    violations: overrides.violations ?? [],
    passes: overrides.passes ?? [{ id: 'rule-1' }],
    incomplete: overrides.incomplete ?? [],
    inapplicable: overrides.inapplicable ?? [{ id: 'rule-2' }],
  };
}

const sampleViolation = {
  id: 'color-contrast',
  description: 'Elements must have sufficient color contrast',
  helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/color-contrast',
  impact: 'serious',
  tags: ['wcag2aa', 'wcag21aa'],
  nodes: [
    {
      target: ['.btn'],
      html: '<button class="btn">Click</button>',
      failureSummary: 'Fix contrast ratio',
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function launchedRunner(config?: AxeRunnerConfig): Promise<AxeRunner> {
  const runner = new AxeRunner(config);
  await runner.launch();
  return runner;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AxeRunner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPageGoto.mockResolvedValue(undefined);
    mockPageClose.mockResolvedValue(undefined);
    mockContextClose.mockResolvedValue(undefined);
    mockBrowserClose.mockResolvedValue(undefined);
    mockContextNewPage.mockResolvedValue(mockPage);
  });

  describe('launch() and close()', () => {
    it('launches Chromium in headless mode by default', async () => {
      const runner = new AxeRunner();
      await runner.launch();

      const { chromium } = require('playwright') as { chromium: { launch: jest.Mock } };
      expect(chromium.launch).toHaveBeenCalledWith({ headless: true });

      await runner.close();
    });

    it('passes headless:false when configured', async () => {
      const runner = new AxeRunner({ headless: false });
      await runner.launch();

      const { chromium } = require('playwright') as { chromium: { launch: jest.Mock } };
      expect(chromium.launch).toHaveBeenCalledWith({ headless: false });

      await runner.close();
    });

    it('closes context and browser on close()', async () => {
      const runner = await launchedRunner();
      await runner.close();
      expect(mockContextClose).toHaveBeenCalledTimes(1);
      expect(mockBrowserClose).toHaveBeenCalledTimes(1);
    });

    it('is safe to call close() multiple times', async () => {
      const runner = await launchedRunner();
      await runner.close();
      await runner.close(); // should not throw
    });
  });

  describe('scanPage()', () => {
    it('throws if launch() was not called', async () => {
      const runner = new AxeRunner();
      await expect(runner.scanPage('https://example.com')).rejects.toThrow(
        'not been launched',
      );
    });

    it('navigates to the URL with networkidle', async () => {
      mockAnalyze.mockResolvedValueOnce(makeAxeResults());
      const runner = await launchedRunner();
      await runner.scanPage('https://example.com');

      expect(mockPageGoto).toHaveBeenCalledWith('https://example.com', {
        waitUntil: 'networkidle',
        timeout: 30_000,
      });

      await runner.close();
    });

    it('uses default WCAG tags', async () => {
      mockAnalyze.mockResolvedValueOnce(makeAxeResults());
      const runner = await launchedRunner();
      await runner.scanPage('https://example.com');

      expect(mockWithTags).toHaveBeenCalledWith(['wcag2a', 'wcag2aa', 'wcag21aa']);

      await runner.close();
    });

    it('uses custom WCAG tags from config', async () => {
      mockAnalyze.mockResolvedValueOnce(makeAxeResults());
      const runner = await launchedRunner({ wcagTags: ['wcag22aa'] });
      await runner.scanPage('https://example.com');

      expect(mockWithTags).toHaveBeenCalledWith(['wcag22aa']);

      await runner.close();
    });

    it('calls exclude() for each configured selector', async () => {
      mockAnalyze.mockResolvedValueOnce(makeAxeResults());
      const runner = await launchedRunner({ excludeSelectors: ['#ads', '.banner'] });
      await runner.scanPage('https://example.com');

      expect(mockExclude).toHaveBeenCalledWith('#ads');
      expect(mockExclude).toHaveBeenCalledWith('.banner');

      await runner.close();
    });

    it('maps violations to AxeViolation shape', async () => {
      mockAnalyze.mockResolvedValueOnce(makeAxeResults({ violations: [sampleViolation] }));
      const runner = await launchedRunner();
      const result = await runner.scanPage('https://example.com');

      expect(result.scanSucceeded).toBe(true);
      expect(result.violations).toHaveLength(1);
      const v = result.violations[0];
      expect(v.id).toBe('color-contrast');
      expect(v.impact).toBe('serious');
      expect(v.nodes[0].target).toEqual(['.btn']);

      await runner.close();
    });

    it('normalises unknown impact to "minor"', async () => {
      const withBadImpact = { ...sampleViolation, impact: 'bogus' };
      mockAnalyze.mockResolvedValueOnce(makeAxeResults({ violations: [withBadImpact] }));
      const runner = await launchedRunner();
      const result = await runner.scanPage('https://example.com');
      expect(result.violations[0].impact).toBe('minor');
      await runner.close();
    });

    it('returns passCount, incompleteCount, inapplicableCount', async () => {
      mockAnalyze.mockResolvedValueOnce(
        makeAxeResults({
          passes: [{ id: 'p1' }, { id: 'p2' }],
          incomplete: [{ id: 'i1' }],
          inapplicable: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }],
        }),
      );
      const runner = await launchedRunner();
      const result = await runner.scanPage('https://example.com');
      expect(result.passCount).toBe(2);
      expect(result.incompleteCount).toBe(1);
      expect(result.inapplicableCount).toBe(3);
      await runner.close();
    });

    it('closes the page even when goto throws', async () => {
      mockPageGoto.mockRejectedValueOnce(new Error('net::ERR_NAME_NOT_RESOLVED'));
      const runner = await launchedRunner();
      const result = await runner.scanPage('https://does-not-exist.invalid');

      expect(result.scanSucceeded).toBe(false);
      expect(result.errorMessage).toContain('ERR_NAME_NOT_RESOLVED');
      expect(mockPageClose).toHaveBeenCalled();

      await runner.close();
    });

    it('closes the page even when analyze throws', async () => {
      mockPageGoto.mockResolvedValueOnce(undefined);
      mockAnalyze.mockRejectedValueOnce(new Error('axe internal error'));

      const runner = await launchedRunner();
      const result = await runner.scanPage('https://example.com');

      expect(result.scanSucceeded).toBe(false);
      expect(result.errorMessage).toBe('axe internal error');
      expect(mockPageClose).toHaveBeenCalled();

      await runner.close();
    });

    it('uses custom page timeout from config', async () => {
      mockAnalyze.mockResolvedValueOnce(makeAxeResults());
      const runner = await launchedRunner({ pageTimeoutMs: 5_000 });
      await runner.scanPage('https://example.com');

      expect(mockPageGoto).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ timeout: 5_000 }),
      );

      await runner.close();
    });
  });

  describe('scanPages()', () => {
    it('scans multiple URLs and returns results in order', async () => {
      mockAnalyze
        .mockResolvedValueOnce(makeAxeResults())
        .mockResolvedValueOnce(makeAxeResults({ violations: [sampleViolation] }));

      const runner = await launchedRunner();
      const results = await runner.scanPages([
        'https://example.com',
        'https://example.com/about',
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].url).toBe('https://example.com');
      expect(results[1].url).toBe('https://example.com/about');
      expect(results[1].violations).toHaveLength(1);

      await runner.close();
    });

    it('returns an empty array for an empty URL list', async () => {
      const runner = await launchedRunner();
      const results = await runner.scanPages([]);
      expect(results).toEqual([]);
      await runner.close();
    });
  });
});
