import { readFile } from 'fs/promises';
import { DocumentFormat, DocumentSection, ParsedDocument } from '../types';
import { normalizeText, countWords } from './utils';

// ---------------------------------------------------------------------------
// mammoth type shim
// mammoth ships its own type declarations, but we only need the subset below.
// ---------------------------------------------------------------------------

interface MammothResult {
  value: string;
  messages: Array<{ type: string; message: string }>;
}

interface MammothModule {
  extractRawText(options: { buffer: Buffer }): Promise<MammothResult>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a DOCX file and return a structured document.
 *
 * Raw text is extracted via `mammoth` and then normalised. The full text is
 * returned as a single paragraph section; more granular section extraction
 * can be layered on top when needed.
 *
 * @param source - Path to the `.docx` file on disk.
 */
export async function parseDocxFile(source: string): Promise<ParsedDocument> {
  // mammoth is a CJS-only module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require('mammoth') as MammothModule;

  const buffer = await readFile(source);
  const result = await mammoth.extractRawText({ buffer });

  const content = normalizeText(result.value);

  const sections: DocumentSection[] = content
    ? [{ type: 'paragraph', content }]
    : [];

  return {
    format: 'docx' as DocumentFormat,
    content,
    sections,
    metadata: {
      source,
      format: 'docx',
      wordCount: countWords(content),
      characterCount: content.length,
      parsedAt: new Date(),
    },
  };
}
