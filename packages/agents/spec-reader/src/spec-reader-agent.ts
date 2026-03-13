import { BaseAgent } from '@semkiest/agents-base';
import {
  BatchIngestionResult,
  DocumentFormat,
  IngestionInput,
  IngestionResult,
  ParsedDocument,
  SpecReaderInput,
  SpecReaderOutput,
} from './types';
import { parseMarkdownFile } from './parsers/markdown';
import { parsePdfFile } from './parsers/pdf';
import { parseDocxFile } from './parsers/docx';
import { fetchAndParseHtml, parseHtmlFile } from './parsers/html';
import { parseTextFile } from './parsers/text';
import { detectFormat, isUrl, SUPPORTED_FORMATS } from './parsers/utils';

// ---------------------------------------------------------------------------
// SpecReaderAgent
// ---------------------------------------------------------------------------

/**
 * Agent responsible for ingesting and parsing specification documents.
 *
 * Supported input formats: Markdown, PDF, DOCX, HTML (files + URLs), plain text.
 *
 * Usage (single document):
 * ```ts
 * const agent = new SpecReaderAgent();
 * const result = await agent.execute({ source: './spec.md' });
 * ```
 *
 * Usage (batch):
 * ```ts
 * const result = await agent.execute([
 *   { source: './spec.md' },
 *   { source: './requirements.pdf' },
 *   { source: 'https://docs.google.com/…', format: 'html' },
 * ]);
 * ```
 */
export class SpecReaderAgent extends BaseAgent<SpecReaderInput, SpecReaderOutput> {
  constructor() {
    super({ name: 'SpecReaderAgent', version: '1.0.0' });
  }

  // ---------------------------------------------------------------------------
  // BaseAgent implementation
  // ---------------------------------------------------------------------------

  /**
   * Execute the agent.
   *
   * - When given a single `IngestionInput`, returns an `IngestionResult`.
   * - When given an `IngestionInput[]`, returns a `BatchIngestionResult`.
   */
  async execute(input: SpecReaderInput): Promise<SpecReaderOutput> {
    if (Array.isArray(input)) {
      return this.ingestBatch(input);
    }
    return this.ingest(input);
  }

  // ---------------------------------------------------------------------------
  // Public helpers
  // ---------------------------------------------------------------------------

  /**
   * Ingest a single document.
   *
   * Format auto-detection: the `format` field is optional; if omitted the
   * agent will infer the format from the file extension or URL scheme.
   */
  async ingest(input: IngestionInput): Promise<IngestionResult> {
    const { source, format, options } = input;
    const resolvedFormat: DocumentFormat = format ?? detectFormat(source);

    if (!SUPPORTED_FORMATS.has(resolvedFormat)) {
      return {
        success: false,
        source,
        error: [
          `Unsupported format "${resolvedFormat}".`,
          `Supported formats: ${[...SUPPORTED_FORMATS].join(', ')}.`,
        ].join(' '),
      };
    }

    try {
      const document = await this.parse(source, resolvedFormat, options?.timeout);
      return { success: true, source, document };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, source, error: message };
    }
  }

  /**
   * Ingest multiple documents concurrently and aggregate the results.
   *
   * Documents are processed in parallel; failures do not stop other ingestions.
   */
  async ingestBatch(inputs: IngestionInput[]): Promise<BatchIngestionResult> {
    const results = await Promise.all(inputs.map((input) => this.ingest(input)));
    const successCount = results.filter((r) => r.success).length;

    return {
      results,
      successCount,
      failureCount: results.length - successCount,
      totalProcessed: results.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Private routing
  // ---------------------------------------------------------------------------

  private async parse(
    source: string,
    format: DocumentFormat,
    timeout?: number,
  ): Promise<ParsedDocument> {
    switch (format) {
      case 'markdown':
        return parseMarkdownFile(source);

      case 'pdf':
        return parsePdfFile(source);

      case 'docx':
        return parseDocxFile(source);

      case 'html':
        return isUrl(source)
          ? fetchAndParseHtml(source, timeout)
          : parseHtmlFile(source);

      case 'text':
        return parseTextFile(source);
    }
  }
}
