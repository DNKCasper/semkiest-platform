/**
 * Type definitions for the Performance Agent.
 *
 * Supports Core Web Vitals measurement, Lighthouse audits, resource analysis,
 * and performance recommendations based on thresholds.
 */

// ---------------------------------------------------------------------------
// Core Web Vitals
// ---------------------------------------------------------------------------

/**
 * Core Web Vitals metrics as defined by Google.
 * These are key user experience metrics measured in milliseconds (or unitless for CLS).
 *
 * - LCP (Largest Contentful Paint): Time to render the largest visible element
 * - FID (First Input Delay): Time from user input to browser response (deprecated, use INP)
 * - CLS (Cumulative Layout Shift): Measure of unexpected layout shifts (unitless)
 * - INP (Interaction to Next Paint): Time from interaction to visual feedback
 * - TTFB (Time to First Byte): Time to receive the first byte of the response
 * - FCP (First Contentful Paint): Time to render the first visible element
 */
export interface CoreWebVitals {
  /** Largest Contentful Paint in milliseconds (target < 2500ms). */
  lcp: number;
  /** First Input Delay in milliseconds (deprecated, prefer INP). */
  fid: number;
  /** Cumulative Layout Shift (unitless, target < 0.1). */
  cls: number;
  /** Interaction to Next Paint in milliseconds. */
  inp: number;
  /** Time to First Byte in milliseconds (target < 800ms). */
  ttfb: number;
  /** First Contentful Paint in milliseconds (target < 1800ms). */
  fcp: number;
}

// ---------------------------------------------------------------------------
// Lighthouse categories and scores
// ---------------------------------------------------------------------------

/**
 * Supported Lighthouse audit categories.
 */
export type LighthouseCategory =
  | 'performance'
  | 'accessibility'
  | 'best-practices'
  | 'seo'
  | 'pwa';

/**
 * A Lighthouse category score (0–100) with metadata.
 */
export interface LighthouseScore {
  /** The category identifier. */
  category: LighthouseCategory;
  /** Numeric score from 0 to 100. */
  score: number;
  /** Human-readable category title. */
  title: string;
}

// ---------------------------------------------------------------------------
// Resource metrics
// ---------------------------------------------------------------------------

/**
 * Breakdown of resource types and sizes loaded during a page visit.
 */
export interface ResourceMetrics {
  /** Total bytes transferred across all resources. */
  totalSize: number;
  /** Total bytes for JavaScript resources. */
  jsSize: number;
  /** Total bytes for CSS resources. */
  cssSize: number;
  /** Total bytes for image resources. */
  imageSize: number;
  /** Total bytes for font resources. */
  fontSize: number;
  /** Total bytes for other resource types. */
  otherSize: number;
  /** Count of HTTP requests made during page load. */
  requestCount: number;
  /** Number of DOM nodes in the page. */
  domNodes: number;
  /** Count of third-party resource requests. */
  thirdPartyRequests: number;
}

// ---------------------------------------------------------------------------
// Performance audit items
// ---------------------------------------------------------------------------

/**
 * A single performance audit result from Lighthouse or custom analysis.
 */
export interface PerformanceAuditItem {
  /** Unique audit identifier. */
  id: string;
  /** Audit title. */
  title: string;
  /** Detailed description of the audit finding. */
  description: string;
  /** Numeric score (0–100) or null if not applicable. */
  score: number | null;
  /** Optional human-readable value (e.g. "2.5 seconds"). */
  displayValue?: string;
  /** Optional numeric value for aggregation. */
  numericValue?: number;
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

/**
 * Severity level for a performance recommendation.
 */
export type RecommendationSeverity = 'critical' | 'warning' | 'info';

/**
 * An actionable performance recommendation derived from audit results.
 */
export interface Recommendation {
  /** Severity level of the issue. */
  severity: RecommendationSeverity;
  /** Short title of the recommendation. */
  title: string;
  /** Detailed description and context. */
  description: string;
  /** Expected impact of implementing this recommendation. */
  impact: string;
  /** Category (e.g. "core-web-vitals", "resources", "rendering"). */
  category: string;
}

// ---------------------------------------------------------------------------
// Per-page results
// ---------------------------------------------------------------------------

/**
 * Performance analysis result for a single page URL.
 */
export interface PagePerformanceResult {
  /** The URL that was audited. */
  url: string;
  /** Core Web Vitals measurements. */
  vitals: CoreWebVitals;
  /** Lighthouse category scores. */
  lighthouseScores: LighthouseScore[];
  /** Resource breakdown. */
  resources: ResourceMetrics;
  /** Individual audit items. */
  audits: PerformanceAuditItem[];
  /** Actionable recommendations. */
  recommendations: Recommendation[];
  /** ISO 8601 timestamp of when the audit was conducted. */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Summary and threshold checking
// ---------------------------------------------------------------------------

/**
 * Aggregated results across multiple pages with threshold checking.
 */
export interface PerformanceAgentResult {
  /** Per-page performance results. */
  pages: PagePerformanceResult[];
  /** Aggregate statistics across all pages. */
  summary: {
    /** Average performance score (0–100). */
    avgPerformanceScore: number;
    /** Average Largest Contentful Paint across pages (milliseconds). */
    avgLcp: number;
    /** Average Cumulative Layout Shift across pages. */
    avgCls: number;
    /** Average First Contentful Paint across pages (milliseconds). */
    avgFcp: number;
    /** Average Time to First Byte across pages (milliseconds). */
    avgTtfb: number;
    /** Total count of recommendations across all pages. */
    totalRecommendations: number;
    /** Count of critical-severity recommendations. */
    criticalIssues: number;
  };
  /** Threshold validation results. */
  thresholds: {
    /** Whether all thresholds were met. */
    passed: boolean;
    /** List of threshold violations (empty if all passed). */
    violations: string[];
  };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Performance audit configuration.
 */
export interface PerformanceConfig {
  /** URLs to audit (array of absolute URLs). */
  urls: string[];
  /** Optional performance thresholds to validate against. */
  thresholds?: {
    /** Minimum acceptable performance score (0–100). Defaults to 50. */
    performance?: number;
    /** Maximum acceptable Largest Contentful Paint (milliseconds). Defaults to 2500. */
    lcp?: number;
    /** Maximum acceptable Cumulative Layout Shift (unitless). Defaults to 0.1. */
    cls?: number;
    /** Maximum acceptable First Contentful Paint (milliseconds). Defaults to 1800. */
    fcp?: number;
  };
  /** Device type to emulate. Defaults to 'desktop'. */
  device?: 'mobile' | 'desktop';
  /** Network throttling strategy. Defaults to 'simulated'. */
  throttling?: 'simulated' | 'devtools' | 'none';
  /** Number of audit iterations per URL (for averaging). Defaults to 1. */
  iterations?: number;
}

// ---------------------------------------------------------------------------
// Logger interface
// ---------------------------------------------------------------------------

/**
 * Minimal logging interface accepted by Performance Agent.
 * Compatible with console, pino, winston, etc.
 */
export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}
