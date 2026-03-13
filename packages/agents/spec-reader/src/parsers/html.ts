import { readFile } from 'fs/promises';
import { DocumentFormat, DocumentSection, ParsedDocument } from '../types';
import { normalizeText, countWords } from './utils';

/** Default network timeout for URL fetches (10 s). */
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// cheerio type shim
// cheerio v1.0 ships its own types via @types/cheerio / built-in declarations.
// We import the type-only namespace to avoid bundling issues.
// ---------------------------------------------------------------------------

type CheerioAPI = import('cheerio').CheerioAPI;

// ---------------------------------------------------------------------------
// Section extraction helpers
// ---------------------------------------------------------------------------

/**
 * Walk the direct children of <body> and convert them to DocumentSections,
 * preserving document order.
 *
 * @param $ - A loaded cheerio instance.
 */
function extractSections($: CheerioAPI): DocumentSection[] {
  const sections: DocumentSection[] = [];

  $('body')
    .children()
    .toArray()
    .forEach((node) => {
      // cheerio elements have a `tagName` property on tag nodes
      // (domhandler uses `.name` for tag elements, but cheerio
      // exposes it as `tagName` on the wrapped object)
      const tag = ('tagName' in node ? String(node.tagName) : '').toLowerCase();
      const $el = $(node);

      if (!tag) return;

      if (/^h[1-6]$/.test(tag)) {
        const level = parseInt(tag[1], 10);
        const text = $el.text().trim();
        if (text) {
          sections.push({ type: 'heading', level, title: text, content: text });
        }
      } else if (tag === 'pre' || tag === 'code') {
        const code = $el.text();
        if (code.trim()) {
          sections.push({ type: 'code-block', content: code });
        }
      } else if (tag === 'table') {
        const tableText = $el.text().trim();
        if (tableText) {
          sections.push({ type: 'table', content: tableText });
        }
      } else if (tag === 'ul' || tag === 'ol') {
        const items: string[] = [];
        $el.find('li').each((_, li) => {
          const text = $(li).text().trim();
          if (text) items.push(text);
        });
        if (items.length > 0) {
          sections.push({ type: 'list', content: items.join('\n'), items });
        }
      } else {
        const text = $el.text().trim();
        if (text) {
          sections.push({ type: 'paragraph', content: text });
        }
      }
    });

  return sections;
}

// ---------------------------------------------------------------------------
// Core parsing function
// ---------------------------------------------------------------------------

/**
 * Parse an HTML string into a structured document using `cheerio`.
 *
 * @param raw    - Raw HTML markup.
 * @param source - Originating file path or URL (used in metadata).
 */
export function parseHtmlContent(raw: string, source: string): ParsedDocument {
  // cheerio is a CJS-only module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cheerio = require('cheerio') as typeof import('cheerio');
  const $ = cheerio.load(raw);

  // Remove non-content elements
  $('script, style, nav, footer, aside, noscript').remove();

  const title =
    $('title').text().trim() || $('h1').first().text().trim() || undefined;

  const sections = extractSections($);

  const content = normalizeText(sections.map((s) => s.content).join('\n\n'));

  return {
    format: 'html' as DocumentFormat,
    title,
    content,
    sections,
    metadata: {
      source,
      format: 'html',
      wordCount: countWords(content),
      characterCount: content.length,
      parsedAt: new Date(),
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read an HTML file from disk and return a structured document.
 *
 * @param source - Path to the `.html` / `.htm` file.
 */
export async function parseHtmlFile(source: string): Promise<ParsedDocument> {
  const raw = await readFile(source, 'utf-8');
  return parseHtmlContent(raw, source);
}

/**
 * Fetch a remote URL (HTTP/HTTPS) and parse the returned HTML.
 *
 * Supports plain HTML pages and Google Docs "export as HTML" links.
 *
 * @param url     - Full HTTP/HTTPS URL.
 * @param timeout - Maximum wait time in milliseconds (default 10 000 ms).
 */
export async function fetchAndParseHtml(
  url: string,
  timeout: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<ParsedDocument> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SemkiEst-SpecReader/1.0 (+https://semkiest.io)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} fetching ${url}`);
    }

    const raw = await response.text();
    return parseHtmlContent(raw, url);
  } finally {
    clearTimeout(timer);
  }
}
