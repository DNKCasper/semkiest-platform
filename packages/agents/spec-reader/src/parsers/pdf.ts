import { readFile } from 'fs/promises';
import { DocumentFormat, DocumentSection, ParsedDocument } from '../types';
import { normalizeText, countWords } from './utils';

// ---------------------------------------------------------------------------
// pdf-parse type shim
// pdf-parse ships a CommonJS module without bundled type declarations.
// We declare only the subset we need here.
// ---------------------------------------------------------------------------

interface PdfData {
  /** Total number of pages in the document */
  numpages: number;
  /** Concatenated plain-text extracted from all pages */
  text: string;
  /** Document metadata (Title, Author, …) — keys vary by PDF producer */
  info: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a PDF file and return a structured document.
 *
 * Text is extracted via `pdf-parse` and then normalised.  The full extracted
 * text is returned as a single paragraph section; callers can apply further
 * section-splitting downstream if required.
 *
 * @param source - Path to the `.pdf` file on disk.
 */
export async function parsePdfFile(source: string): Promise<ParsedDocument> {
  // pdf-parse is a CJS-only module; we use require() to avoid ESM/CJS issues.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (
    dataBuffer: Buffer,
    options?: Record<string, unknown>,
  ) => Promise<PdfData>;

  const buffer = await readFile(source);
  const data = await pdfParse(buffer);

  const content = normalizeText(data.text);

  const titleFromInfo =
    typeof data.info?.['Title'] === 'string' && data.info['Title'].trim()
      ? (data.info['Title'] as string).trim()
      : undefined;

  const sections: DocumentSection[] = content
    ? [{ type: 'paragraph', content }]
    : [];

  return {
    format: 'pdf' as DocumentFormat,
    title: titleFromInfo,
    content,
    sections,
    metadata: {
      source,
      format: 'pdf',
      pageCount: data.numpages,
      wordCount: countWords(content),
      characterCount: content.length,
      parsedAt: new Date(),
    },
  };
}
