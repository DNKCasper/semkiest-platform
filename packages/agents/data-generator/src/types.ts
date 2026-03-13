/**
 * Domain types for the data-generator agent.
 * These mirror the Prisma schema and are used for dependency-injection-friendly
 * repository interfaces so services remain testable without a live database.
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

export type DataFormat = 'CSV' | 'JSON' | 'SQL';

export type AuditAction =
  | 'LIBRARY_CREATE'
  | 'DATASET_IMPORT'
  | 'DATASET_VERSION_CREATE'
  | 'DATASET_TAG'
  | 'DATASET_BASELINE_SET'
  | 'DATASET_ROLLBACK'
  | 'CLEANUP_EXECUTE'
  | 'CLEANUP_ROLLBACK';

// ─── Entity types ─────────────────────────────────────────────────────────────

export interface DataLibrary {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The `content` field stores format-specific parsed data:
 * - CSV  → `CsvRow[]`
 * - JSON → the original parsed JSON value
 * - SQL  → `string[]` (individual statements)
 */
export interface DataSet {
  id: string;
  libraryId: string;
  name: string;
  version: number;
  tags: string[];
  format: DataFormat;
  content: unknown;
  checksum: string;
  isBaseline: boolean;
  createdAt: Date;
}

export interface AuditLog {
  id: string;
  projectId: string;
  dataSetId: string | null;
  action: AuditAction;
  actor: string | null;
  before: unknown | null;
  after: unknown | null;
  metadata: unknown | null;
  createdAt: Date;
}

// ─── Repository input / output shapes ────────────────────────────────────────

export interface CreateLibraryInput {
  projectId: string;
  name: string;
  description?: string;
}

export interface CreateDataSetInput {
  libraryId: string;
  name: string;
  version: number;
  tags: string[];
  format: DataFormat;
  content: unknown;
  checksum: string;
  isBaseline?: boolean;
}

export interface CreateAuditLogInput {
  projectId: string;
  dataSetId?: string;
  action: AuditAction;
  actor?: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}

// ─── Repository interfaces ────────────────────────────────────────────────────

/** Persistence operations required by DataLibraryService. */
export interface DataLibraryRepository {
  createLibrary(input: CreateLibraryInput): Promise<DataLibrary>;
  findLibraryByProjectId(projectId: string): Promise<DataLibrary | null>;
  findLibraryById(id: string): Promise<DataLibrary | null>;

  createDataSet(input: CreateDataSetInput): Promise<DataSet>;
  findDataSetById(id: string): Promise<DataSet | null>;
  findDataSetsByLibrary(libraryId: string, tags?: string[]): Promise<DataSet[]>;
  findDataSetByVersion(
    libraryId: string,
    name: string,
    version: number,
  ): Promise<DataSet | null>;
  findLatestDataSetVersion(libraryId: string, name: string): Promise<DataSet | null>;
  updateDataSetTags(dataSetId: string, tags: string[]): Promise<DataSet>;
  setDataSetBaseline(libraryId: string, dataSetId: string): Promise<DataSet>;

  createAuditLog(input: CreateAuditLogInput): Promise<AuditLog>;
  findAuditLogsByProject(projectId: string, limit?: number): Promise<AuditLog[]>;
  findAuditLogsByDataSet(dataSetId: string): Promise<AuditLog[]>;
}

/** Persistence operations required by CleanupService. */
export interface CleanupRepository {
  findBaselineDataSet(libraryId: string): Promise<DataSet | null>;
  findLibraryByProjectId(projectId: string): Promise<DataLibrary | null>;
  createAuditLog(input: CreateAuditLogInput): Promise<AuditLog>;
}

// ─── CSV row type ─────────────────────────────────────────────────────────────

/** A single CSV row represented as key→value pairs. */
export type CsvRow = Record<string, string>;
