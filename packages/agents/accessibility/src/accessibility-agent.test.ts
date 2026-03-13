/**
 * Unit tests for AccessibilityAgent.
 *
 * AxeRunner is mocked so tests do not require a real browser.
 */

import { AccessibilityAgent, type AccessibilityAgentConfig } from './accessibility-agent';
import type { PageScanResult, AxeViolation } from './axe-runner';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockLaunch = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockScanPages = jest.fn();

jest.mock('./axe-runner', () => ({
  AxeRunner: jest.fn().mockImplementation(() => ({
    launch: mockLaunch,
    close: mockClose,
    scanPages: mockScanPages,
  })),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeViolation(overrides: Partial<AxeViolation> = {}): AxeViolation {
  return {
    id: 'color-contrast',
    description: 'Insufficient colour contrast',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/color-contrast',
    impact: 'serious',
    tags: ['wcag2aa'],
    nodes: [{ target: ['.btn'], html: '<button/>', failureSummary: 'fix it' }],
    ...overrides,
  };
}

function makePageResult(overrides: Partial<PageScanResult> = {}): PageScanResult {
  return {
    url: 'https://example.com',
    scannedAt: new Date().toISOString(),
    scanSucceeded: true,
    violations: [],
    passCount: 5,
    incompleteCount: 0,
    inapplicableCount: 2,
    ...overrides,
  };
}

const BASE_CONFIG: AccessibilityAgentConfig = {
  name: 'Test Accessibility Agent',
  version: '1.0.0',
  targetUrls: ['https://example.com'],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AccessibilityAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('run() — success path', () => {
    it('returns success:true with a report', async () => {
      mockScanPages.mockResolvedValueOnce([makePageResult()]);

      const agent = new AccessibilityAgent(BASE_CONFIG);
      const result = await agent.run();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('launches and closes the runner', async () => {
      mockScanPages.mockResolvedValueOnce([makePageResult()]);
      const agent = new AccessibilityAgent(BASE_CONFIG);
      await agent.run();

      expect(mockLaunch).toHaveBeenCalledTimes(1);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('scans all configured target URLs', async () => {
      mockScanPages.mockResolvedValueOnce([
        makePageResult({ url: 'https://example.com' }),
        makePageResult({ url: 'https://example.com/about' }),
      ]);

      const agent = new AccessibilityAgent({
        ...BASE_CONFIG,
        targetUrls: ['https://example.com', 'https://example.com/about'],
      });
      await agent.run();

      expect(mockScanPages).toHaveBeenCalledWith([
        'https://example.com',
        'https://example.com/about',
      ]);
    });

    it('includes summary with correct field types', async () => {
      mockScanPages.mockResolvedValueOnce([makePageResult()]);
      const agent = new AccessibilityAgent(BASE_CONFIG);
      const result = await agent.run();
      const summary = result.data!.summary;

      expect(typeof summary.totalPages).toBe('number');
      expect(typeof summary.compliantPages).toBe('number');
      expect(typeof summary.overallScore).toBe('number');
      expect(typeof summary.meetsWcag21AA).toBe('boolean');
    });

    it('sets meetsWcag21AA to true when no critical/serious violations', async () => {
      mockScanPages.mockResolvedValueOnce([makePageResult()]);
      const agent = new AccessibilityAgent(BASE_CONFIG);
      const result = await agent.run();
      expect(result.data!.summary.meetsWcag21AA).toBe(true);
    });

    it('sets meetsWcag21AA to false when serious violations exist', async () => {
      mockScanPages.mockResolvedValueOnce([
        makePageResult({ violations: [makeViolation({ impact: 'serious' })] }),
      ]);
      const agent = new AccessibilityAgent(BASE_CONFIG);
      const result = await agent.run();
      expect(result.data!.summary.meetsWcag21AA).toBe(false);
    });

    it('sets meetsWcag21AA to false when critical violations exist', async () => {
      mockScanPages.mockResolvedValueOnce([
        makePageResult({ violations: [makeViolation({ impact: 'critical' })] }),
      ]);
      const agent = new AccessibilityAgent(BASE_CONFIG);
      const result = await agent.run();
      expect(result.data!.summary.meetsWcag21AA).toBe(false);
    });
  });

  describe('report structure', () => {
    it('includes rawScanResults matching scanner output', async () => {
      const scanResult = makePageResult({ url: 'https://example.com/page' });
      mockScanPages.mockResolvedValueOnce([scanResult]);
      const agent = new AccessibilityAgent(BASE_CONFIG);
      const result = await agent.run();
      expect(result.data!.rawScanResults).toHaveLength(1);
      expect(result.data!.rawScanResults[0].url).toBe('https://example.com/page');
    });

    it('sorts pagesByPriority ascending by score', async () => {
      mockScanPages.mockResolvedValueOnce([
        makePageResult({ url: 'https://example.com/good' }),
        makePageResult({
          url: 'https://example.com/bad',
          violations: [makeViolation({ impact: 'critical' })],
        }),
      ]);
      const agent = new AccessibilityAgent(BASE_CONFIG);
      const result = await agent.run();
      const [first, second] = result.data!.pagesByPriority;
      expect(first.accessibilityScore).toBeLessThanOrEqual(second.accessibilityScore);
    });

    it('includes generatedAt ISO string', async () => {
      mockScanPages.mockResolvedValueOnce([makePageResult()]);
      const agent = new AccessibilityAgent(BASE_CONFIG);
      const result = await agent.run();
      const { generatedAt } = result.data!;
      expect(new Date(generatedAt).toISOString()).toBe(generatedAt);
    });

    it('echoes agentName and agentVersion in the report', async () => {
      mockScanPages.mockResolvedValueOnce([makePageResult()]);
      const agent = new AccessibilityAgent({
        ...BASE_CONFIG,
        name: 'MyAgent',
        version: '2.3.4',
      });
      const result = await agent.run();
      expect(result.data!.agentName).toBe('MyAgent');
      expect(result.data!.agentVersion).toBe('2.3.4');
    });
  });

  describe('trends', () => {
    it('starts with a single trend entry when no previousTrends given', async () => {
      mockScanPages.mockResolvedValueOnce([makePageResult()]);
      const agent = new AccessibilityAgent(BASE_CONFIG);
      const result = await agent.run();
      expect(result.data!.trends).toHaveLength(1);
    });

    it('appends to previousTrends', async () => {
      const prevTrend = {
        timestamp: '2026-03-12T00:00:00.000Z',
        overallScore: 85,
        totalViolations: 3,
        compliantPages: 1,
      };
      mockScanPages.mockResolvedValueOnce([makePageResult()]);
      const agent = new AccessibilityAgent({
        ...BASE_CONFIG,
        previousTrends: [prevTrend],
      });
      const result = await agent.run();
      expect(result.data!.trends).toHaveLength(2);
      expect(result.data!.trends[0]).toEqual(prevTrend);
    });

    it('trend entry includes overallScore and totalViolations', async () => {
      mockScanPages.mockResolvedValueOnce([
        makePageResult({
          violations: [makeViolation({ impact: 'minor' })],
        }),
      ]);
      const agent = new AccessibilityAgent(BASE_CONFIG);
      const result = await agent.run();
      const latest = result.data!.trends[result.data!.trends.length - 1];
      expect(typeof latest.overallScore).toBe('number');
      expect(latest.totalViolations).toBe(1);
    });
  });

  describe('error cases', () => {
    it('returns success:false when no targetUrls are provided', async () => {
      const agent = new AccessibilityAgent({ ...BASE_CONFIG, targetUrls: [] });
      const result = await agent.run();
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('at least one URL');
    });

    it('still calls close() when scanPages throws', async () => {
      mockScanPages.mockRejectedValueOnce(new Error('browser crashed'));
      const agent = new AccessibilityAgent(BASE_CONFIG);
      const result = await agent.run();
      expect(result.success).toBe(false);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });
});
