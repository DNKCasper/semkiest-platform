/**
 * ResourceAnalyzer — analyzes network requests and resource metrics.
 *
 * Categorizes resources by type (JS, CSS, images, fonts, etc.), calculates
 * total transfer sizes, and identifies third-party requests.
 */

import { type Page } from 'playwright';

import type { Logger, ResourceMetrics } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Known third-party domains and patterns.
 */
const THIRD_PARTY_PATTERNS = [
  // Analytics
  'google-analytics.com',
  'analytics.google.com',
  'gtag.js',
  'ga.js',

  // Ads
  'googleadservices.com',
  'googlesyndication.com',
  'doubleclick.net',

  // Social media
  'facebook.com',
  'twitter.com',
  'instagram.com',
  'linkedin.com',

  // CDNs and third-party services
  'cloudflare.com',
  'cloudfront.net',
  'akamai.com',

  // Monitoring
  'sentry.io',
  'newrelic.com',
  'datadog.com',
];

// ---------------------------------------------------------------------------
// ResourceAnalyzer
// ---------------------------------------------------------------------------

/**
 * Analyzes network requests captured during page load and categorizes them
 * by resource type and origin.
 *
 * Usage:
 * ```ts
 * const analyzer = new ResourceAnalyzer(logger);
 * const metrics = await analyzer.analyzeResources(page, requests);
 * ```
 */
export class ResourceAnalyzer {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Analyzes resources loaded during a page visit.
   *
   * @param page - The Playwright page instance (used to extract DOM metrics).
   * @param requests - Array of request metadata.
   * @returns Resource metrics including sizes, request counts, and categorization.
   */
  async analyzeResources(
    page: Page,
    requests: Array<{ url: string; type: string; size: number }>,
  ): Promise<ResourceMetrics> {
    this.logger.debug(`Analyzing ${requests.length} network requests`);

    const metrics = this.categorizeResources(requests);
    const domNodeCount = await this.getDOMNodeCount(page);

    const result: ResourceMetrics = {
      totalSize: metrics.totalSize,
      jsSize: metrics.jsSize,
      cssSize: metrics.cssSize,
      imageSize: metrics.imageSize,
      fontSize: metrics.fontSize,
      otherSize: metrics.otherSize,
      requestCount: requests.length,
      domNodes: domNodeCount,
      thirdPartyRequests: metrics.thirdPartyCount,
    };

    this.logger.debug(`Resource analysis complete: ${result.totalSize} bytes total`);
    return result;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Categorizes resources by type and calculates sizes.
   */
  private categorizeResources(
    requests: Array<{ url: string; type: string; size: number }>,
  ): {
    totalSize: number;
    jsSize: number;
    cssSize: number;
    imageSize: number;
    fontSize: number;
    otherSize: number;
    thirdPartyCount: number;
  } {
    let jsSize = 0;
    let cssSize = 0;
    let imageSize = 0;
    let fontSize = 0;
    let otherSize = 0;
    let thirdPartyCount = 0;

    for (const request of requests) {
      const isThirdParty = this.isThirdParty(request.url);
      if (isThirdParty) {
        thirdPartyCount++;
      }

      // Estimate size if not provided (rough heuristic)
      const size = request.size > 0 ? request.size : this.estimateRequestSize(request);

      switch (request.type) {
        case 'script':
          jsSize += size;
          break;
        case 'stylesheet':
          cssSize += size;
          break;
        case 'image':
        case 'media':
          imageSize += size;
          break;
        case 'font':
          fontSize += size;
          break;
        case 'document':
          otherSize += size;
          break;
        default:
          otherSize += size;
          break;
      }
    }

    const totalSize = jsSize + cssSize + imageSize + fontSize + otherSize;

    return {
      totalSize,
      jsSize,
      cssSize,
      imageSize,
      fontSize,
      otherSize,
      thirdPartyCount,
    };
  }

  /**
   * Estimates request size based on URL and resource type.
   * This is a heuristic since actual sizes may not be captured.
   */
  private estimateRequestSize(request: { url: string; type: string }): number {
    // Default estimates by type
    const typeEstimates: Record<string, number> = {
      script: 30_000, // ~30KB
      stylesheet: 15_000, // ~15KB
      image: 50_000, // ~50KB
      font: 25_000, // ~25KB
      document: 50_000, // ~50KB
      media: 100_000, // ~100KB
      xhr: 20_000, // ~20KB
      fetch: 20_000, // ~20KB
    };

    return typeEstimates[request.type] || 10_000; // ~10KB default
  }

  /**
   * Determines if a URL is a third-party resource.
   */
  private isThirdParty(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname || '';

      for (const pattern of THIRD_PARTY_PATTERNS) {
        if (hostname.includes(pattern) || url.includes(pattern)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Gets the total DOM node count from the page.
   */
  private async getDOMNodeCount(page: Page): Promise<number> {
    try {
      const count = await page.evaluate(() => {
        // @ts-ignore - document is available in page.evaluate context
        return document.querySelectorAll('*').length;
      });
      return count;
    } catch (error) {
      this.logger.warn('Failed to count DOM nodes', error);
      return 0;
    }
  }
}
