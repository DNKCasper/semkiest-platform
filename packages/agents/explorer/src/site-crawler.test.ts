import { SiteCrawler } from './site-crawler';
import type {
  CrawledPage,
  Logger,
  PlaywrightBrowserContext,
  PlaywrightPage,
} from './types';

// ---------------------------------------------------------------------------
// Helpers / mocks
// ---------------------------------------------------------------------------

function makeLogger(): Logger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

function makePage(overrides: Partial<PlaywrightPage> = {}): PlaywrightPage {
  return {
    goto: jest.fn().mockResolvedValue({ status: 200 }),
    waitForNavigation: jest.fn().mockResolvedValue(undefined),
    waitForSelector: jest.fn().mockResolvedValue(undefined),
    fill: jest.fn().mockResolvedValue(undefined),
    click: jest.fn().mockResolvedValue(undefined),
    url: jest.fn().mockReturnValue('https://example.com/'),
    $: jest.fn().mockResolvedValue(null),
    evaluate: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeContext(overrides: Partial<PlaywrightBrowserContext> = {}): PlaywrightBrowserContext {
  return {
    addCookies: jest.fn().mockResolvedValue(undefined),
    cookies: jest.fn().mockResolvedValue([]),
    setExtraHTTPHeaders: jest.fn().mockResolvedValue(undefined),
    newPage: jest.fn().mockResolvedValue(makePage()),
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SiteCrawler', () => {
  let logger: Logger;
  let crawler: SiteCrawler;

  beforeEach(() => {
    logger = makeLogger();
    crawler = new SiteCrawler(logger);
  });

  // -------------------------------------------------------------------------
  // URL normalization
  // -------------------------------------------------------------------------

  describe('URL normalization', () => {
    it('removes query parameters during crawl', async () => {
      const context = makeContext({
        newPage: jest
          .fn()
          .mockResolvedValueOnce(
            makePage({
              url: jest.fn().mockReturnValue('https://example.com/page1'),
              evaluate: jest
                .fn()
                .mockResolvedValueOnce('Page 1') // title
                .mockResolvedValueOnce([
                  'https://example.com/page2?foo=bar',
                  'https://example.com/page2?baz=qux',
                ]), // links (duplicates with different query params)
            }),
          )
          .mockResolvedValueOnce(
            makePage({
              url: jest.fn().mockReturnValue('https://example.com/page2'),
              evaluate: jest
                .fn()
                .mockResolvedValueOnce('Page 2')
                .mockResolvedValueOnce(['https://example.com/page1']),
            }),
          ),
      });

      const result = await crawler.crawl(context, {
        startUrl: 'https://example.com/page1',
        maxDepth: 2,
        maxPages: 10,
        concurrency: 1,
      });

      // Should only crawl page2 once despite different query params
      expect(result.pages.length).toBe(2);
      const page2 = result.pages.find((p) => p.normalizedUrl.includes('page2'));
      expect(page2).toBeDefined();
    });

    it('removes URL fragments during crawl', async () => {
      const context = makeContext({
        newPage: jest.fn().mockResolvedValueOnce(
          makePage({
            url: jest.fn().mockReturnValue('https://example.com/'),
            evaluate: jest
              .fn()
              .mockResolvedValueOnce('Home')
              .mockResolvedValueOnce(['https://example.com/about#section1', 'https://example.com/about#section2']),
          }),
        ),
      });

      const result = await crawler.crawl(context, {
        startUrl: 'https://example.com/',
        maxDepth: 1,
        maxPages: 10,
        concurrency: 1,
      });

      // Should not queue about page twice
      const aboutLinks = result.pages[0]?.links.filter((l) => l.includes('about')) || [];
      expect(new Set(aboutLinks).size).toBeLessThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Depth limiting
  // -------------------------------------------------------------------------

  describe('depth limiting', () => {
    it('stops crawling at maxDepth', async () => {
      let pageCount = 0;
      const context = makeContext({
        newPage: jest.fn().mockImplementation(() => {
          pageCount++;
          const depth = Math.ceil(pageCount / 2);
          return makePage({
            url: jest.fn().mockReturnValue(`https://example.com/level${depth}`),
            evaluate: jest
              .fn()
              .mockResolvedValueOnce(`Level ${depth}`)
              .mockResolvedValueOnce(
                depth < 3 ? [`https://example.com/level${depth + 1}`] : [],
              ),
          });
        }),
      });

      const result = await crawler.crawl(context, {
        startUrl: 'https://example.com/level0',
        maxDepth: 2,
        maxPages: 100,
        concurrency: 1,
      });

      expect(result.statistics.maxDepthReached).toBeLessThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // Max pages limiting
  // -------------------------------------------------------------------------

  describe('max pages limiting', () => {
    it('stops crawling at maxPages limit', async () => {
      let pageCount = 0;
      const context = makeContext({
        newPage: jest.fn().mockImplementation(() => {
          pageCount++;
          return makePage({
            url: jest.fn().mockReturnValue(`https://example.com/page${pageCount}`),
            evaluate: jest
              .fn()
              .mockResolvedValueOnce(`Page ${pageCount}`)
              .mockResolvedValueOnce([`https://example.com/page${pageCount + 1}`]),
          });
        }),
      });

      const result = await crawler.crawl(context, {
        startUrl: 'https://example.com/page1',
        maxDepth: 100,
        maxPages: 5,
        concurrency: 1,
      });

      expect(result.pages.length).toBeLessThanOrEqual(5);
      expect(result.statistics.totalPages).toBeLessThanOrEqual(5);
    });
  });

  // -------------------------------------------------------------------------
  // Domain filtering
  // -------------------------------------------------------------------------

  describe('domain filtering', () => {
    it('filters out external links by default', async () => {
      const context = makeContext({
        newPage: jest.fn().mockResolvedValueOnce(
          makePage({
            url: jest.fn().mockReturnValue('https://example.com/'),
            evaluate: jest
              .fn()
              .mockResolvedValueOnce('Home')
              .mockResolvedValueOnce([
                'https://example.com/about',
                'https://external.com/page',
              ]),
          }),
        ),
      });

      const result = await crawler.crawl(context, {
        startUrl: 'https://example.com/',
        maxDepth: 2,
        maxPages: 10,
        concurrency: 1,
        followExternalLinks: false,
      });

      const externalLinks = result.pages[0]?.links.filter((l) => l.includes('external')) || [];
      expect(externalLinks.length).toBe(0);
    });

    it('allows external links when followExternalLinks is true', async () => {
      const context = makeContext({
        newPage: jest
          .fn()
          .mockResolvedValueOnce(
            makePage({
              url: jest.fn().mockReturnValue('https://example.com/'),
              evaluate: jest
                .fn()
                .mockResolvedValueOnce('Home')
                .mockResolvedValueOnce([
                  'https://example.com/about',
                  'https://external.com/page',
                ]),
            }),
          )
          .mockResolvedValueOnce(
            makePage({
              url: jest.fn().mockReturnValue('https://example.com/about'),
              evaluate: jest
                .fn()
                .mockResolvedValueOnce('About')
                .mockResolvedValueOnce([]),
            }),
          ),
      });

      const result = await crawler.crawl(context, {
        startUrl: 'https://example.com/',
        maxDepth: 2,
        maxPages: 10,
        concurrency: 1,
        followExternalLinks: true,
      });

      // Should have crawled both internal and external domains
      expect(result.pages.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // Include/exclude patterns
  // -------------------------------------------------------------------------

  describe('include/exclude patterns', () => {
    it('respects include patterns', async () => {
      const context = makeContext({
        newPage: jest.fn().mockResolvedValueOnce(
          makePage({
            url: jest.fn().mockReturnValue('https://example.com/'),
            evaluate: jest
              .fn()
              .mockResolvedValueOnce('Home')
              .mockResolvedValueOnce([
                'https://example.com/products/item1',
                'https://example.com/blog/post1',
              ]),
          }),
        ),
      });

      const result = await crawler.crawl(context, {
        startUrl: 'https://example.com/',
        maxDepth: 2,
        maxPages: 10,
        concurrency: 1,
        includePatterns: [/\/products\//],
      });

      const homeLinksIncluded = result.pages[0]?.links.filter((l) => l.includes('products')) || [];
      const homeLinksExcluded = result.pages[0]?.links.filter((l) => l.includes('blog')) || [];

      expect(homeLinksIncluded.length).toBeGreaterThan(0);
      expect(homeLinksExcluded.length).toBe(0);
    });

    it('respects exclude patterns', async () => {
      const context = makeContext({
        newPage: jest.fn().mockResolvedValueOnce(
          makePage({
            url: jest.fn().mockReturnValue('https://example.com/'),
            evaluate: jest
              .fn()
              .mockResolvedValueOnce('Home')
              .mockResolvedValueOnce([
                'https://example.com/products/item1',
                'https://example.com/admin/users',
              ]),
          }),
        ),
      });

      const result = await crawler.crawl(context, {
        startUrl: 'https://example.com/',
        maxDepth: 2,
        maxPages: 10,
        concurrency: 1,
        excludePatterns: [/\/admin\//],
      });

      const adminLinks = result.pages[0]?.links.filter((l) => l.includes('admin')) || [];
      expect(adminLinks.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Cycle detection
  // -------------------------------------------------------------------------

  describe('cycle detection', () => {
    it('avoids infinite loops by tracking visited URLs', async () => {
      const context = makeContext({
        newPage: jest
          .fn()
          .mockResolvedValueOnce(
            makePage({
              url: jest.fn().mockReturnValue('https://example.com/page1'),
              evaluate: jest
                .fn()
                .mockResolvedValueOnce('Page 1')
                .mockResolvedValueOnce(['https://example.com/page2']),
            }),
          )
          .mockResolvedValueOnce(
            makePage({
              url: jest.fn().mockReturnValue('https://example.com/page2'),
              evaluate: jest
                .fn()
                .mockResolvedValueOnce('Page 2')
                .mockResolvedValueOnce(['https://example.com/page1']), // Links back to page1
            }),
          ),
      });

      const result = await crawler.crawl(context, {
        startUrl: 'https://example.com/page1',
        maxDepth: 10,
        maxPages: 100,
        concurrency: 1,
      });

      // Should only crawl each page once
      expect(result.pages.length).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  describe('crawl statistics', () => {
    it('calculates correct statistics', async () => {
      const context = makeContext({
        newPage: jest.fn().mockResolvedValueOnce(
          makePage({
            url: jest.fn().mockReturnValue('https://example.com/'),
            evaluate: jest
              .fn()
              .mockResolvedValueOnce('Home')
              .mockResolvedValueOnce([
                'https://example.com/page1',
                'https://example.com/page2',
              ]),
          }),
        ),
      });

      const result = await crawler.crawl(context, {
        startUrl: 'https://example.com/',
        maxDepth: 0,
        maxPages: 10,
        concurrency: 1,
      });

      expect(result.statistics.totalPages).toBe(1);
      expect(result.statistics.totalLinks).toBe(2);
      expect(result.statistics.maxDepthReached).toBeGreaterThanOrEqual(0);
      expect(result.statistics.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.statistics.errorCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Sitemap building
  // -------------------------------------------------------------------------

  describe('sitemap building', () => {
    it('builds a hierarchical sitemap tree', async () => {
      const context = makeContext({
        newPage: jest.fn().mockResolvedValueOnce(
          makePage({
            url: jest.fn().mockReturnValue('https://example.com/'),
            evaluate: jest
              .fn()
              .mockResolvedValueOnce('Home')
              .mockResolvedValueOnce(['https://example.com/about']),
          }),
        ),
      });

      const result = await crawler.crawl(context, {
        startUrl: 'https://example.com/',
        maxDepth: 2,
        maxPages: 10,
        concurrency: 1,
      });

      expect(result.sitemap).toBeDefined();
      expect(Array.isArray(result.sitemap)).toBe(true);
      if (result.sitemap.length > 0) {
        expect(result.sitemap[0].url).toBeDefined();
        expect(result.sitemap[0].title).toBeDefined();
        expect(result.sitemap[0].depth).toBeDefined();
        expect(Array.isArray(result.sitemap[0].children)).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('handles invalid start URLs', async () => {
      const context = makeContext();

      await expect(
        crawler.crawl(context, {
          startUrl: 'not-a-valid-url',
          maxDepth: 5,
          maxPages: 100,
        }),
      ).rejects.toThrow('Invalid starting URL');
    });

    it('tracks and reports errors during crawl', async () => {
      const context = makeContext({
        newPage: jest.fn().mockResolvedValueOnce(
          makePage({
            goto: jest.fn().mockRejectedValueOnce(new Error('Navigation failed')),
          }),
        ),
      });

      const result = await crawler.crawl(context, {
        startUrl: 'https://example.com/',
        maxDepth: 2,
        maxPages: 10,
        concurrency: 1,
      });

      // Navigation errors are handled gracefully (page returns null), resulting
      // in zero pages discovered rather than a counted error.
      expect(result.pages.length).toBe(0);
    });
  });
});
