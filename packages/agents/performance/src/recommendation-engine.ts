/**
 * RecommendationEngine — generates actionable performance recommendations.
 *
 * Analyzes Core Web Vitals, resources, and audit results to produce
 * prioritized recommendations for improvement.
 */

import type {
  Logger,
  PagePerformanceResult,
  PerformanceConfig,
  Recommendation,
  CoreWebVitals,
  ResourceMetrics,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLDS = {
  lcp: 2500,
  cls: 0.1,
  fcp: 1800,
  ttfb: 800,
  performance: 50,
};

// ---------------------------------------------------------------------------
// RecommendationEngine
// ---------------------------------------------------------------------------

/**
 * Generates performance recommendations based on audit results.
 *
 * Usage:
 * ```ts
 * const engine = new RecommendationEngine(logger);
 * const recommendations = engine.generate(result, config);
 * ```
 */
export class RecommendationEngine {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Generates actionable recommendations from a performance audit result.
   *
   * @param result - The complete page performance result.
   * @param config - Performance configuration with thresholds.
   * @returns Array of prioritized recommendations.
   */
  generate(result: PagePerformanceResult, config: PerformanceConfig): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Check Core Web Vitals thresholds
    const thresholds = config.thresholds || DEFAULT_THRESHOLDS;
    recommendations.push(...this.checkCoreWebVitals(result.vitals, thresholds));

    // Check resource metrics
    recommendations.push(...this.checkResources(result.resources));

    // Check Lighthouse scores
    recommendations.push(...this.checkLighthouseScores(result.lighthouseScores));

    // Sort by severity (critical > warning > info)
    recommendations.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    this.logger.debug(`Generated ${recommendations.length} recommendations`);
    return recommendations;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Checks Core Web Vitals against thresholds.
   */
  private checkCoreWebVitals(
    vitals: CoreWebVitals,
    thresholds: Partial<typeof DEFAULT_THRESHOLDS>,
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    const lcpThreshold = thresholds.lcp ?? DEFAULT_THRESHOLDS.lcp;
    const clsThreshold = thresholds.cls ?? DEFAULT_THRESHOLDS.cls;
    const fcpThreshold = thresholds.fcp ?? DEFAULT_THRESHOLDS.fcp;
    const ttfbThreshold = thresholds.ttfb ?? DEFAULT_THRESHOLDS.ttfb;

    // LCP check
    if (vitals.lcp > lcpThreshold) {
      const severity = vitals.lcp > 4000 ? 'critical' : 'warning';
      recommendations.push({
        severity,
        title: 'Optimize Largest Contentful Paint (LCP)',
        description: `LCP is ${vitals.lcp.toFixed(0)}ms, exceeding the threshold of ${lcpThreshold}ms. This metric measures when the largest visible element is rendered.`,
        impact: 'Poor LCP negatively affects perceived performance and user experience.',
        category: 'core-web-vitals',
      });
    }

    // CLS check
    if (vitals.cls > clsThreshold) {
      const severity = vitals.cls > 0.25 ? 'critical' : 'warning';
      recommendations.push({
        severity,
        title: 'Reduce Cumulative Layout Shift (CLS)',
        description: `CLS is ${vitals.cls.toFixed(3)}, exceeding the threshold of ${clsThreshold}. Unexpected layout shifts occur during page load.`,
        impact: 'High CLS causes visual instability and negatively impacts user experience.',
        category: 'core-web-vitals',
      });
    }

    // FCP check
    if (vitals.fcp > fcpThreshold) {
      const severity = vitals.fcp > 3000 ? 'warning' : 'info';
      recommendations.push({
        severity,
        title: 'Improve First Contentful Paint (FCP)',
        description: `FCP is ${vitals.fcp.toFixed(0)}ms, exceeding the threshold of ${fcpThreshold}ms. This is the time to render the first visible element.`,
        impact: 'Slow FCP makes the page feel slow to users even if later content loads quickly.',
        category: 'core-web-vitals',
      });
    }

    // TTFB check
    if (vitals.ttfb > ttfbThreshold) {
      recommendations.push({
        severity: 'info',
        title: 'Reduce Time to First Byte (TTFB)',
        description: `TTFB is ${vitals.ttfb.toFixed(0)}ms, exceeding the threshold of ${ttfbThreshold}ms. Consider optimizing server response times or using a CDN.`,
        impact: 'High TTFB delays the start of page rendering and all subsequent metrics.',
        category: 'core-web-vitals',
      });
    }

    // INP check
    if (vitals.inp > 200) {
      recommendations.push({
        severity: vitals.inp > 500 ? 'warning' : 'info',
        title: 'Improve Interaction to Next Paint (INP)',
        description: `INP is ${vitals.inp.toFixed(0)}ms. Consider optimizing JavaScript execution and reducing long tasks.`,
        impact: 'High INP causes delays in user input response, degrading interactivity.',
        category: 'core-web-vitals',
      });
    }

    return recommendations;
  }

  /**
   * Checks resource metrics for optimization opportunities.
   */
  private checkResources(resources: ResourceMetrics): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Check JavaScript size
    if (resources.jsSize > 200_000) {
      recommendations.push({
        severity: 'warning',
        title: 'Reduce JavaScript Bundle Size',
        description: `JavaScript resources total ${(resources.jsSize / 1024).toFixed(0)}KB. Large JS bundles slow down parsing, compilation, and execution.`,
        impact: 'Reducing JS size improves FCP, LCP, and INP metrics.',
        category: 'resources',
      });
    }

    // Check CSS size
    if (resources.cssSize > 100_000) {
      recommendations.push({
        severity: 'info',
        title: 'Reduce CSS Bundle Size',
        description: `CSS resources total ${(resources.cssSize / 1024).toFixed(0)}KB. Consider splitting CSS or removing unused styles.`,
        impact: 'Smaller CSS improves FCP and reduces rendering time.',
        category: 'resources',
      });
    }

    // Check image size
    if (resources.imageSize > 500_000) {
      recommendations.push({
        severity: 'warning',
        title: 'Optimize Image Sizes',
        description: `Images total ${(resources.imageSize / 1024).toFixed(0)}KB. Consider using modern formats (WebP), compression, and responsive images.`,
        impact: 'Image optimization significantly reduces page size and improves Core Web Vitals.',
        category: 'resources',
      });
    }

    // Check total request count
    if (resources.requestCount > 100) {
      recommendations.push({
        severity: 'info',
        title: 'Reduce HTTP Request Count',
        description: `Page makes ${resources.requestCount} HTTP requests. Consider bundling, code splitting, or removing unnecessary requests.`,
        impact: 'Fewer requests reduce overhead and improve page load time.',
        category: 'resources',
      });
    }

    // Check third-party requests
    if (resources.thirdPartyRequests > 20) {
      recommendations.push({
        severity: 'info',
        title: 'Audit Third-Party Scripts',
        description: `${resources.thirdPartyRequests} requests are to third-party services. Review if all are necessary and consider lazy-loading or self-hosting critical ones.`,
        impact: 'Reducing third-party requests improves performance and reduces external dependencies.',
        category: 'resources',
      });
    }

    // Check DOM node count
    if (resources.domNodes > 1500) {
      recommendations.push({
        severity: 'info',
        title: 'Reduce DOM Complexity',
        description: `Page has ${resources.domNodes} DOM nodes. Large DOMs increase memory usage and slow down rendering.`,
        impact: 'A simpler DOM tree improves layout and rendering performance.',
        category: 'resources',
      });
    }

    return recommendations;
  }

  /**
   * Checks Lighthouse scores for low-scoring categories.
   */
  private checkLighthouseScores(scores: Array<{ category: string; score: number }>): Recommendation[] {
    const recommendations: Recommendation[] = [];

    for (const score of scores) {
      if (score.score < 50) {
        const categoryTitle = this.getCategoryTitle(score.category);
        recommendations.push({
          severity: 'critical',
          title: `${categoryTitle} score is low (${score.score}/100)`,
          description: `The ${score.category} category scored ${score.score}/100. Review the detailed audit results to address failing items.`,
          impact: `Poor ${score.category} impacts user experience and search engine rankings.`,
          category: score.category,
        });
      } else if (score.score < 75) {
        const categoryTitle = this.getCategoryTitle(score.category);
        recommendations.push({
          severity: 'warning',
          title: `Improve ${categoryTitle} (${score.score}/100)`,
          description: `The ${score.category} category scored ${score.score}/100. There are opportunities for improvement.`,
          impact: `Improving ${score.category} enhances user experience and performance.`,
          category: score.category,
        });
      }
    }

    return recommendations;
  }

  /**
   * Returns a human-readable title for a Lighthouse category.
   */
  private getCategoryTitle(category: string): string {
    const titles: Record<string, string> = {
      performance: 'Performance',
      accessibility: 'Accessibility',
      'best-practices': 'Best Practices',
      seo: 'SEO',
      pwa: 'PWA',
    };

    return titles[category] || category;
  }
}
