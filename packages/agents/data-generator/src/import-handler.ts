/**
 * ImportHandler
 *
 * Parses raw content from supported formats (CSV, JSON, SQL) into a normalised
 * representation suitable for storage in the data library.
 *
 * Design goals:
 *  - No external runtime dependencies (uses Node.js built-ins only)
 *  - Strict TypeScript — no `any` types
 *  - Configurable field mapping for CSV imports
 *  - Safe SQL parsing: only DML statements are allowed by default
 */

import { type CsvRow, type DataFormat } from './types';

// ─── Result / error types ─────────────────────────────────────────────────────

export interface ImportResult<T = unknown> {
  format: DataFormat;
  rowCount: number;
  data: T;
  /** Warnings encountered during parsing (non-fatal). */
  warnings: string[];
}

export interface CsvImportOptions {
  /**
   * Optional mapping from source column names to target column names.
   * Columns absent from the mapping are kept as-is.
   * Set a column's mapped name to `null` to drop it entirely.
   */
  fieldMapping?: Record<string, string | null>;
  /** Column delimiter. Defaults to `','`. */
  delimiter?: string;
  /** Whether the first row is a header row. Defaults to `true`. */
  hasHeader?: boolean;
  /** Custom header names when `hasHeader` is `false`. */
  headers?: string[];
}

export interface SqlImportOptions {
  /**
   * Whether to allow DDL statements (CREATE, ALTER, DROP …).
   * Defaults to `false` — DDL is rejected for safety.
   */
  allowDdl?: boolean;
}

// ─── Helper: CSV parser ───────────────────────────────────────────────────────

/**
 * Minimal RFC 4180-compliant CSV parser.
 * Handles quoted fields, embedded quotes (doubled), and CRLF / LF line endings.
 */
function parseCsv(
  raw: string,
  delimiter = ',',
): string[][] {
  const rows: string[][] = [];
  const del = delimiter[0] ?? ',';
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];

    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          // Escaped quote inside quoted field
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === del) {
        row.push(field);
        field = '';
        i++;
      } else if (ch === '\r' && raw[i + 1] === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i += 2;
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Flush last row (no trailing newline)
  if (row.length > 0 || field.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

// ─── Helper: SQL statement splitter ──────────────────────────────────────────

const DDL_PATTERN = /^\s*(CREATE|ALTER|DROP|TRUNCATE|RENAME)\s/i;
const ALLOWED_DML_PATTERN = /^\s*(INSERT|UPDATE|DELETE|SELECT|WITH)\s/i;
const COMMENT_PATTERN = /^--.*$/gm;
const BLOCK_COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;

/**
 * Splits a SQL dump into individual statements (split on `;`) and
 * strips line/block comments.
 */
function splitSqlStatements(raw: string): string[] {
  const stripped = raw
    .replace(BLOCK_COMMENT_PATTERN, '')
    .replace(COMMENT_PATTERN, '');

  return stripped
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ─── ImportHandler ────────────────────────────────────────────────────────────

/**
 * Stateless import handler.  All methods return an `ImportResult` containing
 * the parsed data and any non-fatal warnings.
 */
export class ImportHandler {
  // ── CSV ──────────────────────────────────────────────────────────────────

  /**
   * Parses a CSV string into an array of `CsvRow` objects.
   *
   * @param content  - Raw CSV text
   * @param options  - Field mapping, delimiter, header configuration
   */
  importCSV(content: string, options: CsvImportOptions = {}): ImportResult<CsvRow[]> {
    const { fieldMapping, delimiter = ',', hasHeader = true, headers } = options;
    const warnings: string[] = [];

    const rawRows = parseCsv(content.trim(), delimiter);
    if (rawRows.length === 0) {
      return { format: 'CSV', rowCount: 0, data: [], warnings };
    }

    let columnNames: string[];

    if (hasHeader) {
      const headerRow = rawRows[0];
      if (headerRow === undefined || headerRow.length === 0) {
        warnings.push('Header row is empty; no columns detected.');
        return { format: 'CSV', rowCount: 0, data: [], warnings };
      }
      columnNames = headerRow.map((h) => h.trim());
    } else if (headers !== undefined && headers.length > 0) {
      columnNames = headers;
    } else {
      // Auto-generate column names (col0, col1, …)
      const firstRow = rawRows[0];
      columnNames = (firstRow ?? []).map((_, idx) => `col${idx}`);
    }

    const dataRows = hasHeader ? rawRows.slice(1) : rawRows;

    const rows: CsvRow[] = dataRows
      .filter((row) => !(row.length === 1 && row[0] === ''))
      .map((row, rowIdx) => {
        if (row.length !== columnNames.length) {
          warnings.push(
            `Row ${rowIdx + 1} has ${row.length} fields but header has ${columnNames.length}; padding with empty strings.`,
          );
        }

        const entry: CsvRow = {};
        for (let colIdx = 0; colIdx < columnNames.length; colIdx++) {
          const rawName = columnNames[colIdx] ?? `col${colIdx}`;
          const rawValue = row[colIdx] ?? '';

          if (fieldMapping !== undefined) {
            const mapped = fieldMapping[rawName];
            if (mapped === null) {
              continue; // Drop this column
            }
            entry[mapped ?? rawName] = rawValue;
          } else {
            entry[rawName] = rawValue;
          }
        }
        return entry;
      });

    return {
      format: 'CSV',
      rowCount: rows.length,
      data: rows,
      warnings,
    };
  }

  // ── JSON ─────────────────────────────────────────────────────────────────

  /**
   * Parses a JSON string, preserving the original structure.
   *
   * Accepts any valid JSON value (object, array, primitives).
   */
  importJSON(content: string): ImportResult<unknown> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content) as unknown;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid JSON: ${message}`);
    }

    const rowCount = Array.isArray(parsed) ? parsed.length : 1;

    return {
      format: 'JSON',
      rowCount,
      data: parsed,
      warnings: [],
    };
  }

  // ── SQL ──────────────────────────────────────────────────────────────────

  /**
   * Parses a SQL dump, splitting it into individual statements.
   *
   * By default, DDL statements are rejected for safety so accidental schema
   * mutations in production databases are prevented.  Pass `{ allowDdl: true }`
   * to permit DDL (e.g. when importing into a freshly created test schema).
   *
   * @param content  - Raw SQL dump text
   * @param options  - `allowDdl` flag
   */
  importSQL(content: string, options: SqlImportOptions = {}): ImportResult<string[]> {
    const { allowDdl = false } = options;
    const warnings: string[] = [];
    const statements = splitSqlStatements(content);

    if (statements.length === 0) {
      return { format: 'SQL', rowCount: 0, data: [], warnings };
    }

    const accepted: string[] = [];

    for (const stmt of statements) {
      const isDdl = DDL_PATTERN.test(stmt);
      const isDml = ALLOWED_DML_PATTERN.test(stmt);

      if (isDdl && !allowDdl) {
        warnings.push(
          `DDL statement skipped (set allowDdl:true to permit): ${stmt.slice(0, 80)}…`,
        );
        continue;
      }

      if (!isDdl && !isDml) {
        warnings.push(
          `Unrecognised statement type skipped: ${stmt.slice(0, 80)}…`,
        );
        continue;
      }

      accepted.push(stmt);
    }

    return {
      format: 'SQL',
      rowCount: accepted.length,
      data: accepted,
      warnings,
    };
  }

  // ── Generic dispatcher ────────────────────────────────────────────────────

  /**
   * Dispatches to the appropriate import method based on `format`.
   *
   * @param format  - Target format
   * @param content - Raw string content
   * @param options - Format-specific options (CSV or SQL)
   */
  import(
    format: DataFormat,
    content: string,
    options: CsvImportOptions & SqlImportOptions = {},
  ): ImportResult<unknown> {
    switch (format) {
      case 'CSV':
        return this.importCSV(content, options);
      case 'JSON':
        return this.importJSON(content);
      case 'SQL':
        return this.importSQL(content, options);
      default: {
        const exhaustive: never = format;
        throw new Error(`Unsupported format: ${String(exhaustive)}`);
      }
    }
  }
}
