/**
 * Supported document input formats for the SpecReaderAgent.
 */
export type DocumentFormat = 'markdown' | 'pdf' | 'docx' | 'html' | 'text';

/**
 * Semantic classification of a parsed document section.
 * Used to categorise content extracted from spec documents.
 */
export type SectionType =
  | 'requirement'
  | 'acceptance-criteria'
  | 'user-story'
  | 'feature'
  | 'functional-spec'
  | 'non-functional-req'
  | 'heading'
  | 'paragraph'
  | 'code-block'
  | 'table'
  | 'list';

/**
 * A discrete section extracted from a parsed document.
 */
export interface DocumentSection {
  /** Semantic classification of this section */
  type: SectionType;
  /** Optional heading/title for the section */
  title?: string;
  /** Normalised text content of the section */
  content: string;
  /** Heading level (1–6) for heading sections */
  level?: number;
  /** Individual list items when type === 'list' */
  items?: string[];
}

/**
 * Metadata describing the parsed document's origin and statistics.
 */
export interface DocumentMetadata {
  /** Original source path or URL */
  source: string;
  /** Detected or specified document format */
  format: DocumentFormat;
  /** Character encoding used when reading the file */
  encoding?: string;
  /** Number of pages (PDF only) */
  pageCount?: number;
  /** Approximate word count of the normalised content */
  wordCount: number;
  /** Character count of the normalised content */
  characterCount: number;
  /** Timestamp when parsing completed */
  parsedAt: Date;
}

/**
 * Fully parsed and normalised document ready for LLM analysis.
 */
export interface ParsedDocument {
  /** Format of the source document */
  format: DocumentFormat;
  /** Document title, if detectable */
  title?: string;
  /** Full normalised text content */
  content: string;
  /** Ordered list of extracted sections */
  sections: DocumentSection[];
  /** Metadata about the document and parsing process */
  metadata: DocumentMetadata;
}

/**
 * Options that control how a document is ingested.
 */
export interface IngestionOptions {
  /**
   * Whether to classify sections by type.
   * Defaults to true.
   */
  extractSections?: boolean;
  /**
   * Text encoding for file reads (text/html/markdown).
   * Defaults to 'utf-8'.
   */
  encoding?: BufferEncoding;
  /**
   * Network timeout in milliseconds for URL fetches.
   * Defaults to 10 000 ms.
   */
  timeout?: number;
}

/**
 * Describes a single document ingestion request.
 */
export interface IngestionInput {
  /** File path or URL to ingest */
  source: string;
  /**
   * Explicit document format.
   * Auto-detected from the source extension/URL scheme when omitted.
   */
  format?: DocumentFormat;
  /** Optional per-document ingestion options */
  options?: IngestionOptions;
}

/**
 * Result of ingesting a single document.
 */
export interface IngestionResult {
  /** Whether parsing succeeded */
  success: boolean;
  /** The parsed document (present when success === true) */
  document?: ParsedDocument;
  /** Human-readable error message (present when success === false) */
  error?: string;
  /** The original source that was processed */
  source: string;
}

/**
 * Aggregated result of a batch ingestion operation.
 */
export interface BatchIngestionResult {
  /** Individual results in the same order as the input array */
  results: IngestionResult[];
  /** Number of documents parsed successfully */
  successCount: number;
  /** Number of documents that failed to parse */
  failureCount: number;
  /** Total number of documents processed */
  totalProcessed: number;
}

/** Union type accepted by SpecReaderAgent.execute() */
export type SpecReaderInput = IngestionInput | IngestionInput[];

/** Union type returned by SpecReaderAgent.execute() */
export type SpecReaderOutput = IngestionResult | BatchIngestionResult;
