import { SitemapBuilder } from './sitemap-builder';
import type { CrawledPage } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePage(overrides: Partial<CrawledPage> = {}): CrawledPage {
  return {
    url: 'https://example.com/',
    normalizedUrl: 'https://example.com/',
    title: 'Home',
    statusCode: 200,
    contentType: 'text/html',
    depth: 0,
    links: [],
    discoveredAt: new Date(),
    loadTimeMs: 100,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SitemapBuilder', () => {
  // -------------------------------------------------------------------------
  // XML sitemap export
  // -------------------------------------------------------------------------

  describe('toXmlSitemap', () => {
    it('generates valid XML sitemap structure', () => {
      const pages = [
        makePage({
          normalizedUrl: 'https://example.com/',
          title: 'Home',
        }),
        makePage({
          normalizedUrl: 'https://example.com/about',
          title: 'About',
          depth: 1,
        }),
      ];

      const builder = new SitemapBuilder(pages);
      const xml = builder.toXmlSitemap();

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
      expect(xml).toContain('<url>');
      expect(xml).toContain('<loc>');
      expect(xml).toContain('<lastmod>');
      expect(xml).toContain('<priority>');
      expect(xml).toContain('</urlset>');
    });

    it('includes all pages in XML sitemap', () => {
      const pages = [
        makePage({ normalizedUrl: 'https://example.com/' }),
        makePage({ normalizedUrl: 'https://example.com/page1', depth: 1 }),
        makePage({ normalizedUrl: 'https://example.com/page2', depth: 1 }),
      ];

      const builder = new SitemapBuilder(pages);
      const xml = builder.toXmlSitemap();

      expect(xml).toContain('https://example.com/');
      expect(xml).toContain('https://example.com/page1');
      expect(xml).toContain('https://example.com/page2');
    });

    it('sets priority based on depth', () => {
      const pages = [
        makePage({
          normalizedUrl: 'https://example.com/',
          depth: 0,
        }),
        makePage({
          normalizedUrl: 'https://example.com/level1',
          depth: 1,
        }),
        makePage({
          normalizedUrl: 'https://example.com/level2/item',
          depth: 2,
        }),
      ];

      const builder = new SitemapBuilder(pages);
      const xml = builder.toXmlSitemap();

      // Root should have highest priority
      expect(xml).toMatch(/<loc>https:\/\/example\.com\/<\/loc>\s*<lastmod>[^<]+<\/lastmod>\s*<priority>1\.0<\/priority>/);
      // Deeper pages should have lower priority
      expect(xml).toMatch(/<priority>0\./);
    });

    it('escapes XML special characters', () => {
      const pages = [
        makePage({
          normalizedUrl: 'https://example.com/page?param=<value>&other="quoted"',
          title: 'Page with <special> & characters',
        }),
      ];

      const builder = new SitemapBuilder(pages);
      const xml = builder.toXmlSitemap();

      expect(xml).toContain('&lt;');
      expect(xml).toContain('&gt;');
      expect(xml).toContain('&amp;');
      expect(xml).toContain('&quot;');
    });
  });

  // -------------------------------------------------------------------------
  // URL list export
  // -------------------------------------------------------------------------

  describe('toUrlList', () => {
    it('generates one URL per line', () => {
      const pages = [
        makePage({ normalizedUrl: 'https://example.com/' }),
        makePage({ normalizedUrl: 'https://example.com/about' }),
        makePage({ normalizedUrl: 'https://example.com/contact' }),
      ];

      const builder = new SitemapBuilder(pages);
      const list = builder.toUrlList();

      const lines = list.split('\n');
      expect(lines.length).toBe(3);
      expect(lines[0]).toMatch(/https:\/\/example\.com\//);
      expect(lines[1]).toMatch(/https:\/\/example\.com\/about/);
      expect(lines[2]).toMatch(/https:\/\/example\.com\/contact/);
    });

    it('sorts URLs alphabetically', () => {
      const pages = [
        makePage({ normalizedUrl: 'https://example.com/zebra' }),
        makePage({ normalizedUrl: 'https://example.com/apple' }),
        makePage({ normalizedUrl: 'https://example.com/banana' }),
      ];

      const builder = new SitemapBuilder(pages);
      const list = builder.toUrlList();

      const lines = list.split('\n');
      expect(lines[0]).toContain('apple');
      expect(lines[1]).toContain('banana');
      expect(lines[2]).toContain('zebra');
    });
  });

  // -------------------------------------------------------------------------
  // Tree visualization
  // -------------------------------------------------------------------------

  describe('toTreeVisualization', () => {
    it('generates ASCII tree structure', () => {
      const pages = [
        makePage({
          normalizedUrl: 'https://example.com/',
          title: 'Home',
          depth: 0,
        }),
        makePage({
          normalizedUrl: 'https://example.com/about',
          title: 'About',
          depth: 1,
          parentUrl: 'https://example.com/',
        }),
      ];

      const builder = new SitemapBuilder(pages);
      const tree = builder.toTreeVisualization();

      expect(tree).toContain('Home');
      expect(tree).toContain('About');
    });

    it('uses ASCII tree characters', () => {
      const pages = [
        makePage({
          normalizedUrl: 'https://example.com/',
          depth: 0,
        }),
        makePage({
          normalizedUrl: 'https://example.com/page1',
          depth: 1,
          parentUrl: 'https://example.com/',
        }),
        makePage({
          normalizedUrl: 'https://example.com/page2',
          depth: 1,
          parentUrl: 'https://example.com/',
        }),
      ];

      const builder = new SitemapBuilder(pages);
      const tree = builder.toTreeVisualization();

      expect(tree).toMatch(/[├└]/); // Tree characters
    });
  });

  // -------------------------------------------------------------------------
  // JSON export
  // -------------------------------------------------------------------------

  describe('toJson', () => {
    it('exports pages as JSON with metadata', () => {
      const pages = [
        makePage({
          normalizedUrl: 'https://example.com/',
          title: 'Home',
          statusCode: 200,
          loadTimeMs: 150,
        }),
      ];

      const builder = new SitemapBuilder(pages);
      const json = builder.toJson();

      expect(json).toHaveProperty('generatedAt');
      expect(json).toHaveProperty('pages');
      expect(json).toHaveProperty('statistics');
      expect((json as any).pages.length).toBe(1);
      expect((json as any).pages[0].url).toBe('https://example.com/');
      expect((json as any).pages[0].title).toBe('Home');
    });

    it('includes statistics in JSON export', () => {
      const pages = [
        makePage({ normalizedUrl: 'https://example.com/', links: ['https://example.com/page1'] }),
        makePage({
          normalizedUrl: 'https://example.com/page1',
          depth: 1,
          links: [],
        }),
      ];

      const builder = new SitemapBuilder(pages);
      const json = builder.toJson();

      expect((json as any).statistics.totalPages).toBe(2);
      expect((json as any).statistics.totalLinks).toBe(1);
      expect((json as any).statistics.maxDepth).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Section grouping
  // -------------------------------------------------------------------------

  describe('toSectionGrouping', () => {
    it('groups pages by path prefix', () => {
      const pages = [
        makePage({ normalizedUrl: 'https://example.com/' }),
        makePage({ normalizedUrl: 'https://example.com/products/item1', depth: 2 }),
        makePage({ normalizedUrl: 'https://example.com/products/item2', depth: 2 }),
        makePage({ normalizedUrl: 'https://example.com/blog/post1', depth: 2 }),
      ];

      const builder = new SitemapBuilder(pages);
      const grouping = builder.toSectionGrouping();

      expect(grouping).toHaveProperty('/');
      expect(grouping).toHaveProperty('/products');
      expect(grouping).toHaveProperty('/blog');
    });

    it('sorts pages within each section', () => {
      const pages = [
        makePage({ normalizedUrl: 'https://example.com/', depth: 0 }),
        makePage({ normalizedUrl: 'https://example.com/products/zebra', depth: 2 }),
        makePage({ normalizedUrl: 'https://example.com/products/apple', depth: 2 }),
      ];

      const builder = new SitemapBuilder(pages);
      const grouping = builder.toSectionGrouping();
      const productPages = grouping['/products'];

      expect(productPages[0].normalizedUrl).toContain('apple');
      expect(productPages[1].normalizedUrl).toContain('zebra');
    });
  });

  // -------------------------------------------------------------------------
  // Section CSV export
  // -------------------------------------------------------------------------

  describe('toSectionCsv', () => {
    it('exports section grouping as CSV', () => {
      const pages = [
        makePage({
          normalizedUrl: 'https://example.com/',
          title: 'Home',
          statusCode: 200,
          loadTimeMs: 100,
        }),
        makePage({
          normalizedUrl: 'https://example.com/about',
          title: 'About Us',
          statusCode: 200,
          loadTimeMs: 150,
          depth: 1,
        }),
      ];

      const builder = new SitemapBuilder(pages);
      const csv = builder.toSectionCsv();

      expect(csv).toContain('Section,URL,Title,Status Code,Load Time (ms)');
      expect(csv).toContain('https://example.com/');
      expect(csv).toContain('Home');
      expect(csv).toContain('200');
      expect(csv).toContain('100');
    });

    it('escapes quotes in CSV', () => {
      const pages = [
        makePage({
          normalizedUrl: 'https://example.com/',
          title: 'Home "Page"',
        }),
      ];

      const builder = new SitemapBuilder(pages);
      const csv = builder.toSectionCsv();

      // Double quotes should be escaped as ""
      expect(csv).toContain('""');
    });
  });

  // -------------------------------------------------------------------------
  // Sitemap nodes
  // -------------------------------------------------------------------------

  describe('getSitemapNodes', () => {
    it('returns hierarchical sitemap nodes', () => {
      const pages = [
        makePage({
          normalizedUrl: 'https://example.com/',
          title: 'Home',
          depth: 0,
        }),
        makePage({
          normalizedUrl: 'https://example.com/about',
          title: 'About',
          depth: 1,
          parentUrl: 'https://example.com/',
        }),
      ];

      const builder = new SitemapBuilder(pages);
      const nodes = builder.getSitemapNodes();

      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes[0].url).toBe('https://example.com/');
      expect(nodes[0].children.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles empty page list', () => {
      const builder = new SitemapBuilder([]);

      const xml = builder.toXmlSitemap();
      const list = builder.toUrlList();
      const tree = builder.toTreeVisualization();

      expect(xml).toContain('<?xml version');
      expect(list).toBe('');
      expect(tree).toBe('');
    });

    it('handles pages with missing titles', () => {
      const pages = [
        makePage({
          normalizedUrl: 'https://example.com/',
          title: '',
        }),
      ];

      const builder = new SitemapBuilder(pages);
      const json = builder.toJson();

      expect((json as any).pages[0].title).toBe('');
    });

    it('handles pages with no parent URL', () => {
      const pages = [
        makePage({
          normalizedUrl: 'https://example.com/',
          parentUrl: undefined,
          depth: 0,
        }),
      ];

      const builder = new SitemapBuilder(pages);
      const tree = builder.toTreeVisualization();

      expect(tree).toContain('https://example.com/');
    });
  });
});
