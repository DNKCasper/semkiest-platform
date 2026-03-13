import { readFile } from 'fs/promises';
import { DocumentFormat, DocumentSection, ParsedDocument } from '../types';
import { normalizeText, countWords } from './utils';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read a plain-text file and return a structured document.
 *
 * The entire normalised content is represented as a single paragraph section.
 * No further structural parsing is applied to plain text.
 *
 * @param source   - Path to the `.txt` (or other plain-text) file.
 * @param encoding - File encoding (defaults to `'utf-8'`).
 */
export async function parseTextFile(
  source: string,
  encoding: BufferEncoding = 'utf-8',
): Promise<ParsedDocument> {
  const raw = await readFile(source, encoding);
  return parseTextContent(raw, source, encoding);
}

/**
 * Parse a plain-text string that has already been loaded into memory.
 *
 * @param raw      - Raw text content.
 * @param source   - Originating path or identifier (used in metadata).
 * @param encoding - Encoding used when reading the source file.
 */
export function parseTextContent(
  raw: string,
  source: string,
  encoding: BufferEncoding = 'utf-8',
): ParsedDocument {
  const content = normalizeText(raw);

  const sections: DocumentSection[] = content
    ? [{ type: 'paragraph', content }]
    : [];

  return {
    format: 'text' as DocumentFormat,
    content,
    sections,
    metadata: {
      source,
      format: 'text',
      encoding,
      wordCount: countWords(content),
      characterCount: content.length,
      parsedAt: new Date(),
    },
  };
}
