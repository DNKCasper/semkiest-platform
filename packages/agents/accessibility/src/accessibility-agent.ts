/**
 * AccessibilityAgent - Orchestrates WCAG 2.1 AA auditing across all discovered
 * application pages by combining AxeRunner (browser + axe-core) and
 * ViolationCategorizer (severity tagging + remediation guidance).
 *
 * Extends BaseAgent so it participates in the shared agent lifecycle and
 * produces a standardised AgentResult envelope.
 */

import { BaseAgent, type AgentConfig } from './base-agent';
import { AxeRunner, type AxeRunnerConfig, type PageScanResult } from './axe-runner';
import {
  ViolationCategorizer,
  type CategorizationReport,
  type CategorizedPageResult,
} from './violation-categorizer';

// ─── Public types ────────────────────────────────────────────────────────────

/** A point-in-time snapshot of an overall accessibility score. */
export interface AccessibilityTrendEntry {
  /** ISO-8601 timestamp of the run. */
  timestamp: string;
  /** Overall accessibility score for this run (0–100). */
  overallScore: number;
  /** Total violation count across all pages. */
  totalViolations: number;
  /** Number of fully-compliant pages. */
  compliantPages: number;
}

/** Configuration for {@link AccessibilityAgent}. */
export interface AccessibilityAgentConfig extends AgentConfig {
  /**
   * URLs to audit. The agent will scan every URL in this list.
   * At least one URL must be provided.
   */
  targetUrls: string[];

  /**
   * axe-core / Playwright runner options.
   * @see AxeRunnerConfig
   */
  runnerConfig?: AxeRunnerConfig;

  /**
   * Optional historical trend entries from previous runs.
   * The agent appends a new entry after each successful run.
   */
  previousTrends?: AccessibilityTrendEntry[];
}

/** Full output produced by a single AccessibilityAgent run. */
export interface AccessibilityReport {
  /** Agent name and version metadata. */
  agentName: string;
  agentVersion: string;
  /** ISO-8601 timestamp when the report was generated. */
  generatedAt: string;
  /** Categorisation results across all scanned pages. */
  categorizationReport: CategorizationReport;
  /** Raw scan results per page (useful for debugging). */
  rawScanResults: PageScanResult[];
  /** Pages sorted by accessibility score, lowest first (for triage). */
  pagesByPriority: CategorizedPageResult[];
  /** Historical trend entries including the current run. */
  trends: AccessibilityTrendEntry[];
  /**
   * Quick-access summary for dashboards and CI checks.
   */
  summary: AccessibilitySummary;
}

/** Compact summary of an accessibility agent run. */
export interface AccessibilitySummary {
  /** Total pages audited. */
  totalPages: number;
  /** Pages with zero violations. */
  compliantPages: number;
  /** Overall score (0–100). */
  overallScore: number;
  /** Whether every page meets WCAG 2.1 AA (no critical/serious violations). */
  meetsWcag21AA: boolean;
  /** Aggregated violation counts per severity level. */
  totalViolations: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
}

// ─── AccessibilityAgent ───────────────────────────────────────────────────────

/**
 * Runs WCAG 2.1 AA audits across all provided URLs, categorises violations,
 * and tracks score trends over time.
 *
 * Usage:
 * ```typescript
 * const agent = new AccessibilityAgent({
 *   name: 'Accessibility Agent',
 *   version: '1.0.0',
 *   targetUrls: ['https://example.com', 'https://example.com/about'],
 * });
 * const result = await agent.run();
 * console.log(result.data?.summary);
 * ```
 */
export class AccessibilityAgent extends BaseAgent<
  AccessibilityAgentConfig,
  AccessibilityReport
> {
  private readonly runner: AxeRunner;
  private readonly categorizer: ViolationCategorizer;
  private rawScanResults: PageScanResult[] = [];

  constructor(config: AccessibilityAgentConfig) {
    super(config);
    this.runner = new AxeRunner(config.runnerConfig ?? {});
    this.categorizer = new ViolationCategorizer();
  }

  // ── BaseAgent lifecycle ────────────────────────────────────────────────────

  protected async initialize(): Promise<void> {
    this.logger.info(
      `Initialising accessibility audit for ${this.config.targetUrls.length} URL(s)`,
    );

    if (this.config.targetUrls.length === 0) {
      throw new Error(
        'AccessibilityAgent requires at least one URL in targetUrls.',
      );
    }

    await this.runner.launch();
    this.logger.info('Playwright browser launched');
  }

  protected async execute(): Promise<AccessibilityReport> {
    this.logger.info(
      `Scanning ${this.config.targetUrls.length} page(s) with axe-core…`,
    );

    this.rawScanResults = await this.runner.scanPages(this.config.targetUrls);

    this.logger.info(
      `Scan complete. Categorising violations for ${this.rawScanResults.length} page(s)…`,
    );

    const categorizationReport = this.categorizer.categorizeAll(
      this.rawScanResults,
    );

    const pagesByPriority = [...categorizationReport.pages].sort(
      (a, b) => a.accessibilityScore - b.accessibilityScore,
    );

    const trends = this.buildTrends(categorizationReport);
    const summary = this.buildSummary(categorizationReport);

    const report: AccessibilityReport = {
      agentName: this.config.name,
      agentVersion: this.config.version,
      generatedAt: new Date().toISOString(),
      categorizationReport,
      rawScanResults: this.rawScanResults,
      pagesByPriority,
      trends,
      summary,
    };

    this.logSummary(summary);

    return report;
  }

  protected async cleanup(): Promise<void> {
    await this.runner.close();
    this.logger.info('Playwright browser closed');
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Append a trend entry for the current run to any existing historical data.
   */
  private buildTrends(report: CategorizationReport): AccessibilityTrendEntry[] {
    const totalViolations = report.pages.reduce(
      (sum, p) => sum + p.categorizedViolations.length,
      0,
    );

    const currentEntry: AccessibilityTrendEntry = {
      timestamp: report.categorizedAt,
      overallScore: report.overallScore,
      totalViolations,
      compliantPages: report.compliantPages,
    };

    return [...(this.config.previousTrends ?? []), currentEntry];
  }

  /**
   * Build a compact summary object from the categorisation report.
   */
  private buildSummary(report: CategorizationReport): AccessibilitySummary {
    const meetsWcag21AA =
      report.totalSeverityBreakdown.critical === 0 &&
      report.totalSeverityBreakdown.serious === 0;

    return {
      totalPages: report.totalPages,
      compliantPages: report.compliantPages,
      overallScore: report.overallScore,
      meetsWcag21AA,
      totalViolations: { ...report.totalSeverityBreakdown },
    };
  }

  private logSummary(summary: AccessibilitySummary): void {
    this.logger.info(
      `Summary — score: ${summary.overallScore}/100 | ` +
        `compliant pages: ${summary.compliantPages}/${summary.totalPages} | ` +
        `WCAG 2.1 AA: ${summary.meetsWcag21AA ? 'PASS' : 'FAIL'}`,
    );
    if (!summary.meetsWcag21AA) {
      this.logger.warn(
        `Violations — critical: ${summary.totalViolations.critical}, ` +
          `serious: ${summary.totalViolations.serious}, ` +
          `moderate: ${summary.totalViolations.moderate}, ` +
          `minor: ${summary.totalViolations.minor}`,
      );
    }
  }
}
