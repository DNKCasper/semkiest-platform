/**
 * @semkiest/cross-browser-agent
 *
 * Cross-browser compatibility analysis: result comparison, visual diffing,
 * issue detection, and report generation.
 */

export type {
  BrowserType,
  IssueCategory,
  IssueSeverity,
  ReportFormat,
  Viewport,
  BrowserTestResult,
  CrossBrowserComparison,
  VisualDiff,
  BrowserIssue,
  CompatibilityReport,
  ReportExportOptions,
} from './compatibility-report';

export { CompatibilityReportGenerator } from './compatibility-report';
export { BrowserDiffEngine } from './browser-diff';
export { IssueDetector } from './issue-detector';
