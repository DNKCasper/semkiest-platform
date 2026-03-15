/**
 * PerformanceAgent — orchestrates performance auditing across multiple pages.
 *
 * Runs Lighthouse audits, collects Core Web Vitals, analyzes resources,
 * and generates recommendations across a set of URLs.
 */

import type {
  Logger,
  PerformanceAgentResult,
  PerformanceConfig,
  PagePerformanceResult,
} from './types';
import { LighthouseRunner } from './lighthouse-runner';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_ITERATIONS = 1;

// ---------------------------------------------------------------------------
// PerformanceAgent
// ---------------------------------------------------------------------------

/**
 * Orchestrates performance auditing across multiple pages.
 *
 * Usage:
 * ```ts
 * const agent = new PerformanceAgent(logger);
 * const result = await agent.audit(config);
 * ```
 */
export class PerformanceAgent {
  private readonly logger: Logger;
  private runner: LighthouseRunner;

  constructor(logger: Logger) {
    this.logger = logger;
    this.runner = new LighthouseRunner(logger);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Audits one or more pages according to the configuration.
   *
   * @param config - Performance audit configuration with URLs and thresholds.
   * @returns Aggregated performance results across all pages.
   */
  async audit(config: PerformanceConfig): Promise<PerformanceAgentResult> {
    this.logger.info(`Starting performance audit for ${config.urls.length} URL(s)`);

    const iterations = config.iterations ?? DEFAULT_ITERATIONS;
    const allResults: PagePerformanceResult[] = [];

    try {
      // Audit each URL
      for (const url of config.urls) {
        const urlResults: PagePerformanceResult[] = [];

        // Run multiple iterations if requested
        for (let i = 0; i < iterations; i++) {
          this.logger.info(`Auditing ${url} (iteration ${i + 1}/${iterations})`);
          const result = await this.runner.auditPage(url, config);
          urlResults.push(result);
        }

        // If multiple iterations, average the results
        if (iterations > 1) {
          const averaged = this.averageResults(urlResults, url);
          allResults.push(averaged);
        } else {
          allResults.push(urlResults[0]);
        }
      }

      // Aggregate results
      const summary = this.generateSummary(allResults);
      const thresholds = this.checkThresholds(allResults, config);

      const result: PerformanceAgentResult = {
        pages: allResults,
        summary,
        thresholds,
      };

      this.logger.info('Performance audit completed');
      return result;
    } finally {
      await this.runner.close();
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Averages multiple audit results for the same URL.
   */
  private averageResults(results: PagePerformanceResult[], url: string): PagePerformanceResult {
    if (results.length === 0) {
      throw new Error(`No results to average for ${url}`);
    }

    if (results.length === 1) {
      return results[0];
    }

    // Average Core Web Vitals
    const avgVitals = {
      lcp: results.reduce((sum, r) => sum + r.vitals.lcp, 0) / results.length,
      fid: results.reduce((sum, r) => sum + r.vitals.fid, 0) / results.length,
      cls: results.reduce((sum, r) => sum + r.vitals.cls, 0) / results.length,
      inp: results.reduce((sum, r) => sum + r.vitals.inp, 0) / results.length,
      ttfb: results.reduce((sum, r) => sum + r.vitals.ttfb, 0) / results.length,
      fcp: results.reduce((sum, r) => sum + r.vitals.fcp, 0) / results.length,
    };

    // Average Lighthouse scores
    const avgScores = results[0].lighthouseScores.map((score) => ({
      ...score,
      score:
        results.reduce(
          (sum, r) => sum + (r.lighthouseScores.find((s) => s.category === score.category)?.score || 0),
          0,
        ) / results.length,
    }));

    // Average resource metrics
    const avgResources = {
      totalSize: Math.round(results.reduce((sum, r) => sum + r.resources.totalSize, 0) / results.length),
      jsSize: Math.round(results.reduce((sum, r) => sum + r.resources.jsSize, 0) / results.length),
      cssSize: Math.round(results.reduce((sum, r) => sum + r.resources.cssSize, 0) / results.length),
      imageSize: Math.round(results.reduce((sum, r) => sum + r.resources.imageSize, 0) / results.length),
      fontSize: Math.round(results.reduce((sum, r) => sum + r.resources.fontSize, 0) / results.length),
      otherSize: Math.round(results.reduce((sum, r) => sum + r.resources.otherSize, 0) / results.length),
      requestCount: Math.round(results.reduce((sum, r) => sum + r.resources.requestCount, 0) / results.length),
      domNodes: Math.round(results.reduce((sum, r) => sum + r.resources.domNodes, 0) / results.length),
      thirdPartyRequests: Math.round(
        results.reduce((sum, r) => sum + r.resources.thirdPartyRequests, 0) / results.length,
      ),
    };

    // Use first result's audits and recommendations (they're similar across iterations)
    return {
      url,
      vitals: avgVitals,
      lighthouseScores: avgScores,
      resources: avgResources,
      audits: results[0].audits,
      recommendations: results[0].recommendations,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Generates aggregate summary statistics.
   */
  private generateSummary(
    results: PagePerformanceResult[],
  ): PerformanceAgentResult['summary'] {
    if (results.length === 0) {
      return {
        avgPerformanceScore: 0,
        avgLcp: 0,
        avgCls: 0,
        avgFcp: 0,
        avgTtfb: 0,
        totalRecommendations: 0,
        criticalIssues: 0,
      };
    }

    const avgPerformanceScore =
      results.reduce((sum, r) => {
        const perfScore = r.lighthouseScores.find((s) => s.category === 'performance')?.score || 0;
        return sum + perfScore;
      }, 0) / results.length;

    const avgLcp = results.reduce((sum, r) => sum + r.vitals.lcp, 0) / results.length;
    const avgCls = results.reduce((sum, r) => sum + r.vitals.cls, 0) / results.length;
    const avgFcp = results.reduce((sum, r) => sum + r.vitals.fcp, 0) / results.length;
    const avgTtfb = results.reduce((sum, r) => sum + r.vitals.ttfb, 0) / results.length;

    const totalRecommendations = results.reduce((sum, r) => sum + r.recommendations.length, 0);
    const criticalIssues = results.reduce(
      (sum, r) => sum + r.recommendations.filter((rec) => rec.severity === 'critical').length,
      0,
    );

    return {
      avgPerformanceScore: Math.round(avgPerformanceScore),
      avgLcp: Math.round(avgLcp),
      avgCls: Math.round(avgCls * 1000) / 1000,
      avgFcp: Math.round(avgFcp),
      avgTtfb: Math.round(avgTtfb),
      totalRecommendations,
      criticalIssues,
    };
  }

  /**
   * Validates performance results against configured thresholds.
   */
  private checkThresholds(
    results: PagePerformanceResult[],
    config: PerformanceConfig,
  ): PerformanceAgentResult['thresholds'] {
    const violations: string[] = [];
    const thresholds = config.thresholds || {};

    // Check performance score
    if (thresholds.performance !== undefined) {
      for (const result of results) {
        const perfScore = result.lighthouseScores.find((s) => s.category === 'performance')?.score ?? 0;
        if (perfScore < thresholds.performance) {
          violations.push(
            `Performance score ${perfScore} < threshold ${thresholds.performance} for ${result.url}`,
          );
        }
      }
    }

    // Check LCP
    if (thresholds.lcp !== undefined) {
      for (const result of results) {
        if (result.vitals.lcp > thresholds.lcp) {
          violations.push(`LCP ${result.vitals.lcp}ms > threshold ${thresholds.lcp}ms for ${result.url}`);
        }
      }
    }

    // Check CLS
    if (thresholds.cls !== undefined) {
      for (const result of results) {
        if (result.vitals.cls > thresholds.cls) {
          violations.push(`CLS ${result.vitals.cls} > threshold ${thresholds.cls} for ${result.url}`);
        }
      }
    }

    // Check FCP
    if (thresholds.fcp !== undefined) {
      for (const result of results) {
        if (result.vitals.fcp > thresholds.fcp) {
          violations.push(`FCP ${result.vitals.fcp}ms > threshold ${thresholds.fcp}ms for ${result.url}`);
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }
}
