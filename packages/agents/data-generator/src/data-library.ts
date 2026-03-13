import { parse as parseCsv } from 'csv-parse/sync';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A row in a dataset: maps column names to string values. */
export type DataRow = Record<string, string>;

/** A stored dataset with metadata. */
export interface Dataset {
  /** Unique dataset identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Project this dataset belongs to. */
  projectId: string;
  /** Dataset format. */
  format: 'csv' | 'json';
  /** Column headers (ordered). */
  headers: string[];
  /** Row data. */
  rows: DataRow[];
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-updated timestamp. */
  updatedAt: string;
}

/** Options for importing a dataset. */
export interface ImportOptions {
  /** Human-readable name for the dataset. */
  name: string;
  /** Project to associate the dataset with. */
  projectId: string;
  /**
   * For CSV imports: delimiter character. Defaults to `','`.
   */
  delimiter?: string;
}

/** Result of a dataset import. */
export interface ImportResult {
  success: boolean;
  datasetId?: string;
  rowCount?: number;
  error?: string;
}

/** Query options for listing datasets. */
export interface ListOptions {
  projectId?: string;
  format?: 'csv' | 'json';
}

// ---------------------------------------------------------------------------
// DataLibrary
// ---------------------------------------------------------------------------

/**
 * Per-project dataset library.
 *
 * Supports importing CSV and JSON datasets, persisting them in-memory with an
 * optional serialisation hook for durable storage (e.g. database or file
 * system). The in-memory store is keyed by dataset ID and indexed by projectId.
 *
 * ## Usage
 * ```ts
 * const lib = new DataLibrary();
 *
 * // Import from CSV string
 * const result = await lib.importCsv(csvString, { name: 'Users', projectId: 'proj-1' });
 *
 * // Retrieve rows
 * const dataset = lib.getDataset(result.datasetId!);
 * const rows = dataset?.rows ?? [];
 * ```
 */
export class DataLibrary {
  private readonly store = new Map<string, Dataset>();

  // ---- Import --------------------------------------------------------------

  /**
   * Import a CSV string into the library.
   *
   * @param csvContent - Raw CSV content as a string.
   * @param options    - Import options (name, projectId, delimiter).
   */
  async importCsv(csvContent: string, options: ImportOptions): Promise<ImportResult> {
    try {
      const records = parseCsv(csvContent, {
        columns: true,
        skip_empty_lines: true,
        delimiter: options.delimiter ?? ',',
        trim: true,
        cast: false,
      }) as DataRow[];

      if (records.length === 0) {
        return { success: false, error: 'CSV file contains no data rows.' };
      }

      const headers = Object.keys(records[0] ?? {});
      const dataset = this.createDataset(options, 'csv', headers, records);
      this.store.set(dataset.id, dataset);

      return { success: true, datasetId: dataset.id, rowCount: records.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `CSV parse error: ${message}` };
    }
  }

  /**
   * Import a JSON array (as a string or pre-parsed array) into the library.
   *
   * The JSON must be an array of objects where each object represents a row.
   *
   * @param jsonContent - Raw JSON string or already-parsed array.
   * @param options     - Import options (name, projectId).
   */
  async importJson(
    jsonContent: string | DataRow[],
    options: ImportOptions,
  ): Promise<ImportResult> {
    try {
      const parsed: unknown =
        typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;

      if (!Array.isArray(parsed)) {
        return {
          success: false,
          error: 'JSON content must be an array of objects.',
        };
      }

      if (parsed.length === 0) {
        return { success: false, error: 'JSON array contains no records.' };
      }

      const rows: DataRow[] = parsed.map((item, idx) => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
          throw new Error(`Row at index ${idx} is not an object.`);
        }
        const row: DataRow = {};
        for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
          row[k] = v === null || v === undefined ? '' : String(v);
        }
        return row;
      });

      const headers = Object.keys(rows[0] ?? {});
      const dataset = this.createDataset(options, 'json', headers, rows);
      this.store.set(dataset.id, dataset);

      return { success: true, datasetId: dataset.id, rowCount: rows.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `JSON parse error: ${message}` };
    }
  }

  // ---- Read ----------------------------------------------------------------

  /**
   * Retrieve a dataset by ID. Returns `undefined` if not found.
   */
  getDataset(id: string): Dataset | undefined {
    return this.store.get(id);
  }

  /**
   * List all datasets, optionally filtered by project and/or format.
   */
  listDatasets(options: ListOptions = {}): Dataset[] {
    const all = Array.from(this.store.values());

    return all.filter((ds) => {
      if (options.projectId && ds.projectId !== options.projectId) return false;
      if (options.format && ds.format !== options.format) return false;
      return true;
    });
  }

  /**
   * Return the rows for a given dataset, or an empty array if not found.
   */
  getRows(datasetId: string): DataRow[] {
    return this.store.get(datasetId)?.rows ?? [];
  }

  /**
   * Return a random sample of `count` rows from a dataset (without replacement
   * if `count` ≤ total rows, otherwise with replacement).
   */
  sampleRows(datasetId: string, count: number): DataRow[] {
    const rows = this.getRows(datasetId);
    if (rows.length === 0) return [];

    const result: DataRow[] = [];
    const indices = new Set<number>();

    if (count >= rows.length) {
      // Return all rows (shuffled).
      return [...rows].sort(() => Math.random() - 0.5);
    }

    while (indices.size < count) {
      indices.add(Math.floor(Math.random() * rows.length));
    }

    for (const idx of indices) {
      const row = rows[idx];
      if (row !== undefined) result.push(row);
    }

    return result;
  }

  // ---- Write / Delete ------------------------------------------------------

  /**
   * Update the metadata (name) of an existing dataset.
   * Returns `false` if the dataset does not exist.
   */
  updateDatasetName(id: string, name: string): boolean {
    const existing = this.store.get(id);
    if (!existing) return false;

    this.store.set(id, {
      ...existing,
      name,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  /**
   * Delete a dataset by ID.
   * Returns `true` if deleted, `false` if not found.
   */
  deleteDataset(id: string): boolean {
    return this.store.delete(id);
  }

  /**
   * Delete all datasets belonging to a project.
   * Returns the number of deleted datasets.
   */
  deleteProjectDatasets(projectId: string): number {
    const toDelete = this.listDatasets({ projectId }).map((ds) => ds.id);
    for (const id of toDelete) {
      this.store.delete(id);
    }
    return toDelete.length;
  }

  // ---- Serialisation -------------------------------------------------------

  /**
   * Export all datasets as a JSON-serialisable object.
   * Useful for persisting the library to a database or file.
   */
  export(): Record<string, Dataset> {
    const result: Record<string, Dataset> = {};
    for (const [id, ds] of this.store) {
      result[id] = ds;
    }
    return result;
  }

  /**
   * Restore the library from a previously exported snapshot.
   * Existing entries are preserved unless they share an ID.
   */
  import(snapshot: Record<string, Dataset>): void {
    for (const [id, ds] of Object.entries(snapshot)) {
      this.store.set(id, ds);
    }
  }

  /** Total number of datasets in the library. */
  get size(): number {
    return this.store.size;
  }

  // ---- Private helpers -----------------------------------------------------

  private createDataset(
    options: ImportOptions,
    format: 'csv' | 'json',
    headers: string[],
    rows: DataRow[],
  ): Dataset {
    const now = new Date().toISOString();
    return {
      id: this.generateId(),
      name: options.name,
      projectId: options.projectId,
      format,
      headers,
      rows,
      createdAt: now,
      updatedAt: now,
    };
  }

  /** Simple collision-resistant ID generator (no external dependency). */
  private generateId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 9);
    return `ds_${ts}_${rand}`;
  }
}
