/**
 * Browser-specific CSS and JavaScript issue detector.
 *
 * Uses heuristic pattern matching against test errors, console output, and
 * network failures to categorise compatibility issues and surface actionable
 * fix suggestions.
 */

import type {
  BrowserType,
  BrowserTestResult,
  BrowserIssue,
  IssueCategory,
  IssueSeverity,
} from './compatibility-report';

// ---------------------------------------------------------------------------
// Heuristic rule definitions
// ---------------------------------------------------------------------------

interface IssueRule {
  /** Short unique name for this rule. */
  name: string;
  category: IssueCategory;
  severity: IssueSeverity;
  /** Browsers this rule applies to. Omit to apply to all. */
  browsers?: BrowserType[];
  /** Regex patterns tested against error/console strings. */
  patterns: RegExp[];
  /** Human-readable description template. */
  description: string;
  /** Suggested developer fix. */
  suggestedFix: string;
}

const CSS_RULES: IssueRule[] = [
  {
    name: 'webkit-prefix-missing',
    category: 'css',
    severity: 'medium',
    browsers: ['webkit'],
    patterns: [
      /-webkit-/i,
      /backdrop-filter/i,
      /mask-image/i,
      /text-stroke/i,
    ],
    description: 'CSS property requires -webkit- vendor prefix in WebKit/Safari.',
    suggestedFix:
      'Add -webkit- prefixed variants or use PostCSS autoprefixer to handle vendor prefixes automatically.',
  },
  {
    name: 'css-grid-subgrid',
    category: 'css',
    severity: 'medium',
    browsers: ['chromium', 'webkit'],
    patterns: [/subgrid/i, /grid.*subgrid/i],
    description: 'CSS Grid subgrid is not fully supported across all browsers.',
    suggestedFix:
      'Use a fallback layout (e.g., explicit grid-template-rows/columns) for browsers without subgrid support.',
  },
  {
    name: 'css-scroll-snap',
    category: 'css',
    severity: 'low',
    patterns: [/scroll-snap/i, /scroll-snap-type/i],
    description: 'CSS scroll-snap behaviour may differ across browsers.',
    suggestedFix:
      'Test scroll snap on each target browser and adjust scroll-snap-stop / scroll-padding as needed.',
  },
  {
    name: 'css-gap-flex',
    category: 'css',
    severity: 'low',
    browsers: ['webkit'],
    patterns: [/gap.*flex/i, /flexbox.*gap/i],
    description: 'Flexbox gap property may not render correctly on older WebKit versions.',
    suggestedFix:
      'Provide margin-based fallback for gap in flex containers: `& > * + * { margin-left: <value>; }`.',
  },
  {
    name: 'css-color-function',
    category: 'css',
    severity: 'medium',
    patterns: [/color\(display-p3/i, /oklch\(/i, /oklab\(/i],
    description: 'Modern CSS color functions (oklch, oklab, display-p3) have limited browser support.',
    suggestedFix:
      'Provide @supports fallback colors using sRGB hex/rgb values for unsupported browsers.',
  },
  {
    name: 'css-has-selector',
    category: 'css',
    severity: 'high',
    browsers: ['firefox'],
    patterns: [/:has\(/i],
    description: 'CSS :has() selector may not be supported in this browser version.',
    suggestedFix:
      'Use JavaScript-based class toggling as a fallback or check browser support with @supports selector(:has(*)).',
  },
];

const JS_RULES: IssueRule[] = [
  {
    name: 'js-optional-chaining',
    category: 'javascript',
    severity: 'high',
    patterns: [/SyntaxError.*optional chaining/i, /unexpected token.*\?\./i],
    description: 'Optional chaining (?.) syntax not supported in this environment.',
    suggestedFix:
      'Enable Babel/SWC transpilation or configure Browserslist targets to include optional-chaining polyfill.',
  },
  {
    name: 'js-nullish-coalescing',
    category: 'javascript',
    severity: 'high',
    patterns: [/unexpected token.*\?\?/i, /nullish coalescing/i],
    description: 'Nullish coalescing (??) operator not supported.',
    suggestedFix:
      'Add @babel/plugin-proposal-nullish-coalescing-operator or target modern browsers in your bundler config.',
  },
  {
    name: 'js-promise-allsettled',
    category: 'javascript',
    severity: 'medium',
    patterns: [/Promise\.allSettled is not a function/i, /allSettled.*undefined/i],
    description: 'Promise.allSettled is not available in this browser.',
    suggestedFix:
      'Import a Promise.allSettled polyfill (e.g., core-js) or replace with Promise.all + .catch combinators.',
  },
  {
    name: 'js-structuredclone',
    category: 'javascript',
    severity: 'medium',
    patterns: [/structuredClone is not defined/i, /structuredClone is not a function/i],
    description: 'structuredClone() is not available in this browser.',
    suggestedFix:
      'Use JSON.parse(JSON.stringify(obj)) as a fallback, or import a structuredClone polyfill.',
  },
  {
    name: 'js-indexeddb',
    category: 'javascript',
    severity: 'high',
    patterns: [/indexedDB.*not defined/i, /IDBFactory/i],
    description: 'IndexedDB API unavailable or restricted (private browsing mode).',
    suggestedFix:
      'Check for IndexedDB availability with a try/catch before use and provide a memory/sessionStorage fallback.',
  },
  {
    name: 'js-fetch-abort',
    category: 'javascript',
    severity: 'medium',
    browsers: ['webkit'],
    patterns: [/AbortController.*not defined/i, /AbortSignal/i],
    description: 'AbortController / AbortSignal may not be fully supported.',
    suggestedFix:
      'Polyfill AbortController or feature-detect before constructing an AbortController instance.',
  },
  {
    name: 'js-resize-observer',
    category: 'javascript',
    severity: 'medium',
    patterns: [/ResizeObserver.*not defined/i, /ResizeObserver.*constructor/i],
    description: 'ResizeObserver API not available.',
    suggestedFix:
      'Add a ResizeObserver polyfill (e.g., @juggle/resize-observer) for unsupported environments.',
  },
  {
    name: 'js-type-error-property',
    category: 'javascript',
    severity: 'high',
    patterns: [/TypeError.*Cannot read propert/i, /TypeError.*undefined.*propert/i],
    description: 'TypeError accessing property on undefined/null — may indicate a browser-specific API difference.',
    suggestedFix:
      'Add null/undefined guards before accessing the property. Verify the API exists in all target browsers.',
  },
  {
    name: 'js-webgl',
    category: 'javascript',
    severity: 'medium',
    patterns: [/webgl.*not supported/i, /WebGL.*context.*null/i, /getContext.*webgl/i],
    description: 'WebGL context unavailable in this browser/environment.',
    suggestedFix:
      'Check for WebGL support before initialisation and provide a 2D canvas fallback.',
  },
];

const NETWORK_RULES: IssueRule[] = [
  {
    name: 'csp-violation',
    category: 'javascript',
    severity: 'critical',
    patterns: [/Content Security Policy/i, /CSP/i, /violat.*policy/i],
    description: 'Content Security Policy violation blocked a resource in this browser.',
    suggestedFix:
      'Review CSP headers and ensure all required script/style/connect-src origins are explicitly allowed.',
  },
  {
    name: 'mixed-content',
    category: 'javascript',
    severity: 'high',
    patterns: [/mixed content/i, /blocked.*insecure/i, /https.*http:/i],
    description: 'Mixed content (HTTP resource on HTTPS page) blocked.',
    suggestedFix:
      'Migrate all resource URLs to HTTPS. Use protocol-relative URLs (//...) where feasible.',
  },
  {
    name: 'cors-error',
    category: 'api',
    severity: 'high',
    patterns: [/CORS/i, /cross-origin/i, /No.*Access-Control-Allow-Origin/i],
    description: 'CORS policy prevented a cross-origin request.',
    suggestedFix:
      'Ensure the server returns correct Access-Control-Allow-Origin headers for the requesting origin.',
  },
];

const RENDERING_RULES: IssueRule[] = [
  {
    name: 'font-rendering-diff',
    category: 'font',
    severity: 'low',
    patterns: [/font.*render/i, /subpixel/i, /antialiasing/i],
    description: 'Font rendering differences detected across browsers.',
    suggestedFix:
      'Use -webkit-font-smoothing: antialiased and moz-osx-font-smoothing: grayscale to normalise rendering.',
  },
  {
    name: 'scroll-behaviour',
    category: 'rendering',
    severity: 'low',
    browsers: ['firefox', 'webkit'],
    patterns: [/scroll-behavior/i, /smooth.*scroll/i],
    description: 'Smooth scrolling may behave differently across browsers.',
    suggestedFix:
      'Use scroll-behavior: smooth in CSS and test with reduced-motion media query support.',
  },
];

const ALL_RULES: IssueRule[] = [
  ...CSS_RULES,
  ...JS_RULES,
  ...NETWORK_RULES,
  ...RENDERING_RULES,
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let issueCounter = 0;
function nextIssueId(): string {
  issueCounter++;
  return `issue-${Date.now()}-${issueCounter}`;
}

function collectEvidenceStrings(result: BrowserTestResult): string[] {
  const evidence: string[] = [];
  if (result.error) evidence.push(result.error);
  if (result.consoleErrors) evidence.push(...result.consoleErrors);
  if (result.networkErrors) evidence.push(...result.networkErrors);
  return evidence;
}

function matchesRule(rule: IssueRule, evidenceStrings: string[]): string[] {
  const matched: string[] = [];
  for (const ev of evidenceStrings) {
    for (const pattern of rule.patterns) {
      if (pattern.test(ev)) {
        matched.push(ev);
        break; // one match per evidence string is enough
      }
    }
  }
  return matched;
}

function detectInSingleResult(result: BrowserTestResult): BrowserIssue[] {
  const evidence = collectEvidenceStrings(result);
  if (evidence.length === 0) return [];

  const issues: BrowserIssue[] = [];

  for (const rule of ALL_RULES) {
    // Skip rules scoped to specific browsers when the current browser doesn't match
    if (rule.browsers && !rule.browsers.includes(result.browser)) continue;

    const matchedEvidence = matchesRule(rule, evidence);
    if (matchedEvidence.length === 0) continue;

    issues.push({
      id: nextIssueId(),
      browser: result.browser,
      category: rule.category,
      severity: rule.severity,
      description: rule.description,
      url: result.url,
      testId: result.testId,
      suggestedFix: rule.suggestedFix,
      evidence: matchedEvidence,
    });
  }

  return issues;
}

/**
 * Detects browser-inconsistency issues: when a test fails on some browsers
 * but passes on others, synthesise a cross-browser inconsistency issue.
 */
function detectInconsistencyIssues(
  results: BrowserTestResult[],
): BrowserIssue[] {
  // Group by testId
  const byTest = new Map<string, BrowserTestResult[]>();
  for (const r of results) {
    const bucket = byTest.get(r.testId) ?? [];
    bucket.push(r);
    byTest.set(r.testId, bucket);
  }

  const issues: BrowserIssue[] = [];

  for (const testResults of byTest.values()) {
    const failing = testResults.filter((r) => !r.passed);
    const passing = testResults.filter((r) => r.passed);

    if (failing.length === 0 || passing.length === 0) continue;

    for (const failResult of failing) {
      issues.push({
        id: nextIssueId(),
        browser: failResult.browser,
        category: 'rendering',
        severity: 'high',
        description: `Test "${failResult.testName}" passes on ${passing.map((r) => r.browser).join(', ')} but fails on ${failResult.browser}.`,
        url: failResult.url,
        testId: failResult.testId,
        suggestedFix:
          'Investigate browser-specific rendering or API differences. Run the test in isolation on the failing browser with verbose logging enabled.',
        evidence: failResult.error ? [failResult.error] : [],
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Options for the issue detection pass. */
export interface DetectorOptions {
  /**
   * Whether to emit inconsistency issues when a test fails on some browsers
   * but passes on others.
   * @default true
   */
  detectInconsistencies?: boolean;
  /**
   * Minimum severity to include in the results.
   * @default 'low'
   */
  minimumSeverity?: IssueSeverity;
}

const SEVERITY_RANK: Record<IssueSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Detects browser-specific CSS and JavaScript compatibility issues from
 * aggregated test results.
 *
 * @example
 * ```ts
 * const detector = new IssueDetector();
 * const issues = detector.detect(browserTestResults);
 * const criticals = detector.filterBySeverity(issues, 'critical');
 * ```
 */
export class IssueDetector {
  /**
   * Runs all heuristic rules against the supplied test results and returns
   * de-duplicated `BrowserIssue` objects.
   */
  detect(
    results: BrowserTestResult[],
    opts: DetectorOptions = {},
  ): BrowserIssue[] {
    const detectInconsistencies = opts.detectInconsistencies ?? true;
    const minSeverity = opts.minimumSeverity ?? 'low';
    const minRank = SEVERITY_RANK[minSeverity];

    const issues: BrowserIssue[] = [];

    // Per-result heuristic scan
    for (const result of results) {
      issues.push(...detectInSingleResult(result));
    }

    // Cross-result inconsistency scan
    if (detectInconsistencies) {
      issues.push(...detectInconsistencyIssues(results));
    }

    // Deduplicate: same rule name + browser + testId
    const seen = new Set<string>();
    const deduped = issues.filter((issue) => {
      const key = `${issue.description}::${issue.browser}::${issue.testId ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Apply severity filter
    return deduped.filter(
      (issue) => SEVERITY_RANK[issue.severity] >= minRank,
    );
  }

  /**
   * Returns issues filtered to a specific browser.
   */
  filterByBrowser(issues: BrowserIssue[], browser: BrowserType): BrowserIssue[] {
    return issues.filter((i) => i.browser === browser);
  }

  /**
   * Returns issues at or above the given severity.
   */
  filterBySeverity(
    issues: BrowserIssue[],
    minimumSeverity: IssueSeverity,
  ): BrowserIssue[] {
    const minRank = SEVERITY_RANK[minimumSeverity];
    return issues.filter((i) => SEVERITY_RANK[i.severity] >= minRank);
  }

  /**
   * Returns issues grouped by category.
   */
  groupByCategory(
    issues: BrowserIssue[],
  ): Partial<Record<IssueCategory, BrowserIssue[]>> {
    const grouped: Partial<Record<IssueCategory, BrowserIssue[]>> = {};
    for (const issue of issues) {
      const existing = grouped[issue.category] ?? [];
      existing.push(issue);
      grouped[issue.category] = existing;
    }
    return grouped;
  }

  /**
   * Returns issues grouped by browser.
   */
  groupByBrowser(
    issues: BrowserIssue[],
  ): Partial<Record<BrowserType, BrowserIssue[]>> {
    const grouped: Partial<Record<BrowserType, BrowserIssue[]>> = {};
    for (const issue of issues) {
      const existing = grouped[issue.browser] ?? [];
      existing.push(issue);
      grouped[issue.browser] = existing;
    }
    return grouped;
  }
}
