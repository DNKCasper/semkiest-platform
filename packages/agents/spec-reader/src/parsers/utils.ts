import { DocumentFormat } from '../types';

/**
 * Normalise raw text by standardising line endings, collapsing excessive
 * blank lines, and stripping trailing whitespace on each line.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n') // CRLF → LF
    .replace(/\r/g, '\n') // bare CR → LF
    .replace(/\t/g, '  ') // tabs → two spaces
    .replace(/[ \t]+$/gm, '') // trailing spaces on each line
    .replace(/\n{3,}/g, '\n\n') // collapse 3+ blank lines to 2
    .trim();
}

/**
 * Count the approximate number of words in a string by splitting on
 * one-or-more whitespace characters.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Strip HTML tags and decode basic HTML entities from a string.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Auto-detect a document's format from its file path or URL.
 *
 * Precedence:
 *  1. `.md` / `.mdx`  → markdown
 *  2. `.pdf`          → pdf
 *  3. `.docx`         → docx
 *  4. `.html` / `.htm`→ html
 *  5. `http(s)://`    → html  (remote URL)
 *  6. anything else   → text
 */
export function detectFormat(source: string): DocumentFormat {
  const lower = source.toLowerCase();

  if (lower.endsWith('.md') || lower.endsWith('.mdx')) return 'markdown';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.startsWith('http://') || lower.startsWith('https://')) return 'html';
  return 'text';
}

/** The set of document formats that the agent supports. */
export const SUPPORTED_FORMATS = new Set<DocumentFormat>([
  'markdown',
  'pdf',
  'docx',
  'html',
  'text',
]);

/**
 * Return true when `source` is an HTTP/HTTPS URL.
 */
export function isUrl(source: string): boolean {
  return source.startsWith('http://') || source.startsWith('https://');
}
