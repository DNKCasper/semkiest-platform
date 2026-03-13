import { DataLibraryService } from '../data-library-service';
import type {
  DataLibraryRepository,
  DataLibrary,
  DataSet,
  AuditLog,
  CreateLibraryInput,
  CreateDataSetInput,
  CreateAuditLogInput,
} from '../types';

// ─── In-memory repository stub ────────────────────────────────────────────────

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

function makeRepo(): DataLibraryRepository {
  const libraries = new Map<string, DataLibrary>();
  const dataSets = new Map<string, DataSet>();
  const auditLogs: AuditLog[] = [];

  return {
    async createLibrary(input: CreateLibraryInput): Promise<DataLibrary> {
      const lib: DataLibrary = {
        id: makeId(),
        projectId: input.projectId,
        name: input.name,
        description: input.description ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      libraries.set(lib.id, lib);
      return lib;
    },
    async findLibraryByProjectId(projectId: string): Promise<DataLibrary | null> {
      for (const lib of libraries.values()) {
        if (lib.projectId === projectId) return lib;
      }
      return null;
    },
    async findLibraryById(id: string): Promise<DataLibrary | null> {
      return libraries.get(id) ?? null;
    },
    async createDataSet(input: CreateDataSetInput): Promise<DataSet> {
      const ds: DataSet = {
        id: makeId(),
        libraryId: input.libraryId,
        name: input.name,
        version: input.version,
        tags: input.tags,
        format: input.format,
        content: input.content,
        checksum: input.checksum,
        isBaseline: input.isBaseline ?? false,
        createdAt: new Date(),
      };
      dataSets.set(ds.id, ds);
      return ds;
    },
    async findDataSetById(id: string): Promise<DataSet | null> {
      return dataSets.get(id) ?? null;
    },
    async findDataSetsByLibrary(libraryId: string, tags?: string[]): Promise<DataSet[]> {
      const results: DataSet[] = [];
      for (const ds of dataSets.values()) {
        if (ds.libraryId !== libraryId) continue;
        if (tags && !tags.every((t) => ds.tags.includes(t))) continue;
        results.push(ds);
      }
      return results;
    },
    async findDataSetByVersion(
      libraryId: string,
      name: string,
      version: number,
    ): Promise<DataSet | null> {
      for (const ds of dataSets.values()) {
        if (ds.libraryId === libraryId && ds.name === name && ds.version === version) {
          return ds;
        }
      }
      return null;
    },
    async findLatestDataSetVersion(
      libraryId: string,
      name: string,
    ): Promise<DataSet | null> {
      let latest: DataSet | null = null;
      for (const ds of dataSets.values()) {
        if (ds.libraryId === libraryId && ds.name === name) {
          if (latest === null || ds.version > latest.version) {
            latest = ds;
          }
        }
      }
      return latest;
    },
    async updateDataSetTags(dataSetId: string, tags: string[]): Promise<DataSet> {
      const ds = dataSets.get(dataSetId);
      if (!ds) throw new Error('DataSet not found');
      const updated = { ...ds, tags };
      dataSets.set(dataSetId, updated);
      return updated;
    },
    async setDataSetBaseline(libraryId: string, dataSetId: string): Promise<DataSet> {
      // Clear existing baseline in library
      for (const [id, ds] of dataSets.entries()) {
        if (ds.libraryId === libraryId && ds.isBaseline) {
          dataSets.set(id, { ...ds, isBaseline: false });
        }
      }
      const target = dataSets.get(dataSetId);
      if (!target) throw new Error('DataSet not found');
      const updated = { ...target, isBaseline: true };
      dataSets.set(dataSetId, updated);
      return updated;
    },
    async createAuditLog(input: CreateAuditLogInput): Promise<AuditLog> {
      const log: AuditLog = {
        id: makeId(),
        projectId: input.projectId,
        dataSetId: input.dataSetId ?? null,
        action: input.action,
        actor: input.actor ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
        metadata: input.metadata ?? null,
        createdAt: new Date(),
      };
      auditLogs.push(log);
      return log;
    },
    async findAuditLogsByProject(projectId: string, limit?: number): Promise<AuditLog[]> {
      const filtered = auditLogs.filter((l) => l.projectId === projectId);
      return limit !== undefined ? filtered.slice(0, limit) : filtered;
    },
    async findAuditLogsByDataSet(dataSetId: string): Promise<AuditLog[]> {
      return auditLogs.filter((l) => l.dataSetId === dataSetId);
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DataLibraryService', () => {
  let repo: DataLibraryRepository;
  let service: DataLibraryService;
  const projectId = 'proj-001';

  beforeEach(() => {
    repo = makeRepo();
    service = new DataLibraryService(repo);
  });

  // ── Library creation ───────────────────────────────────────────────────────

  describe('createLibrary', () => {
    it('creates a library and writes an audit log', async () => {
      const { library, auditLog } = await service.createLibrary(
        projectId,
        'My Library',
        'A test library',
        'user-1',
      );

      expect(library.projectId).toBe(projectId);
      expect(library.name).toBe('My Library');
      expect(library.description).toBe('A test library');
      expect(auditLog.action).toBe('LIBRARY_CREATE');
      expect(auditLog.actor).toBe('user-1');
    });
  });

  describe('getOrCreateLibrary', () => {
    it('creates a library on first call', async () => {
      const lib = await service.getOrCreateLibrary(projectId);
      expect(lib.projectId).toBe(projectId);
    });

    it('returns existing library on subsequent calls', async () => {
      const first = await service.getOrCreateLibrary(projectId);
      const second = await service.getOrCreateLibrary(projectId);
      expect(second.id).toBe(first.id);
    });
  });

  // ── Import ─────────────────────────────────────────────────────────────────

  describe('importDataSet', () => {
    it('imports a JSON data set at version 1', async () => {
      const lib = await service.getOrCreateLibrary(projectId);
      const content = [{ id: 1 }, { id: 2 }];

      const { dataSet, auditLog } = await service.importDataSet(
        lib.id,
        'users',
        'JSON',
        content,
        ['smoke'],
        'ci-bot',
      );

      expect(dataSet.name).toBe('users');
      expect(dataSet.version).toBe(1);
      expect(dataSet.format).toBe('JSON');
      expect(dataSet.tags).toEqual(['smoke']);
      expect(dataSet.checksum).toBeTruthy();
      expect(auditLog.action).toBe('DATASET_IMPORT');
      expect(auditLog.actor).toBe('ci-bot');
    });
  });

  // ── Versioning ─────────────────────────────────────────────────────────────

  describe('createVersion', () => {
    it('creates a new version with incremented number', async () => {
      const lib = await service.getOrCreateLibrary(projectId);
      const { dataSet: v1 } = await service.importDataSet(
        lib.id,
        'products',
        'JSON',
        [{ id: 1 }],
      );

      const { dataSet: v2 } = await service.createVersion(v1.id, [{ id: 1 }, { id: 2 }]);

      expect(v2.name).toBe('products');
      expect(v2.version).toBe(2);
      expect(v2.format).toBe('JSON');
    });

    it('throws if the source data set does not exist', async () => {
      await expect(service.createVersion('nonexistent', {})).rejects.toThrow(
        /DataSet not found/,
      );
    });

    it('increments version correctly for multiple versions', async () => {
      const lib = await service.getOrCreateLibrary(projectId);
      const { dataSet: v1 } = await service.importDataSet(lib.id, 'ds', 'JSON', []);
      const { dataSet: v2 } = await service.createVersion(v1.id, [1]);
      const { dataSet: v3 } = await service.createVersion(v2.id, [1, 2]);

      expect(v3.version).toBe(3);
    });
  });

  // ── Tagging ────────────────────────────────────────────────────────────────

  describe('setTags', () => {
    it('replaces tags and writes audit log', async () => {
      const lib = await service.getOrCreateLibrary(projectId);
      const { dataSet } = await service.importDataSet(lib.id, 'events', 'JSON', []);

      const { dataSet: updated, auditLog } = await service.setTags(
        dataSet.id,
        ['regression', 'nightly'],
      );

      expect(updated.tags).toEqual(['regression', 'nightly']);
      expect(auditLog.action).toBe('DATASET_TAG');
    });

    it('clears all tags when passed an empty array', async () => {
      const lib = await service.getOrCreateLibrary(projectId);
      const { dataSet } = await service.importDataSet(
        lib.id,
        'events2',
        'JSON',
        [],
        ['old-tag'],
      );

      const { dataSet: updated } = await service.setTags(dataSet.id, []);
      expect(updated.tags).toEqual([]);
    });
  });

  // ── Baseline ───────────────────────────────────────────────────────────────

  describe('setBaseline', () => {
    it('marks a data set as baseline', async () => {
      const lib = await service.getOrCreateLibrary(projectId);
      const { dataSet } = await service.importDataSet(lib.id, 'orders', 'JSON', []);

      const { dataSet: baseline, auditLog } = await service.setBaseline(dataSet.id);

      expect(baseline.isBaseline).toBe(true);
      expect(auditLog.action).toBe('DATASET_BASELINE_SET');
    });
  });

  // ── Rollback ───────────────────────────────────────────────────────────────

  describe('rollback', () => {
    it('creates a new version with the content of the target version', async () => {
      const lib = await service.getOrCreateLibrary(projectId);
      const { dataSet: v1 } = await service.importDataSet(
        lib.id,
        'records',
        'JSON',
        [{ id: 1 }],
      );
      await service.createVersion(v1.id, [{ id: 1 }, { id: 2 }]);

      const { restored, auditLog } = await service.rollback(lib.id, 'records', 1);

      expect(restored.version).toBe(3);
      expect(restored.content).toEqual([{ id: 1 }]);
      expect(auditLog.action).toBe('DATASET_ROLLBACK');
    });

    it('throws if the target version does not exist', async () => {
      const lib = await service.getOrCreateLibrary(projectId);
      await expect(service.rollback(lib.id, 'missing', 99)).rejects.toThrow(
        /version not found/i,
      );
    });
  });

  // ── Listing ────────────────────────────────────────────────────────────────

  describe('listDataSets', () => {
    it('returns only the latest version of each named data set', async () => {
      const lib = await service.getOrCreateLibrary(projectId);
      const { dataSet: v1 } = await service.importDataSet(lib.id, 'a', 'JSON', [1]);
      await service.createVersion(v1.id, [1, 2]);
      await service.importDataSet(lib.id, 'b', 'JSON', ['x']);

      const sets = await service.listDataSets(lib.id);
      expect(sets).toHaveLength(2);
      const setA = sets.find((s) => s.name === 'a');
      expect(setA?.version).toBe(2);
    });
  });

  describe('listVersions', () => {
    it('returns all versions of a named data set sorted ascending', async () => {
      const lib = await service.getOrCreateLibrary(projectId);
      const { dataSet: v1 } = await service.importDataSet(lib.id, 'hist', 'JSON', []);
      const { dataSet: v2 } = await service.createVersion(v1.id, [1]);
      await service.createVersion(v2.id, [1, 2]);

      const versions = await service.listVersions(lib.id, 'hist');
      expect(versions.map((v) => v.version)).toEqual([1, 2, 3]);
    });
  });
});
