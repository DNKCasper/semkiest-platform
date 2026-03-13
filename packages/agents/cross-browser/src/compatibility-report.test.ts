import {
  CompatibilityReportGenerator,
  BrowserTestResult,
  VisualDiff,
  BrowserIssue,
} from './compatibility-report';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const chromiumPass: BrowserTestResult = {
  testId: 'test-1',
  testName: 'Homepage loads',
  browser: 'chromium',
  passed: true,
  duration: 200,
  url: 'https://example.com',
};

const firefoxPass: BrowserTestResult = {
  testId: 'test-1',
  testName: 'Homepage loads',
  browser: 'firefox',
  passed: true,
  duration: 220,
  url: 'https://example.com',
};

const webkitFail: BrowserTestResult = {
  testId: 'test-1',
  testName: 'Homepage loads',
  browser: 'webkit',
  passed: false,
  duration: 350,
  url: 'https://example.com',
  error: 'Element not found: .hero-button',
};

const chromiumFail: BrowserTestResult = {
  testId: 'test-2',
  testName: 'Login flow',
  browser: 'chromium',
  passed: false,
  duration: 500,
  url: 'https://example.com/login',
  error: 'TypeError: Cannot read property of undefined',
};

const firefoxFail: BrowserTestResult = {
  testId: 'test-2',
  testName: 'Login flow',
  browser: 'firefox',
  passed: false,
  duration: 480,
  url: 'https://example.com/login',
  error: 'TypeError: Cannot read property of undefined',
};

const cssIssue: BrowserIssue = {
  id: 'issue-1',
  browser: 'webkit',
  category: 'css',
  severity: 'medium',
  description: 'Missing webkit prefix',
  url: 'https://example.com',
  suggestedFix: 'Add -webkit- prefix',
  evidence: ['-webkit-backdrop-filter'],
};

const criticalIssue: BrowserIssue = {
  id: 'issue-2',
  browser: 'firefox',
  category: 'javascript',
  severity: 'critical',
  description: 'CSP violation',
  url: 'https://example.com',
  suggestedFix: 'Update CSP headers',
  evidence: ['Content Security Policy blocked inline script'],
};

const visualDiff: VisualDiff = {
  browser1: 'chromium',
  browser2: 'webkit',
  testId: 'test-1',
  url: 'https://example.com',
  diffPixels: 1500,
  diffPercentage: 0.05,
  totalPixels: 30000,
  hasDifferences: true,
  threshold: 0.01,
};

const noDiff: VisualDiff = {
  browser1: 'chromium',
  browser2: 'firefox',
  testId: 'test-1',
  url: 'https://example.com',
  diffPixels: 0,
  diffPercentage: 0,
  totalPixels: 30000,
  hasDifferences: false,
  threshold: 0.01,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CompatibilityReportGenerator', () => {
  let generator: CompatibilityReportGenerator;

  beforeEach(() => {
    generator = new CompatibilityReportGenerator('Test Project');
  });

  describe('generate()', () => {
    it('creates a report with correct metadata', () => {
      const report = generator.generate([], [], []);
      expect(report.projectName).toBe('Test Project');
      expect(report.id).toMatch(/^report-/);
      expect(report.generatedAt).toBeInstanceOf(Date);
    });

    it('groups test results by testId', () => {
      const results = [chromiumPass, firefoxPass, webkitFail];
      const report = generator.generate(results, [], []);
      expect(report.testComparisons).toHaveLength(1);
      expect(report.testComparisons[0]!.testId).toBe('test-1');
    });

    it('marks inconsistent tests correctly', () => {
      const results = [chromiumPass, firefoxPass, webkitFail];
      const report = generator.generate(results, [], []);
      const comp = report.testComparisons[0]!;
      expect(comp.inconsistent).toBe(true);
      expect(comp.failingBrowsers).toContain('webkit');
      expect(comp.passingBrowsers).toContain('chromium');
      expect(comp.passingBrowsers).toContain('firefox');
    });

    it('marks consistent-fail tests correctly', () => {
      const results = [chromiumFail, firefoxFail];
      const report = generator.generate(results, [], []);
      const comp = report.testComparisons[0]!;
      expect(comp.inconsistent).toBe(false);
      expect(comp.failingBrowsers).toHaveLength(2);
      expect(comp.passingBrowsers).toHaveLength(0);
    });

    it('computes pass rates per browser', () => {
      const results = [chromiumPass, firefoxPass, webkitFail];
      const report = generator.generate(results, [], []);
      expect(report.summary.passRateByBrowser['chromium']).toBe(100);
      expect(report.summary.passRateByBrowser['firefox']).toBe(100);
      expect(report.summary.passRateByBrowser['webkit']).toBe(0);
    });

    it('counts inconsistent tests in summary', () => {
      const results = [chromiumPass, webkitFail, chromiumFail, firefoxFail];
      const report = generator.generate(results, [], []);
      expect(report.summary.inconsistentTests).toBe(1);
    });

    it('counts visual diffs with differences', () => {
      const report = generator.generate([], [visualDiff, noDiff], []);
      expect(report.summary.visualDiffsDetected).toBe(1);
    });

    it('counts issues by severity', () => {
      const report = generator.generate([], [], [cssIssue, criticalIssue]);
      expect(report.summary.issuesBySeverity.critical).toBe(1);
      expect(report.summary.issuesBySeverity.medium).toBe(1);
      expect(report.summary.issuesBySeverity.high).toBe(0);
    });

    it('computes overall compatibility score of 100 for perfect results', () => {
      const results = [chromiumPass, firefoxPass];
      const report = generator.generate(results, [], []);
      expect(report.summary.overallCompatibilityScore).toBe(100);
    });

    it('reduces score for inconsistent tests', () => {
      const results = [chromiumPass, webkitFail];
      const report = generator.generate(results, [], []);
      expect(report.summary.overallCompatibilityScore).toBeLessThan(100);
    });

    it('reduces score further for critical issues', () => {
      const results = [chromiumPass, webkitFail];
      const withIssues = generator.generate(results, [], [criticalIssue]);
      const withoutIssues = generator.generate(results, [], []);
      expect(withIssues.summary.overallCompatibilityScore).toBeLessThan(
        withoutIssues.summary.overallCompatibilityScore,
      );
    });

    it('includes recommendations', () => {
      const results = [chromiumPass, webkitFail];
      const report = generator.generate(results, [], [cssIssue]);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('export() — JSON', () => {
    it('produces valid JSON', () => {
      const report = generator.generate([chromiumPass, webkitFail], [], []);
      const json = generator.export(report, { format: 'json' });
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('omits testComparisons when includeTestDetails is false', () => {
      const report = generator.generate([chromiumPass], [], []);
      const json = generator.export(report, { format: 'json' });
      const parsed = JSON.parse(json) as Record<string, unknown>;
      expect(parsed.testComparisons).toBeUndefined();
    });

    it('includes testComparisons when includeTestDetails is true', () => {
      const report = generator.generate([chromiumPass], [], []);
      const json = generator.export(report, {
        format: 'json',
        includeTestDetails: true,
      });
      const parsed = JSON.parse(json) as Record<string, unknown>;
      expect(parsed.testComparisons).toBeDefined();
    });
  });

  describe('export() — Markdown', () => {
    it('produces a string starting with #', () => {
      const report = generator.generate([chromiumPass], [], []);
      const md = generator.export(report, { format: 'markdown' });
      expect(md).toMatch(/^#/);
    });

    it('includes browser pass rate table', () => {
      const report = generator.generate([chromiumPass], [], []);
      const md = generator.export(report, { format: 'markdown' });
      expect(md).toContain('chromium');
    });

    it('lists issues when present', () => {
      const report = generator.generate([], [], [cssIssue]);
      const md = generator.export(report, { format: 'markdown' });
      expect(md).toContain('Detected Issues');
    });

    it('uses custom reportTitle when provided', () => {
      const report = generator.generate([], [], []);
      const md = generator.export(report, {
        format: 'markdown',
        reportTitle: 'My Custom Title',
      });
      expect(md).toContain('My Custom Title');
    });
  });

  describe('export() — HTML', () => {
    it('produces a valid HTML document', () => {
      const report = generator.generate([chromiumPass, webkitFail], [], [cssIssue]);
      const html = generator.export(report, { format: 'html' });
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('</html>');
    });

    it('escapes HTML characters in issue descriptions', () => {
      const xssIssue: BrowserIssue = {
        ...cssIssue,
        description: '<script>alert("xss")</script>',
      };
      const report = generator.generate([], [], [xssIssue]);
      const html = generator.export(report, { format: 'html' });
      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('edge cases', () => {
    it('handles empty results gracefully', () => {
      const report = generator.generate([], [], []);
      expect(report.summary.totalTests).toBe(0);
      expect(report.summary.overallCompatibilityScore).toBe(100);
      expect(report.summary.browsers).toHaveLength(0);
    });

    it('generates unique report IDs', () => {
      const r1 = generator.generate([], [], []);
      const r2 = generator.generate([], [], []);
      expect(r1.id).not.toBe(r2.id);
    });
  });
});
