/**
 * @semkiest/accessibility-agent
 *
 * Public API for the SemkiEst Accessibility Agent package.
 * Provides WCAG 2.1 AA auditing via axe-core + Playwright.
 */

// Base agent framework
export {
  BaseAgent,
  type AgentConfig,
  type AgentLogger,
  type AgentResult,
} from './base-agent';

// Playwright + axe-core runner
export {
  AxeRunner,
  type AxeRunnerConfig,
  type PageScanResult,
  type AxeViolation,
  type AffectedNode,
  type ImpactLevel,
  type WcagTag,
} from './axe-runner';

// Violation categorisation and reporting
export {
  ViolationCategorizer,
  type CategorizedPageResult,
  type CategorizedViolation,
  type CategorizationReport,
  type ComplianceStatus,
  type RemediationGuidance,
  type SeverityBreakdown,
} from './violation-categorizer';

// Main accessibility agent
export {
  AccessibilityAgent,
  type AccessibilityAgentConfig,
  type AccessibilityReport,
  type AccessibilitySummary,
  type AccessibilityTrendEntry,
} from './accessibility-agent';
