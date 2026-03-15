/**
 * SiteCrawler — recursively crawls a website to discover all pages and
 * build a comprehensive sitemap.
 *
 * Responsibilities:
 *  - Navigate to a starting URL and recursively follow links.
 *  - Track visited URLs to avoid cycles.
 *  - Respect depth and page count limits.
 *  - Filter URLs by domain and include/exclude patterns.
 *  - Normalize URLs (handle trailing slashes, query params, fragments).
 *  - Support authentication for protected pages.
 *  - Manage concurrent page crawls for performance.
 *  - Collect metadata (title, status code, content type, load time).
 *  - Emit progress events during the crawl.
 */

import type {
  CrawlAuthOptions,
  CrawlConfig,
  CrawledPage,
  CrawlResult,
  Logger,
  PlaywrightBrowserContext,
  PlaywrightPage,
} from './types';
import { SessionManager } from './session-manager';
import { AuthHandler } from './auth-handler';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_MAX_PAGES = 100;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface CrawlTask {
  url: string;
  depth: number;
  parentUrl?: string;
}

// ---------------------------------------------------------------------------
// SiteCrawler
// ---------------------------------------------------------------------------

/**
 * Crawls a website recursively to discover all pages and build a sitemap.
 *
 * Usage:
 * ```ts
 * const crawler = new SiteCrawler(logger);
 * const result = await crawler.crawl(context, {
 *   startUrl: 'https://example.com',
 *   maxDepth: 5,
 *   maxPages: 100,
 * });
 * console.log(`Discovered ${result.pages.length} pages`);
 * ```
 */
export class SiteCrawler {
  private readonly logger: Logger;
  private sessionManager: SessionManager | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Crawls a website starting from the provided URL.
   *
   * @param context   - Playwright browser context
   * @param config    - Crawl configuration
   * @returns         - Crawl result with pages, sitemap, and statistics
   */
  async crawl(context: PlaywrightBrowserContext, config: CrawlConfig): Promise<CrawlResult> {
    const startTime = Date.now();

    // Validate and normalize the starting URL
    let startUrl: URL;
    try {
      startUrl = new URL(config.startUrl);
    } catch {
      throw new Error(`Invalid starting URL: ${config.startUrl}`);
    }

    // Initialize configuration with defaults
    const maxDepth = config.maxDepth ?? DEFAULT_MAX_DEPTH;
    const maxPages = config.maxPages ?? DEFAULT_MAX_PAGES;
    const concurrency = config.concurrency ?? DEFAULT_CONCURRENCY;
    const timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;

    // Initialize session manager if authentication is required
    if (config.auth) {
      const authHandler = new AuthHandler(this.logger);
      this.sessionManager = new SessionManager(this.logger, authHandler, config.auth);
      await this.sessionManager.initialize(context);
    }

    // Track discovered pages and queue
    const discoveredPages: Map<string, CrawledPage> = new Map();
    const visitedUrls: Set<string> = new Set();
    const queue: CrawlTask[] = [
      {
        url: startUrl.href,
        depth: 0,
      },
    ];

    let errorCount = 0;
    let totalLoadTimeMs = 0;
    let maxDepthReached = 0;

    this.logger.info(`Starting crawl of ${startUrl.href}`);

    // Process queue with concurrency control
    while (queue.length > 0 && discoveredPages.size < maxPages) {
      const batch = queue.splice(0, concurrency);
      const promises = batch.map((task) =>
        this.crawlPage(
          context,
          task,
          startUrl,
          maxDepth,
          maxPages,
          timeout,
          visitedUrls,
          discoveredPages,
          config,
        ).catch((err) => {
          this.logger.error(`Error crawling ${task.url}: ${err.message}`);
          errorCount++;
        }),
      );

      const results = await Promise.all(promises);

      // Process results and add new tasks to the queue
      for (const result of results) {
        if (result) {
          const { page, newLinks } = result;

          // Add newly discovered links to the queue
          for (const link of newLinks) {
            if (
              !visitedUrls.has(link) &&
              discoveredPages.size + queue.length < maxPages &&
              this.isUrlAllowed(new URL(link), startUrl, config)
            ) {
              const linkUrl = new URL(link);
              const depth = this.calculateDepth(linkUrl, startUrl);

              if (depth <= maxDepth) {
                queue.push({
                  url: link,
                  depth,
                  parentUrl: page.url,
                });
                maxDepthReached = Math.max(maxDepthReached, depth);
              }
            }
          }

          if (page.loadTimeMs) {
            totalLoadTimeMs += page.loadTimeMs;
          }
        }
      }

      // Log progress
      this.logger.info(
        `Crawl progress: ${discoveredPages.size} pages discovered, ` +
          `${queue.length} in queue, ${visitedUrls.size} visited`,
      );
    }

    // Clean up session if initialized
    if (this.sessionManager) {
      await this.sessionManager.clearSessions(context);
    }

    // Build sitemap from discovered pages
    const sitemap = this.buildSitemap(Array.from(discoveredPages.values()), startUrl);

    const durationMs = Date.now() - startTime;

    this.logger.info(
      `Crawl complete: ${discoveredPages.size} pages, ` +
        `${errorCount} errors, ${durationMs}ms total time`,
    );

    return {
      pages: Array.from(discoveredPages.values()),
      sitemap,
      statistics: {
        totalPages: discoveredPages.size,
        totalLinks: Array.from(discoveredPages.values()).reduce(
          (sum, page) => sum + page.links.length,
          0,
        ),
        maxDepthReached,
        avgLoadTimeMs: discoveredPages.size > 0 ? totalLoadTimeMs / discoveredPages.size : 0,
        errorCount,
        durationMs,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Private methods
  // -------------------------------------------------------------------------

  /**
   * Crawls a single page and extracts links.
   */
  private async crawlPage(
    context: PlaywrightBrowserContext,
    task: CrawlTask,
    startUrl: URL,
    maxDepth: number,
    maxPages: number,
    timeout: number,
    visitedUrls: Set<string>,
    discoveredPages: Map<string, CrawledPage>,
    config: CrawlConfig,
  ): Promise<{ page: CrawledPage; newLinks: string[] } | null> {
    const normalizedUrl = this.normalizeUrl(task.url);

    // Skip if already visited or if we've reached the page limit
    if (visitedUrls.has(normalizedUrl) || discoveredPages.size >= maxPages) {
      return null;
    }

    visitedUrls.add(normalizedUrl);

    const page = await context.newPage();

    try {
      // Ensure authentication if required
      if (this.sessionManager) {
        const isAuthenticated = await this.sessionManager.ensureAuthenticated(context, page);
        if (!isAuthenticated) {
          this.logger.warn(`Authentication failed for ${normalizedUrl}, skipping`);
          return null;
        }
      }

      // Navigate to the page
      const loadStartTime = Date.now();
      let response: unknown;
      try {
        response = await page.goto(normalizedUrl, {
          waitUntil: 'networkidle',
          timeout,
        });
      } catch (err) {
        this.logger.warn(`Timeout or navigation error for ${normalizedUrl}`);
        return null;
      }
      const loadTimeMs = Date.now() - loadStartTime;

      // Extract page metadata
      const url = page.url();
      const title = await this.extractTitle(page);

      // Extract all links from the page
      const links = await this.extractLinks(page, startUrl, config);

      const crawledPage: CrawledPage = {
        url: task.url,
        normalizedUrl: url,
        title,
        statusCode: this.getStatusCode(response),
        contentType: 'text/html', // Simplified; could extract from headers
        depth: task.depth,
        links,
        discoveredAt: new Date(),
        loadTimeMs,
        parentUrl: task.parentUrl,
      };

      discoveredPages.set(normalizedUrl, crawledPage);

      return {
        page: crawledPage,
        newLinks: links,
      };
    } catch (err) {
      this.logger.error(
        `Error crawling page ${normalizedUrl}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    } finally {
      await page.close();
    }
  }

  /**
   * Extracts the page title from the <title> tag or Open Graph.
   */
  private async extractTitle(page: PlaywrightPage): Promise<string> {
    try {
      return await page.evaluate(() => {
        const titleTag = document.querySelector('title');
        if (titleTag?.textContent) {
          return titleTag.textContent.trim();
        }

        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) {
          const content = ogTitle.getAttribute('content');
          if (content) return content.trim();
        }

        return '';
      });
    } catch {
      return '';
    }
  }

  /**
   * Extracts all links from the page.
   */
  private async extractLinks(
    page: PlaywrightPage,
    startUrl: URL,
    config: CrawlConfig,
  ): Promise<string[]> {
    try {
      const hrefs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]'))
          .map((a) => (a as HTMLAnchorElement).href)
          .filter((href) => href && !href.startsWith('javascript:') && !href.startsWith('mailto:'));
      });

      const validLinks: string[] = [];
      for (const href of hrefs) {
        try {
          const url = new URL(href);
          if (this.isUrlAllowed(url, startUrl, config)) {
            validLinks.push(this.normalizeUrl(url.href));
          }
        } catch {
          // Invalid URL, skip it
        }
      }

      return [...new Set(validLinks)]; // Remove duplicates
    } catch (err) {
      this.logger.warn(`Error extracting links: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /**
   * Checks if a URL should be crawled based on domain, pattern filters, etc.
   */
  private isUrlAllowed(url: URL, startUrl: URL, config: CrawlConfig): boolean {
    // Check external domain filter
    if (!config.followExternalLinks && url.hostname !== startUrl.hostname) {
      return false;
    }

    // Check include patterns
    if (config.includePatterns && config.includePatterns.length > 0) {
      const matches = config.includePatterns.some((pattern) => pattern.test(url.href));
      if (!matches) return false;
    }

    // Check exclude patterns
    if (config.excludePatterns && config.excludePatterns.length > 0) {
      const matches = config.excludePatterns.some((pattern) => pattern.test(url.href));
      if (matches) return false;
    }

    // Skip common non-content URLs
    const pathname = url.pathname.toLowerCase();
    if (
      pathname.endsWith('.pdf') ||
      pathname.endsWith('.zip') ||
      pathname.endsWith('.exe') ||
      pathname.endsWith('.jpg') ||
      pathname.endsWith('.png') ||
      pathname.endsWith('.gif')
    ) {
      return false;
    }

    return true;
  }

  /**
   * Normalizes a URL by removing query parameters, fragments, and
   * standardizing the trailing slash.
   */
  private normalizeUrl(urlString: string): string {
    try {
      const url = new URL(urlString);
      // Remove query parameters and fragments
      url.search = '';
      url.hash = '';

      let pathname = url.pathname;
      // Normalize trailing slash for root path
      if (pathname === '') {
        pathname = '/';
      }

      url.pathname = pathname;
      return url.href;
    } catch {
      return urlString;
    }
  }

  /**
   * Calculates the depth of a URL relative to the start URL.
   */
  private calculateDepth(url: URL, startUrl: URL): number {
    if (url.hostname !== startUrl.hostname) {
      return -1; // External URL
    }

    const startPath = startUrl.pathname.split('/').filter((p) => p);
    const currentPath = url.pathname.split('/').filter((p) => p);

    // Very basic depth calculation: number of path segments beyond start
    return Math.max(0, currentPath.length - startPath.length);
  }

  /**
   * Extracts the HTTP status code from a response object.
   */
  private getStatusCode(response: unknown): number {
    if (response && typeof response === 'object' && 'status' in response) {
      return (response as { status: number }).status;
    }
    return 200; // Assume success if we got here
  }

  /**
   * Builds a hierarchical sitemap tree from flat crawled pages.
   */
  private buildSitemap(pages: CrawledPage[], startUrl: URL): any[] {
    // Find the root page (depth 0, matches start URL)
    const rootPage = pages.find((p) => p.depth === 0);
    if (!rootPage) {
      return [];
    }

    // Build a map of parent -> children
    const childrenMap: Map<string, CrawledPage[]> = new Map();
    for (const page of pages) {
      const parentUrl = page.parentUrl || this.normalizeUrl(startUrl.href);
      if (!childrenMap.has(parentUrl)) {
        childrenMap.set(parentUrl, []);
      }
      childrenMap.get(parentUrl)!.push(page);
    }

    // Recursively build the tree (with visited set to prevent cycles)
    const visited = new Set<string>();
    const buildNode = (page: CrawledPage): any => {
      if (visited.has(page.normalizedUrl)) {
        return { url: page.normalizedUrl, title: page.title, depth: page.depth, children: [] };
      }
      visited.add(page.normalizedUrl);
      return {
        url: page.normalizedUrl,
        title: page.title,
        depth: page.depth,
        children: (childrenMap.get(page.normalizedUrl) || [])
          .filter((child) => !visited.has(child.normalizedUrl))
          .sort((a, b) => a.title.localeCompare(b.title))
          .map((child) => buildNode(child)),
      };
    };

    return [buildNode(rootPage)];
  }
}
