/**
 * DataLibraryService
 *
 * Manages per-project persistent data libraries stored in the database.
 * Provides data set versioning, tagging, baseline designation, and rollback.
 * All mutating operations emit an immutable audit log entry.
 */

import crypto from 'crypto';
import {
  type DataLibrary,
  type DataSet,
  type AuditLog,
  type DataFormat,
  type DataLibraryRepository,
  type CreateAuditLogInput,
} from './types';

// ─── Public result types ──────────────────────────────────────────────────────

export interface CreateLibraryResult {
  library: DataLibrary;
  auditLog: AuditLog;
}

export interface ImportDataSetResult {
  dataSet: DataSet;
  auditLog: AuditLog;
}

export interface CreateVersionResult {
  dataSet: DataSet;
  auditLog: AuditLog;
}

export interface RollbackResult {
  restored: DataSet;
  auditLog: AuditLog;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Manages the lifecycle of data libraries and data sets for test data management.
 *
 * Designed with a repository interface so it can be used with any persistence
 * layer (Prisma, in-memory for tests, etc.).
 */
export class DataLibraryService {
  constructor(private readonly repo: DataLibraryRepository) {}

  // ── Library operations ────────────────────────────────────────────────────

  /**
   * Creates a new data library for a project.
   * Each project may have at most one library; call findLibrary first if unsure.
   */
  async createLibrary(
    projectId: string,
    name: string,
    description?: string,
    actor?: string,
  ): Promise<CreateLibraryResult> {
    const library = await this.repo.createLibrary({ projectId, name, description });

    const logInput: CreateAuditLogInput = {
      projectId,
      action: 'LIBRARY_CREATE',
      actor,
      after: { libraryId: library.id, name, description },
    };
    const auditLog = await this.repo.createAuditLog(logInput);

    return { library, auditLog };
  }

  /**
   * Returns the library associated with a project, or null if none exists.
   */
  async findLibrary(projectId: string): Promise<DataLibrary | null> {
    return this.repo.findLibraryByProjectId(projectId);
  }

  /**
   * Returns the library associated with a project, creating one if necessary.
   */
  async getOrCreateLibrary(
    projectId: string,
    defaultName = 'Default Library',
    actor?: string,
  ): Promise<DataLibrary> {
    const existing = await this.repo.findLibraryByProjectId(projectId);
    if (existing !== null) {
      return existing;
    }
    const { library } = await this.createLibrary(projectId, defaultName, undefined, actor);
    return library;
  }

  // ── Data set import ───────────────────────────────────────────────────────

  /**
   * Imports a new data set (version 1) into the given library.
   *
   * @param libraryId  - Target library ID
   * @param name       - Human-readable name; must be unique within the library
   * @param format     - Source format (CSV | JSON | SQL)
   * @param content    - Pre-parsed content (use ImportHandler to obtain this)
   * @param tags       - Optional classification tags
   * @param actor      - Optional identity of the actor for audit trail
   */
  async importDataSet(
    libraryId: string,
    name: string,
    format: DataFormat,
    content: unknown,
    tags: string[] = [],
    actor?: string,
  ): Promise<ImportDataSetResult> {
    const checksum = this.computeChecksum(content);

    const dataSet = await this.repo.createDataSet({
      libraryId,
      name,
      version: 1,
      tags,
      format,
      content,
      checksum,
      isBaseline: false,
    });

    const library = await this.repo.findLibraryById(libraryId);
    const projectId = library?.projectId ?? libraryId;

    const auditLog = await this.repo.createAuditLog({
      projectId,
      dataSetId: dataSet.id,
      action: 'DATASET_IMPORT',
      actor,
      after: {
        dataSetId: dataSet.id,
        name,
        format,
        version: 1,
        tags,
        checksum,
      },
    });

    return { dataSet, auditLog };
  }

  // ── Versioning ────────────────────────────────────────────────────────────

  /**
   * Creates a new version of an existing data set.
   * The previous version record is preserved; a new record with an incremented
   * version number is created.
   */
  async createVersion(
    existingDataSetId: string,
    newContent: unknown,
    actor?: string,
  ): Promise<CreateVersionResult> {
    const existing = await this.repo.findDataSetById(existingDataSetId);
    if (existing === null) {
      throw new Error(`DataSet not found: ${existingDataSetId}`);
    }

    const latest = await this.repo.findLatestDataSetVersion(
      existing.libraryId,
      existing.name,
    );
    const nextVersion = (latest?.version ?? existing.version) + 1;

    const checksum = this.computeChecksum(newContent);

    const newDataSet = await this.repo.createDataSet({
      libraryId: existing.libraryId,
      name: existing.name,
      version: nextVersion,
      tags: [...existing.tags],
      format: existing.format,
      content: newContent,
      checksum,
      isBaseline: false,
    });

    const library = await this.repo.findLibraryById(existing.libraryId);
    const projectId = library?.projectId ?? existing.libraryId;

    const auditLog = await this.repo.createAuditLog({
      projectId,
      dataSetId: newDataSet.id,
      action: 'DATASET_VERSION_CREATE',
      actor,
      before: { dataSetId: existingDataSetId, version: existing.version },
      after: { dataSetId: newDataSet.id, version: nextVersion, checksum },
    });

    return { dataSet: newDataSet, auditLog };
  }

  // ── Tagging ───────────────────────────────────────────────────────────────

  /**
   * Replaces the tag list of a data set.
   * Pass an empty array to clear all tags.
   */
  async setTags(
    dataSetId: string,
    tags: string[],
    actor?: string,
  ): Promise<{ dataSet: DataSet; auditLog: AuditLog }> {
    const existing = await this.repo.findDataSetById(dataSetId);
    if (existing === null) {
      throw new Error(`DataSet not found: ${dataSetId}`);
    }

    const dataSet = await this.repo.updateDataSetTags(dataSetId, tags);

    const library = await this.repo.findLibraryById(existing.libraryId);
    const projectId = library?.projectId ?? existing.libraryId;

    const auditLog = await this.repo.createAuditLog({
      projectId,
      dataSetId,
      action: 'DATASET_TAG',
      actor,
      before: { tags: existing.tags },
      after: { tags },
    });

    return { dataSet, auditLog };
  }

  // ── Baseline management ───────────────────────────────────────────────────

  /**
   * Designates a data set version as the baseline for its library.
   * The cleanup service will restore to this version during environment resets.
   * Any previously designated baseline is replaced.
   */
  async setBaseline(
    dataSetId: string,
    actor?: string,
  ): Promise<{ dataSet: DataSet; auditLog: AuditLog }> {
    const existing = await this.repo.findDataSetById(dataSetId);
    if (existing === null) {
      throw new Error(`DataSet not found: ${dataSetId}`);
    }

    const dataSet = await this.repo.setDataSetBaseline(existing.libraryId, dataSetId);

    const library = await this.repo.findLibraryById(existing.libraryId);
    const projectId = library?.projectId ?? existing.libraryId;

    const auditLog = await this.repo.createAuditLog({
      projectId,
      dataSetId,
      action: 'DATASET_BASELINE_SET',
      actor,
      after: { dataSetId, name: existing.name, version: existing.version },
    });

    return { dataSet, auditLog };
  }

  // ── Rollback ──────────────────────────────────────────────────────────────

  /**
   * Rolls back to a specific version of a named data set.
   * Creates a new version record with the content of the target version so the
   * audit trail is never mutated.
   *
   * @param libraryId     - Library that owns the data set
   * @param name          - Data set name
   * @param targetVersion - Version number to restore
   * @param actor         - Optional identity for audit trail
   */
  async rollback(
    libraryId: string,
    name: string,
    targetVersion: number,
    actor?: string,
  ): Promise<RollbackResult> {
    const target = await this.repo.findDataSetByVersion(libraryId, name, targetVersion);
    if (target === null) {
      throw new Error(
        `DataSet version not found: ${name} v${targetVersion} in library ${libraryId}`,
      );
    }

    const latest = await this.repo.findLatestDataSetVersion(libraryId, name);
    const nextVersion = (latest?.version ?? targetVersion) + 1;

    const restored = await this.repo.createDataSet({
      libraryId,
      name,
      version: nextVersion,
      tags: [...target.tags],
      format: target.format,
      content: target.content,
      checksum: target.checksum,
      isBaseline: false,
    });

    const library = await this.repo.findLibraryById(libraryId);
    const projectId = library?.projectId ?? libraryId;

    const auditLog = await this.repo.createAuditLog({
      projectId,
      dataSetId: restored.id,
      action: 'DATASET_ROLLBACK',
      actor,
      before: { restoredFromVersion: targetVersion, restoredFromId: target.id },
      after: { newVersion: nextVersion, newDataSetId: restored.id },
    });

    return { restored, auditLog };
  }

  // ── Query helpers ─────────────────────────────────────────────────────────

  /**
   * Lists all data sets in a library, optionally filtered by tags.
   * Returns only the latest version of each named data set.
   */
  async listDataSets(libraryId: string, tags?: string[]): Promise<DataSet[]> {
    const all = await this.repo.findDataSetsByLibrary(libraryId, tags);

    // Group by name and keep only the highest version
    const latestByName = new Map<string, DataSet>();
    for (const ds of all) {
      const existing = latestByName.get(ds.name);
      if (existing === undefined || ds.version > existing.version) {
        latestByName.set(ds.name, ds);
      }
    }

    return Array.from(latestByName.values());
  }

  /**
   * Returns the complete version history of a named data set, sorted ascending.
   */
  async listVersions(libraryId: string, name: string): Promise<DataSet[]> {
    const all = await this.repo.findDataSetsByLibrary(libraryId);
    return all
      .filter((ds) => ds.name === name)
      .sort((a, b) => a.version - b.version);
  }

  /** Returns the full audit trail for a project. */
  async getAuditLogs(projectId: string, limit?: number): Promise<AuditLog[]> {
    return this.repo.findAuditLogsByProject(projectId, limit);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Computes a SHA-256 checksum of the serialised content for integrity
   * verification. Uses a stable JSON serialisation so equivalent objects
   * produce the same digest.
   */
  private computeChecksum(content: unknown): string {
    const serialised = JSON.stringify(content, Object.keys(content as object).sort());
    return crypto.createHash('sha256').update(serialised, 'utf8').digest('hex');
  }
}
