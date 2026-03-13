import { IssueDetector } from './issue-detector';
import { BrowserTestResult } from './compatibility-report';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeResult(
  overrides: Partial<BrowserTestResult> = {},
): BrowserTestResult {
  return {
    testId: 'test-1',
    testName: 'Default test',
    browser: 'chromium',
    passed: true,
    duration: 200,
    url: 'https://example.com',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IssueDetector', () => {
  let detector: IssueDetector;

  beforeEach(() => {
    detector = new IssueDetector();
  });

  describe('detect() — CSS issues', () => {
    it('detects webkit prefix issue in console errors', () => {
      const result = makeResult({
        browser: 'webkit',
        consoleErrors: ['backdrop-filter requires -webkit- prefix in Safari'],
      });
      const issues = detector.detect([result]);
      const cssIssues = issues.filter((i) => i.category === 'css');
      expect(cssIssues.length).toBeGreaterThan(0);
    });

    it('detects CSS :has() selector issue for Firefox', () => {
      const result = makeResult({
        browser: 'firefox',
        consoleErrors: ['Unknown pseudo-class :has('],
        passed: false,
        error: ':has( selector not supported',
      });
      const issues = detector.detect([result]);
      const cssIssues = issues.filter((i) => i.category === 'css');
      expect(cssIssues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.severity === 'high')).toBe(true);
    });

    it('detects CSS color function issue', () => {
      const result = makeResult({
        browser: 'firefox',
        consoleErrors: ['color(display-p3 0.5 0.5 0.5) is not supported'],
      });
      const issues = detector.detect([result]);
      expect(issues.some((i) => i.category === 'css')).toBe(true);
    });
  });

  describe('detect() — JavaScript issues', () => {
    it('detects structuredClone not defined error', () => {
      const result = makeResult({
        browser: 'webkit',
        passed: false,
        error: 'ReferenceError: structuredClone is not defined',
      });
      const issues = detector.detect([result]);
      expect(issues.some((i) => i.category === 'javascript')).toBe(true);
    });

    it('detects Promise.allSettled not a function', () => {
      const result = makeResult({
        browser: 'webkit',
        passed: false,
        error: 'TypeError: Promise.allSettled is not a function',
      });
      const issues = detector.detect([result]);
      expect(issues.some((i) => i.category === 'javascript')).toBe(true);
    });

    it('detects optional chaining syntax error', () => {
      const result = makeResult({
        browser: 'firefox',
        passed: false,
        error: "SyntaxError: unexpected token '?.'",
      });
      const issues = detector.detect([result]);
      expect(issues.some((i) => i.category === 'javascript')).toBe(true);
    });

    it('detects ResizeObserver not defined', () => {
      const result = makeResult({
        browser: 'webkit',
        consoleErrors: ['ResizeObserver is not defined'],
      });
      const issues = detector.detect([result]);
      expect(issues.some((i) => i.category === 'javascript')).toBe(true);
    });

    it('detects generic TypeError on undefined property', () => {
      const result = makeResult({
        browser: 'webkit',
        passed: false,
        error: "TypeError: Cannot read property 'foo' of undefined",
      });
      const issues = detector.detect([result]);
      expect(issues.some((i) => i.category === 'javascript')).toBe(true);
    });
  });

  describe('detect() — Network/CSP issues', () => {
    it('detects CSP violation as critical', () => {
      const result = makeResult({
        browser: 'chromium',
        networkErrors: [
          'Refused to execute inline script because it violates the Content Security Policy',
        ],
      });
      const issues = detector.detect([result]);
      expect(issues.some((i) => i.severity === 'critical')).toBe(true);
    });

    it('detects CORS error', () => {
      const result = makeResult({
        browser: 'chromium',
        networkErrors: [
          'Access to XMLHttpRequest has been blocked by CORS policy: No Access-Control-Allow-Origin header',
        ],
      });
      const issues = detector.detect([result]);
      expect(issues.some((i) => i.category === 'api')).toBe(true);
    });

    it('detects mixed content error', () => {
      const result = makeResult({
        browser: 'chromium',
        networkErrors: [
          'Mixed Content: The page was loaded over HTTPS, but requested an insecure resource',
        ],
      });
      const issues = detector.detect([result]);
      expect(issues.some((i) => i.category === 'javascript')).toBe(true);
    });
  });

  describe('detect() — Inconsistency detection', () => {
    it('flags a test that passes on chromium but fails on webkit', () => {
      const pass = makeResult({ browser: 'chromium', passed: true });
      const fail = makeResult({
        browser: 'webkit',
        passed: false,
        error: 'Element not found',
      });
      const issues = detector.detect([pass, fail]);
      const inconsistency = issues.find((i) => i.browser === 'webkit' && i.category === 'rendering');
      expect(inconsistency).toBeDefined();
      expect(inconsistency!.severity).toBe('high');
    });

    it('does not flag tests that fail on all browsers', () => {
      const fail1 = makeResult({ browser: 'chromium', passed: false });
      const fail2 = makeResult({ browser: 'firefox', passed: false });
      const issues = detector.detect([fail1, fail2]);
      const inconsistencies = issues.filter((i) => i.category === 'rendering');
      expect(inconsistencies).toHaveLength(0);
    });

    it('respects detectInconsistencies: false option', () => {
      const pass = makeResult({ browser: 'chromium', passed: true });
      const fail = makeResult({ browser: 'webkit', passed: false });
      const issues = detector.detect([pass, fail], { detectInconsistencies: false });
      const rendering = issues.filter((i) => i.category === 'rendering');
      expect(rendering).toHaveLength(0);
    });
  });

  describe('detect() — General behaviour', () => {
    it('returns empty array for passing tests with no errors', () => {
      const result = makeResult({ passed: true });
      const issues = detector.detect([result]);
      expect(issues).toHaveLength(0);
    });

    it('deduplicates identical issues', () => {
      const result = makeResult({
        browser: 'webkit',
        passed: false,
        error: 'structuredClone is not defined',
        consoleErrors: ['structuredClone is not defined'],
      });
      const issues = detector.detect([result]);
      const dupeCheck = issues.filter(
        (i) =>
          i.description.includes('structuredClone') && i.browser === 'webkit',
      );
      expect(dupeCheck.length).toBe(1);
    });

    it('includes suggestedFix on every issue', () => {
      const result = makeResult({
        browser: 'webkit',
        passed: false,
        error: 'Promise.allSettled is not a function',
      });
      const issues = detector.detect([result]);
      expect(issues.every((i) => i.suggestedFix.length > 0)).toBe(true);
    });

    it('applies minimumSeverity filter', () => {
      const result = makeResult({
        browser: 'webkit',
        consoleErrors: ['scroll-behavior: smooth rendering difference'],
      });
      const allIssues = detector.detect([result], { minimumSeverity: 'low' });
      const highOnly = detector.detect([result], { minimumSeverity: 'high' });
      expect(allIssues.length).toBeGreaterThanOrEqual(highOnly.length);
    });
  });

  describe('filterByBrowser()', () => {
    it('returns only issues for the specified browser', () => {
      const webkitResult = makeResult({
        browser: 'webkit',
        passed: false,
        error: 'structuredClone is not defined',
      });
      const firefoxResult = makeResult({
        testId: 'test-2',
        browser: 'firefox',
        passed: false,
        error: 'Promise.allSettled is not a function',
      });
      const issues = detector.detect([webkitResult, firefoxResult]);
      const webkitOnly = detector.filterByBrowser(issues, 'webkit');
      expect(webkitOnly.every((i) => i.browser === 'webkit')).toBe(true);
    });
  });

  describe('filterBySeverity()', () => {
    it('includes issues at and above minimum severity', () => {
      const cspResult = makeResult({
        browser: 'chromium',
        networkErrors: ['Content Security Policy violation blocked inline script'],
      });
      const issues = detector.detect([cspResult]);
      const highAndAbove = detector.filterBySeverity(issues, 'high');
      expect(
        highAndAbove.every((i) => ['critical', 'high'].includes(i.severity)),
      ).toBe(true);
    });
  });

  describe('groupByCategory()', () => {
    it('groups issues by their category', () => {
      const webkitResult = makeResult({
        browser: 'webkit',
        passed: false,
        error: 'structuredClone is not defined',
        networkErrors: ['CORS policy: No Access-Control-Allow-Origin header'],
      });
      const issues = detector.detect([webkitResult]);
      const grouped = detector.groupByCategory(issues);
      expect(Object.keys(grouped).length).toBeGreaterThan(0);
    });
  });

  describe('groupByBrowser()', () => {
    it('groups issues by browser', () => {
      const webkitResult = makeResult({
        browser: 'webkit',
        passed: false,
        error: 'structuredClone is not defined',
      });
      const firefoxResult = makeResult({
        testId: 'test-2',
        browser: 'firefox',
        passed: false,
        error: 'Promise.allSettled is not a function',
      });
      const issues = detector.detect([webkitResult, firefoxResult]);
      const grouped = detector.groupByBrowser(issues);
      if (grouped['webkit']) {
        expect(grouped['webkit'].every((i) => i.browser === 'webkit')).toBe(true);
      }
      if (grouped['firefox']) {
        expect(grouped['firefox'].every((i) => i.browser === 'firefox')).toBe(true);
      }
    });
  });
});
