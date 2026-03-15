/**
 * SitemapBuilder — converts crawled pages into various sitemap formats.
 *
 * Supports:
 *  - XML sitemap format (standard sitemap.xml)
 *  - Flat URL list (one URL per line)
 *  - Tree visualization (text-based hierarchy)
 *  - Hierarchical sitemap nodes
 */

import type { CrawledPage, SitemapNode } from './types';

// ---------------------------------------------------------------------------
// SitemapBuilder
// ---------------------------------------------------------------------------

/**
 * Builds and exports sitemaps from crawled page data.
 *
 * Usage:
 * ```ts
 * const builder = new SitemapBuilder(crawledPages);
 * const xml = builder.toXmlSitemap();
 * const urls = builder.toUrlList();
 * const tree = builder.toTreeVisualization();
 * ```
 */
export class SitemapBuilder {
  private readonly pages: CrawledPage[];

  constructor(pages: CrawledPage[]) {
    this.pages = pages;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Generates an XML sitemap in the standard sitemap.xml format.
   *
   * Each URL includes: location, last modification time, and priority
   * based on depth (shallower pages get higher priority).
   */
  toXmlSitemap(): string {
    const entries = this.pages
      .sort((a, b) => a.normalizedUrl.localeCompare(b.normalizedUrl))
      .map((page) => {
        const priority = this.calculatePriority(page.depth);
        const lastmod = page.discoveredAt.toISOString().split('T')[0]; // YYYY-MM-DD

        return `  <url>
    <loc>${this.escapeXml(page.normalizedUrl)}</loc>
    <lastmod>${lastmod}</lastmod>
    <priority>${priority.toFixed(1)}</priority>
  </url>`;
      })
      .join('\n');

    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      entries +
      `\n</urlset>`
    );
  }

  /**
   * Generates a flat list of URLs (one per line).
   */
  toUrlList(): string {
    return this.pages
      .sort((a, b) => a.normalizedUrl.localeCompare(b.normalizedUrl))
      .map((page) => page.normalizedUrl)
      .join('\n');
  }

  /**
   * Generates a text-based tree visualization of the sitemap.
   *
   * Example:
   * ```
   * https://example.com/ (Root Page)
   * ├── https://example.com/about (About Page)
   * ├── https://example.com/products (Products)
   * │   ├── https://example.com/products/item-1
   * │   └── https://example.com/products/item-2
   * └── https://example.com/contact (Contact Us)
   * ```
   */
  toTreeVisualization(): string {
    const nodes = this.buildHierarchy();
    if (nodes.length === 0) {
      return '';
    }

    const lines: string[] = [];
    for (const node of nodes) {
      this.renderNode(node, '', true, lines);
    }
    return lines.join('\n');
  }

  /**
   * Exports the sitemap as a JSON structure.
   */
  toJson(): object {
    return {
      generatedAt: new Date().toISOString(),
      pages: this.pages
        .sort((a, b) => a.normalizedUrl.localeCompare(b.normalizedUrl))
        .map((page) => ({
          url: page.normalizedUrl,
          title: page.title,
          depth: page.depth,
          statusCode: page.statusCode,
          contentType: page.contentType,
          discoveredAt: page.discoveredAt.toISOString(),
          loadTimeMs: page.loadTimeMs,
          links: page.links,
        })),
      statistics: {
        totalPages: this.pages.length,
        totalLinks: this.pages.reduce((sum, p) => sum + p.links.length, 0),
        maxDepth: Math.max(...this.pages.map((p) => p.depth), 0),
        avgLoadTimeMs: this.calculateAverageLoadTime(),
      },
    };
  }

  /**
   * Returns the hierarchical sitemap nodes.
   */
  getSitemapNodes(): SitemapNode[] {
    return this.buildHierarchy();
  }

  /**
   * Groups pages by section based on path prefix.
   *
   * Example groupings:
   * - /products/* → "Products"
   * - /about/* → "About"
   * - / → "Root"
   */
  toSectionGrouping(): Record<string, CrawledPage[]> {
    const groups: Record<string, CrawledPage[]> = {};

    for (const page of this.pages) {
      const section = this.extractSection(page.normalizedUrl);
      if (!groups[section]) {
        groups[section] = [];
      }
      groups[section].push(page);
    }

    // Sort pages within each section
    for (const section in groups) {
      groups[section].sort((a, b) => a.normalizedUrl.localeCompare(b.normalizedUrl));
    }

    return groups;
  }

  /**
   * Exports section grouping as a CSV-friendly format.
   */
  toSectionCsv(): string {
    const grouping = this.toSectionGrouping();
    const lines = ['Section,URL,Title,Status Code,Load Time (ms)'];

    for (const [section, pages] of Object.entries(grouping)) {
      for (const page of pages) {
        lines.push(
          `"${section}","${page.normalizedUrl}","${page.title.replace(/"/g, '""')}",${page.statusCode},${page.loadTimeMs}`,
        );
      }
    }

    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // Private methods
  // -------------------------------------------------------------------------

  /**
   * Builds a hierarchical tree of sitemap nodes.
   */
  private buildHierarchy(): SitemapNode[] {
    // Map of normalized URL to page
    const pageMap = new Map(this.pages.map((p) => [p.normalizedUrl, p]));

    // Group pages by depth
    const byDepth: Map<number, CrawledPage[]> = new Map();
    for (const page of this.pages) {
      if (!byDepth.has(page.depth)) {
        byDepth.set(page.depth, []);
      }
      byDepth.get(page.depth)!.push(page);
    }

    // Build nodes from root down
    const nodeMap = new Map<string, SitemapNode>();

    // Create nodes for root pages (depth 0)
    const rootPages = byDepth.get(0) || [];
    for (const page of rootPages) {
      const node: SitemapNode = {
        url: page.normalizedUrl,
        title: page.title,
        depth: page.depth,
        children: [],
      };
      nodeMap.set(page.normalizedUrl, node);
    }

    // Recursively add children
    for (let depth = 1; depth < (Math.max(...this.pages.map((p) => p.depth), 0) + 1); depth++) {
      const pages = byDepth.get(depth) || [];
      for (const page of pages) {
        const parentUrl = page.parentUrl || (this.pages[0]?.normalizedUrl ?? '');
        const parentNode = nodeMap.get(parentUrl);

        const node: SitemapNode = {
          url: page.normalizedUrl,
          title: page.title,
          depth: page.depth,
          children: [],
        };

        if (parentNode) {
          parentNode.children.push(node);
        }

        nodeMap.set(page.normalizedUrl, node);
      }
    }

    // Return only root nodes
    return Array.from(nodeMap.values()).filter((n) => n.depth === 0);
  }

  /**
   * Renders a sitemap node as ASCII tree text.
   */
  private renderNode(node: SitemapNode, prefix: string, isLast: boolean, lines: string[]): void {
    const connector = isLast ? '└── ' : '├── ';
    const label = node.title ? `${node.url} (${node.title})` : node.url;
    lines.push(prefix + connector + label);

    const extension = isLast ? '    ' : '│   ';
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const isLastChild = i === node.children.length - 1;
      this.renderNode(child, prefix + extension, isLastChild, lines);
    }
  }

  /**
   * Extracts a section name from a URL path.
   * For example: "/products/widget/page" → "/products"
   */
  private extractSection(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter((p) => p);

      if (pathParts.length === 0) {
        return '/';
      }

      return `/${pathParts[0]}`;
    } catch {
      return 'Other';
    }
  }

  /**
   * Calculates priority for XML sitemap based on depth.
   * Shallower pages get higher priority (1.0 for depth 0, 0.5 for deep pages).
   */
  private calculatePriority(depth: number): number {
    if (depth === 0) return 1.0;
    if (depth === 1) return 0.8;
    if (depth === 2) return 0.6;
    return Math.max(0.3, 1.0 - depth * 0.1);
  }

  /**
   * Calculates average page load time.
   */
  private calculateAverageLoadTime(): number {
    if (this.pages.length === 0) return 0;
    const total = this.pages.reduce((sum, p) => sum + p.loadTimeMs, 0);
    return total / this.pages.length;
  }

  /**
   * Escapes XML special characters.
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
