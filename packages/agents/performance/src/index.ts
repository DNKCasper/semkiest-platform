/**
 * @semkiest/performance — Performance Agent package.
 *
 * Public API surface for Lighthouse auditing and Core Web Vitals analysis.
 */

export { PerformanceAgent } from './performance-agent';
export { LighthouseRunner } from './lighthouse-runner';
export { ResourceAnalyzer } from './resource-analyzer';
export { RecommendationEngine } from './recommendation-engine';

export type {
  // Core Web Vitals
  CoreWebVitals,

  // Lighthouse
  LighthouseCategory,
  LighthouseScore,

  // Resources
  ResourceMetrics,

  // Audits and recommendations
  PerformanceAuditItem,
  Recommendation,
  RecommendationSeverity,

  // Results
  PagePerformanceResult,
  PerformanceAgentResult,

  // Configuration
  PerformanceConfig,

  // Logger
  Logger,
} from './types';
