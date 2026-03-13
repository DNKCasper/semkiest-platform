import { ViolationCategorizer } from './violation-categorizer';
import type { PageScanResult, AxeViolation } from './axe-runner';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeViolation(overrides: Partial<AxeViolation> = {}): AxeViolation {
  return {
    id: 'color-contrast',
    description: 'Elements must have sufficient colour contrast',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/color-contrast',
    impact: 'serious',
    tags: ['wcag2aa', 'wcag21aa', 'cat.color'],
    nodes: [
      {
        target: ['.btn'],
        html: '<button class="btn">Click</button>',
        failureSummary: 'Fix contrast ratio',
      },
    ],
    ...overrides,
  };
}

function makePageScanResult(overrides: Partial<PageScanResult> = {}): PageScanResult {
  return {
    url: 'https://example.com',
    scannedAt: '2026-03-13T00:00:00.000Z',
    scanSucceeded: true,
    violations: [],
    passCount: 5,
    incompleteCount: 1,
    inapplicableCount: 2,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ViolationCategorizer', () => {
  let categorizer: ViolationCategorizer;

  beforeEach(() => {
    categorizer = new ViolationCategorizer();
  });

  // ── categorizePage ──────────────────────────────────────────────────────────

  describe('categorizePage()', () => {
    describe('failed scan', () => {
      it('returns non-compliant status and score 0 for failed scans', () => {
        const result = categorizer.categorizePage(
          makePageScanResult({
            scanSucceeded: false,
            violations: [],
            errorMessage: 'net error',
          }),
        );
        expect(result.scanSucceeded).toBe(false);
        expect(result.complianceStatus).toBe('non-compliant');
        expect(result.accessibilityScore).toBe(0);
        expect(result.categorizedViolations).toHaveLength(0);
        expect(result.errorMessage).toBe('net error');
      });
    });

    describe('compliant page', () => {
      it('returns compliant status and score 100 when there are no violations', () => {
        const result = categorizer.categorizePage(makePageScanResult());
        expect(result.complianceStatus).toBe('compliant');
        expect(result.accessibilityScore).toBe(100);
        expect(result.categorizedViolations).toHaveLength(0);
      });
    });

    describe('minor violations', () => {
      it('returns minor-issues status', () => {
        const result = categorizer.categorizePage(
          makePageScanResult({
            violations: [makeViolation({ impact: 'minor' })],
          }),
        );
        expect(result.complianceStatus).toBe('minor-issues');
      });
    });

    describe('moderate violations', () => {
      it('returns needs-improvement status', () => {
        const result = categorizer.categorizePage(
          makePageScanResult({
            violations: [makeViolation({ impact: 'moderate' })],
          }),
        );
        expect(result.complianceStatus).toBe('needs-improvement');
      });
    });

    describe('serious violations', () => {
      it('returns needs-improvement status', () => {
        const result = categorizer.categorizePage(
          makePageScanResult({
            violations: [makeViolation({ impact: 'serious' })],
          }),
        );
        expect(result.complianceStatus).toBe('needs-improvement');
      });
    });

    describe('critical violations', () => {
      it('returns non-compliant status', () => {
        const result = categorizer.categorizePage(
          makePageScanResult({
            violations: [makeViolation({ impact: 'critical' })],
          }),
        );
        expect(result.complianceStatus).toBe('non-compliant');
      });
    });

    describe('severity breakdown', () => {
      it('counts violations correctly per severity', () => {
        const result = categorizer.categorizePage(
          makePageScanResult({
            violations: [
              makeViolation({ id: 'v1', impact: 'critical' }),
              makeViolation({ id: 'v2', impact: 'critical' }),
              makeViolation({ id: 'v3', impact: 'serious' }),
              makeViolation({ id: 'v4', impact: 'minor' }),
            ],
          }),
        );
        expect(result.severityBreakdown).toEqual({
          critical: 2,
          serious: 1,
          moderate: 0,
          minor: 1,
        });
      });
    });

    describe('accessibility score', () => {
      it('deducts points per violation node by severity', () => {
        // 1 serious violation with 1 node → penalty 5 → score 95
        const result = categorizer.categorizePage(
          makePageScanResult({
            violations: [makeViolation({ impact: 'serious' })],
          }),
        );
        expect(result.accessibilityScore).toBe(95);
      });

      it('clamps score to 0 for heavily violating pages', () => {
        const manyNodes = Array.from({ length: 12 }, (_, i) => ({
          target: [`.el-${i}`],
          html: '<div></div>',
          failureSummary: 'fix it',
        }));
        const result = categorizer.categorizePage(
          makePageScanResult({
            violations: [makeViolation({ impact: 'critical', nodes: manyNodes })],
          }),
        );
        expect(result.accessibilityScore).toBe(0);
      });
    });

    describe('remediation guidance', () => {
      it('returns known guidance for color-contrast', () => {
        const result = categorizer.categorizePage(
          makePageScanResult({
            violations: [makeViolation({ id: 'color-contrast' })],
          }),
        );
        const cv = result.categorizedViolations[0];
        expect(cv.remediation.wcagCriterion).toBe('1.4.3');
        expect(cv.remediation.steps.length).toBeGreaterThan(0);
      });

      it('returns known guidance for image-alt', () => {
        const result = categorizer.categorizePage(
          makePageScanResult({
            violations: [makeViolation({ id: 'image-alt' })],
          }),
        );
        const cv = result.categorizedViolations[0];
        expect(cv.remediation.wcagCriterion).toBe('1.1.1');
      });

      it('returns generic guidance for unknown rule IDs', () => {
        const result = categorizer.categorizePage(
          makePageScanResult({
            violations: [makeViolation({ id: 'some-unknown-rule' })],
          }),
        );
        const cv = result.categorizedViolations[0];
        expect(cv.remediation.steps).toHaveLength(4);
        expect(cv.remediation.referenceUrl).toBe(
          'https://dequeuniversity.com/rules/axe/4.9/color-contrast',
        );
      });
    });

    describe('WCAG tag extraction', () => {
      it('extracts wcag-prefixed and best-practice tags', () => {
        const result = categorizer.categorizePage(
          makePageScanResult({
            violations: [
              makeViolation({
                tags: ['wcag2aa', 'wcag21aa', 'cat.color', 'best-practice'],
              }),
            ],
          }),
        );
        const cv = result.categorizedViolations[0];
        expect(cv.wcagTags).toContain('wcag2aa');
        expect(cv.wcagTags).toContain('wcag21aa');
        expect(cv.wcagTags).toContain('best-practice');
        expect(cv.wcagTags).not.toContain('cat.color');
      });
    });

    describe('affected node count', () => {
      it('reports the correct number of affected nodes', () => {
        const nodes = [
          { target: ['.a'], html: '<a/>', failureSummary: 'fix' },
          { target: ['.b'], html: '<b/>', failureSummary: 'fix' },
        ];
        const result = categorizer.categorizePage(
          makePageScanResult({
            violations: [makeViolation({ nodes })],
          }),
        );
        expect(result.categorizedViolations[0].affectedNodeCount).toBe(2);
      });
    });

    describe('pass and incomplete counts', () => {
      it('propagates passCount and incompleteCount from scan result', () => {
        const result = categorizer.categorizePage(
          makePageScanResult({ passCount: 8, incompleteCount: 3 }),
        );
        expect(result.passCount).toBe(8);
        expect(result.incompleteCount).toBe(3);
      });
    });
  });

  // ── categorizeAll ───────────────────────────────────────────────────────────

  describe('categorizeAll()', () => {
    it('returns overall score 100 for an empty page list', () => {
      const report = categorizer.categorizeAll([]);
      expect(report.overallScore).toBe(100);
      expect(report.totalPages).toBe(0);
      expect(report.compliantPages).toBe(0);
    });

    it('averages scores across pages', () => {
      // Page 1: no violations → 100
      // Page 2: 1 serious (1 node) → 95
      const pages: PageScanResult[] = [
        makePageScanResult({ url: 'https://example.com/page1' }),
        makePageScanResult({
          url: 'https://example.com/page2',
          violations: [makeViolation({ impact: 'serious' })],
        }),
      ];
      const report = categorizer.categorizeAll(pages);
      expect(report.overallScore).toBe(Math.round((100 + 95) / 2));
    });

    it('counts compliant pages correctly', () => {
      const pages: PageScanResult[] = [
        makePageScanResult({ url: 'https://example.com/a' }),
        makePageScanResult({ url: 'https://example.com/b' }),
        makePageScanResult({
          url: 'https://example.com/c',
          violations: [makeViolation()],
        }),
      ];
      const report = categorizer.categorizeAll(pages);
      expect(report.compliantPages).toBe(2);
      expect(report.totalPages).toBe(3);
    });

    it('aggregates severity breakdown across all pages', () => {
      const pages: PageScanResult[] = [
        makePageScanResult({
          url: 'https://example.com/a',
          violations: [makeViolation({ id: 'v1', impact: 'critical' })],
        }),
        makePageScanResult({
          url: 'https://example.com/b',
          violations: [makeViolation({ id: 'v2', impact: 'minor' })],
        }),
      ];
      const report = categorizer.categorizeAll(pages);
      expect(report.totalSeverityBreakdown.critical).toBe(1);
      expect(report.totalSeverityBreakdown.minor).toBe(1);
    });

    it('includes a categorizedAt ISO timestamp', () => {
      const report = categorizer.categorizeAll([]);
      expect(new Date(report.categorizedAt).toISOString()).toBe(
        report.categorizedAt,
      );
    });
  });
});
