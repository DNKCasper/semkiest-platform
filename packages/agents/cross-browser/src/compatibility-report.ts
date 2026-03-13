/**
 * Cross-browser compatibility report generator.
 *
 * Aggregates test results across browsers, incorporates visual diffs and
 * detected issues, and exports structured reports in JSON, Markdown, or HTML.
 */

// ---------------------------------------------------------------------------
// Shared domain types
// ---------------------------------------------------------------------------

/** Playwright-supported browser engines. */
export type BrowserType = 'chromium' | 'firefox' | 'webkit';

/** Broad category of a detected compatibility issue. */
export type IssueCategory =
  | 'css'
  | 'javascript'
  | 'layout'
  | 'font'
  | 'api'
  | 'rendering'
  | 'feature-detection';

/** Triage severity of a detected issue. */
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

/** Supported export formats for a compatibility report. */
export type ReportFormat = 'json' | 'markdown' | 'html';

/** Browser viewport dimensions. */
export interface Viewport {
  width: number;
  height: number;
}

/** Single test-run result captured in one browser. */
export interface BrowserTestResult {
  /** Unique identifier for the test case. */
  testId: string;
  /** Human-readable test name. */
  testName: string;
  /** Browser used for this run. */
  browser: BrowserType;
  /** Whether the test passed. */
  passed: boolean;
  /** Duration in milliseconds. */
  duration: number;
  /** URL under test. */
  url: string;
  /** Error message if the test failed. */
  error?: string | undefined;
  /** Raw PNG screenshot bytes, if captured. */
  screenshot?: Buffer | undefined;
  /** Console error strings collected during the run. */
  consoleErrors?: string[] | undefined;
  /** Network-level error strings collected during the run. */
  networkErrors?: string[] | undefined;
  /** Viewport used for this run. */
  viewport?: Viewport | undefined;
}

/** Aggregated comparison of one test across all browsers. */
export interface CrossBrowserComparison {
  testId: string;
  testName: string;
  url: string;
  /** Per-browser results keyed by browser type. */
  results: Partial<Record<BrowserType, BrowserTestResult>>;
  /** True when at least one browser passes and at least one fails. */
  inconsistent: boolean;
  failingBrowsers: BrowserType[];
  passingBrowsers: BrowserType[];
}

/** Pixel-level visual diff between screenshots from two browsers. */
export interface VisualDiff {
  browser1: BrowserType;
  browser2: BrowserType;
  testId: string;
  url: string;
  /** Number of differing pixels. */
  diffPixels: number;
  /** Fraction of pixels that differ (0–1). */
  diffPercentage: number;
  totalPixels: number;
  hasDifferences: boolean;
  /** Threshold used for this comparison (0–1). */
  threshold: number;
}

/** A concrete browser-specific compatibility issue. */
export interface BrowserIssue {
  id: string;
  browser: BrowserType;
  category: IssueCategory;
  severity: IssueSeverity;
  description: string;
  url: string;
  testId?: string | undefined;
  /** Actionable fix recommendation. */
  suggestedFix: string;
  /** Supporting evidence (error messages, selectors, etc.). */
  evidence: string[];
}

/** Full cross-browser compatibility report. */
export interface CompatibilityReport {
  id: string;
  projectName: string;
  generatedAt: Date;
  summary: {
    totalTests: number;
    browsers: BrowserType[];
    passRateByBrowser: Partial<Record<BrowserType, number>>;
    inconsistentTests: number;
    totalIssues: number;
    issuesBySeverity: Record<IssueSeverity, number>;
    visualDiffsDetected: number;
    /** 0–100 score: 100 = all tests pass on all browsers, no issues. */
    overallCompatibilityScore: number;
  };
  testComparisons: CrossBrowserComparison[];
  visualDiffs: VisualDiff[];
  issues: BrowserIssue[];
  recommendations: string[];
}

/** Options controlling report export. */
export interface ReportExportOptions {
  format: ReportFormat;
  /** Include full visual-diff details in the output. */
  includeVisualDiffs?: boolean;
  /** Include raw test results per browser. */
  includeTestDetails?: boolean;
  /** Title shown in HTML/Markdown reports. */
  reportTitle?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `report-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function groupResultsByTest(
  results: BrowserTestResult[],
): Map<string, BrowserTestResult[]> {
  const map = new Map<string, BrowserTestResult[]>();
  for (const result of results) {
    const existing = map.get(result.testId) ?? [];
    existing.push(result);
    map.set(result.testId, existing);
  }
  return map;
}

function buildComparison(
  testId: string,
  testResults: BrowserTestResult[],
): CrossBrowserComparison {
  const byBrowser: Partial<Record<BrowserType, BrowserTestResult>> = {};
  for (const r of testResults) {
    byBrowser[r.browser] = r;
  }

  const failing = testResults.filter((r) => !r.passed).map((r) => r.browser);
  const passing = testResults.filter((r) => r.passed).map((r) => r.browser);

  return {
    testId,
    testName: testResults[0]?.testName ?? testId,
    url: testResults[0]?.url ?? '',
    results: byBrowser,
    inconsistent: failing.length > 0 && passing.length > 0,
    failingBrowsers: failing,
    passingBrowsers: passing,
  };
}

function computePassRate(
  comparisons: CrossBrowserComparison[],
  browser: BrowserType,
): number {
  const relevant = comparisons.filter((c) => browser in c.results);
  if (relevant.length === 0) return 100;
  const passing = relevant.filter((c) => c.passingBrowsers.includes(browser));
  return Math.round((passing.length / relevant.length) * 100);
}

function computeCompatibilityScore(
  comparisons: CrossBrowserComparison[],
  issues: BrowserIssue[],
): number {
  if (comparisons.length === 0) return 100;

  const inconsistentPenalty =
    (comparisons.filter((c) => c.inconsistent).length / comparisons.length) *
    50;

  const issuePenalty = Math.min(
    50,
    issues.reduce((acc, issue) => {
      const weights: Record<IssueSeverity, number> = {
        critical: 10,
        high: 5,
        medium: 2,
        low: 1,
      };
      return acc + weights[issue.severity];
    }, 0),
  );

  return Math.max(0, Math.round(100 - inconsistentPenalty - issuePenalty));
}

function buildRecommendations(
  comparisons: CrossBrowserComparison[],
  issues: BrowserIssue[],
): string[] {
  const recs: string[] = [];

  const inconsistent = comparisons.filter((c) => c.inconsistent);
  if (inconsistent.length > 0) {
    recs.push(
      `Investigate ${inconsistent.length} test(s) with inconsistent results across browsers.`,
    );
  }

  const criticals = issues.filter((i) => i.severity === 'critical');
  if (criticals.length > 0) {
    recs.push(
      `Address ${criticals.length} critical issue(s) immediately — these may block users on specific browsers.`,
    );
  }

  const cssIssues = issues.filter((i) => i.category === 'css');
  if (cssIssues.length > 0) {
    recs.push(
      `Review CSS compatibility: ${cssIssues.length} issue(s) detected. Consider adding vendor prefixes or PostCSS autoprefixer.`,
    );
  }

  const jsIssues = issues.filter((i) => i.category === 'javascript');
  if (jsIssues.length > 0) {
    recs.push(
      `Review JavaScript compatibility: ${jsIssues.length} issue(s) detected. Consider polyfills or feature detection guards.`,
    );
  }

  const firefoxIssues = issues.filter((i) => i.browser === 'firefox');
  if (firefoxIssues.length > 0) {
    recs.push(
      `Firefox has ${firefoxIssues.length} specific issue(s). Test manually in Firefox to verify rendering fidelity.`,
    );
  }

  const webkitIssues = issues.filter((i) => i.browser === 'webkit');
  if (webkitIssues.length > 0) {
    recs.push(
      `WebKit/Safari has ${webkitIssues.length} specific issue(s). Ensure iOS/macOS Safari is included in QA sign-off.`,
    );
  }

  if (recs.length === 0) {
    recs.push('No significant cross-browser issues detected. Keep up the good work!');
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

function toJson(
  report: CompatibilityReport,
  opts: ReportExportOptions,
): string {
  const output: Partial<CompatibilityReport> & {
    exportedAt: string;
    format: ReportFormat;
  } = {
    id: report.id,
    projectName: report.projectName,
    generatedAt: report.generatedAt,
    summary: report.summary,
    issues: report.issues,
    recommendations: report.recommendations,
    exportedAt: new Date().toISOString(),
    format: 'json',
  };

  if (opts.includeVisualDiffs) {
    output.visualDiffs = report.visualDiffs;
  }
  if (opts.includeTestDetails) {
    output.testComparisons = report.testComparisons;
  }

  return JSON.stringify(output, null, 2);
}

function toMarkdown(
  report: CompatibilityReport,
  opts: ReportExportOptions,
): string {
  const title = opts.reportTitle ?? `${report.projectName} — Cross-Browser Compatibility Report`;
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`**Generated:** ${report.generatedAt.toISOString()}`);
  lines.push(`**Report ID:** \`${report.id}\``);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Tests | ${report.summary.totalTests} |`);
  lines.push(`| Browsers | ${report.summary.browsers.join(', ')} |`);
  lines.push(`| Inconsistent Tests | ${report.summary.inconsistentTests} |`);
  lines.push(`| Total Issues | ${report.summary.totalIssues} |`);
  lines.push(`| Visual Diffs Detected | ${report.summary.visualDiffsDetected} |`);
  lines.push(`| Compatibility Score | **${report.summary.overallCompatibilityScore}/100** |`);
  lines.push('');

  // Pass rates
  lines.push('### Pass Rate by Browser');
  lines.push('');
  lines.push(`| Browser | Pass Rate |`);
  lines.push(`|---------|-----------|`);
  for (const browser of report.summary.browsers) {
    const rate = report.summary.passRateByBrowser[browser] ?? 0;
    lines.push(`| ${browser} | ${rate}% |`);
  }
  lines.push('');

  // Issues by severity
  lines.push('### Issues by Severity');
  lines.push('');
  lines.push(`| Severity | Count |`);
  lines.push(`|----------|-------|`);
  const severities: IssueSeverity[] = ['critical', 'high', 'medium', 'low'];
  for (const s of severities) {
    lines.push(`| ${s} | ${report.summary.issuesBySeverity[s]} |`);
  }
  lines.push('');

  // Recommendations
  lines.push('## Recommendations');
  lines.push('');
  for (const rec of report.recommendations) {
    lines.push(`- ${rec}`);
  }
  lines.push('');

  // Issues detail
  if (report.issues.length > 0) {
    lines.push('## Detected Issues');
    lines.push('');
    for (const issue of report.issues) {
      lines.push(`### [${issue.severity.toUpperCase()}] ${issue.description}`);
      lines.push('');
      lines.push(`- **Browser:** ${issue.browser}`);
      lines.push(`- **Category:** ${issue.category}`);
      lines.push(`- **URL:** ${issue.url}`);
      if (issue.testId) lines.push(`- **Test:** \`${issue.testId}\``);
      lines.push(`- **Suggested Fix:** ${issue.suggestedFix}`);
      if (issue.evidence.length > 0) {
        lines.push('- **Evidence:**');
        for (const ev of issue.evidence) {
          lines.push(`  - \`${ev}\``);
        }
      }
      lines.push('');
    }
  }

  // Test comparisons
  if (opts.includeTestDetails) {
    lines.push('## Test Comparisons');
    lines.push('');
    for (const comp of report.testComparisons) {
      const status = comp.inconsistent ? '⚠️ Inconsistent' : '✅ Consistent';
      lines.push(`### ${comp.testName} — ${status}`);
      lines.push('');
      lines.push(`- **URL:** ${comp.url}`);
      lines.push(`- **Passing:** ${comp.passingBrowsers.join(', ') || 'none'}`);
      lines.push(`- **Failing:** ${comp.failingBrowsers.join(', ') || 'none'}`);
      lines.push('');
    }
  }

  // Visual diffs
  if (opts.includeVisualDiffs && report.visualDiffs.length > 0) {
    lines.push('## Visual Diffs');
    lines.push('');
    for (const diff of report.visualDiffs) {
      if (!diff.hasDifferences) continue;
      lines.push(
        `### ${diff.browser1} vs ${diff.browser2} — \`${diff.testId}\``,
      );
      lines.push('');
      lines.push(`- **Diff:** ${diff.diffPercentage.toFixed(2)}% (${diff.diffPixels} pixels)`);
      lines.push(`- **URL:** ${diff.url}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function toHtml(report: CompatibilityReport, opts: ReportExportOptions): string {
  const title = opts.reportTitle ?? `${report.projectName} — Cross-Browser Compatibility Report`;
  const scoreColor =
    report.summary.overallCompatibilityScore >= 80
      ? '#22c55e'
      : report.summary.overallCompatibilityScore >= 60
        ? '#f59e0b'
        : '#ef4444';

  const severityColor: Record<IssueSeverity, string> = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#f59e0b',
    low: '#6b7280',
  };

  const issueRows = report.issues
    .map(
      (issue) =>
        `<tr>
          <td><span style="color:${severityColor[issue.severity]};font-weight:bold">${issue.severity.toUpperCase()}</span></td>
          <td>${issue.browser}</td>
          <td>${issue.category}</td>
          <td>${escapeHtml(issue.description)}</td>
          <td>${escapeHtml(issue.suggestedFix)}</td>
        </tr>`,
    )
    .join('\n');

  const browserRows = report.summary.browsers
    .map((b) => {
      const rate = report.summary.passRateByBrowser[b] ?? 0;
      const color = rate >= 80 ? '#22c55e' : rate >= 60 ? '#f59e0b' : '#ef4444';
      return `<tr><td>${b}</td><td style="color:${color};font-weight:bold">${rate}%</td></tr>`;
    })
    .join('\n');

  const recItems = report.recommendations
    .map((r) => `<li>${escapeHtml(r)}</li>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 2rem; color: #1f2937; background: #f9fafb; }
    h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.25rem; margin-top: 2rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; }
    .meta { color: #6b7280; font-size: 0.875rem; margin-bottom: 2rem; }
    .score { display: inline-block; font-size: 2.5rem; font-weight: 700; color: ${scoreColor}; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th { background: #f3f4f6; text-align: left; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
    td { padding: 0.5rem 0.75rem; border-top: 1px solid #e5e7eb; font-size: 0.875rem; vertical-align: top; }
    ul { margin: 0.5rem 0; padding-left: 1.5rem; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1.5rem; margin-bottom: 1.5rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .stat { background: #fff; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1rem; text-align: center; }
    .stat-label { font-size: 0.75rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-value { font-size: 1.5rem; font-weight: 700; margin-top: 0.25rem; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">Generated: ${report.generatedAt.toISOString()} &nbsp;|&nbsp; ID: ${report.id}</p>

  <div class="grid">
    <div class="stat">
      <div class="stat-label">Compatibility Score</div>
      <div class="stat-value" style="color:${scoreColor}">${report.summary.overallCompatibilityScore}/100</div>
    </div>
    <div class="stat">
      <div class="stat-label">Total Tests</div>
      <div class="stat-value">${report.summary.totalTests}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Inconsistent Tests</div>
      <div class="stat-value">${report.summary.inconsistentTests}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Total Issues</div>
      <div class="stat-value">${report.summary.totalIssues}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Visual Diffs</div>
      <div class="stat-value">${report.summary.visualDiffsDetected}</div>
    </div>
  </div>

  <h2>Pass Rate by Browser</h2>
  <div class="card">
    <table>
      <thead><tr><th>Browser</th><th>Pass Rate</th></tr></thead>
      <tbody>${browserRows}</tbody>
    </table>
  </div>

  <h2>Recommendations</h2>
  <div class="card"><ul>${recItems}</ul></div>

  ${
    report.issues.length > 0
      ? `<h2>Detected Issues (${report.issues.length})</h2>
  <div class="card">
    <table>
      <thead><tr><th>Severity</th><th>Browser</th><th>Category</th><th>Description</th><th>Suggested Fix</th></tr></thead>
      <tbody>${issueRows}</tbody>
    </table>
  </div>`
      : ''
  }
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates cross-browser compatibility reports from aggregated test data.
 *
 * @example
 * ```ts
 * const generator = new CompatibilityReportGenerator('My App');
 * const report = generator.generate(testResults, visualDiffs, issues);
 * const markdown = generator.export(report, { format: 'markdown', includeTestDetails: true });
 * ```
 */
export class CompatibilityReportGenerator {
  constructor(private readonly projectName: string) {}

  /**
   * Builds a `CompatibilityReport` from raw browser test results, visual
   * diffs, and pre-detected issues.
   */
  generate(
    results: BrowserTestResult[],
    visualDiffs: VisualDiff[],
    issues: BrowserIssue[],
  ): CompatibilityReport {
    const grouped = groupResultsByTest(results);
    const comparisons: CrossBrowserComparison[] = [];
    for (const [testId, testResults] of grouped) {
      comparisons.push(buildComparison(testId, testResults));
    }

    const browsers = [...new Set(results.map((r) => r.browser))];
    const passRateByBrowser: Partial<Record<BrowserType, number>> = {};
    for (const b of browsers) {
      passRateByBrowser[b] = computePassRate(comparisons, b);
    }

    const issuesBySeverity: Record<IssueSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    for (const issue of issues) {
      issuesBySeverity[issue.severity]++;
    }

    return {
      id: generateId(),
      projectName: this.projectName,
      generatedAt: new Date(),
      summary: {
        totalTests: comparisons.length,
        browsers,
        passRateByBrowser,
        inconsistentTests: comparisons.filter((c) => c.inconsistent).length,
        totalIssues: issues.length,
        issuesBySeverity,
        visualDiffsDetected: visualDiffs.filter((d) => d.hasDifferences).length,
        overallCompatibilityScore: computeCompatibilityScore(comparisons, issues),
      },
      testComparisons: comparisons,
      visualDiffs,
      issues,
      recommendations: buildRecommendations(comparisons, issues),
    };
  }

  /**
   * Serializes a `CompatibilityReport` to the requested format string.
   *
   * @param report - The report produced by `generate()`.
   * @param opts   - Export options including target format.
   * @returns The report as a UTF-8 string in the requested format.
   */
  export(report: CompatibilityReport, opts: ReportExportOptions): string {
    switch (opts.format) {
      case 'json':
        return toJson(report, opts);
      case 'markdown':
        return toMarkdown(report, opts);
      case 'html':
        return toHtml(report, opts);
    }
  }
}
