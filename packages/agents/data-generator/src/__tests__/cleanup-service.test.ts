import { CleanupService } from '../cleanup-service';
import type {
  CleanupRepository,
  DataLibrary,
  DataSet,
  AuditLog,
  CreateAuditLogInput,
} from '../types';

// ─── Stub factory ─────────────────────────────────────────────────────────────

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

function makeDataSet(override: Partial<DataSet> = {}): DataSet {
  return {
    id: makeId(),
    libraryId: 'lib-1',
    name: 'baseline-set',
    version: 1,
    tags: [],
    format: 'JSON',
    content: [{ id: 1 }],
    checksum: 'abc123',
    isBaseline: true,
    createdAt: new Date(),
    ...override,
  };
}

function makeLibrary(projectId: string): DataLibrary {
  return {
    id: 'lib-1',
    projectId,
    name: 'Test Library',
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeRepo(options: {
  library?: DataLibrary | null;
  baseline?: DataSet | null;
} = {}): CleanupRepository {
  const auditLogs: AuditLog[] = [];

  return {
    async findLibraryByProjectId(projectId: string): Promise<DataLibrary | null> {
      const lib = options.library;
      if (lib !== undefined && lib !== null && lib.projectId === projectId) return lib;
      return null;
    },
    async findBaselineDataSet(_libraryId: string): Promise<DataSet | null> {
      return options.baseline ?? null;
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
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CleanupService', () => {
  const projectId = 'proj-cleanup-001';

  // ── resetToBaseline ────────────────────────────────────────────────────────

  describe('resetToBaseline', () => {
    it('returns wasReset=true when a baseline data set exists', async () => {
      const library = makeLibrary(projectId);
      const baseline = makeDataSet();
      const repo = makeRepo({ library, baseline });
      const service = new CleanupService(repo);

      const result = await service.resetToBaseline(projectId, 'ci-runner');

      expect(result.wasReset).toBe(true);
      expect(result.projectId).toBe(projectId);
      expect(result.baselineDataSet).toBe(baseline);
      expect(result.auditLog.action).toBe('CLEANUP_EXECUTE');
      expect(result.auditLog.actor).toBe('ci-runner');
      expect(result.executedAt).toBeInstanceOf(Date);
    });

    it('returns wasReset=false when no baseline exists', async () => {
      const library = makeLibrary(projectId);
      const repo = makeRepo({ library, baseline: null });
      const service = new CleanupService(repo);

      const result = await service.resetToBaseline(projectId);

      expect(result.wasReset).toBe(false);
      expect(result.baselineDataSet).toBeNull();
      expect(result.auditLog.action).toBe('CLEANUP_EXECUTE');
    });

    it('returns wasReset=false when no library exists', async () => {
      const repo = makeRepo({ library: null });
      const service = new CleanupService(repo);

      const result = await service.resetToBaseline(projectId);

      expect(result.wasReset).toBe(false);
    });
  });

  // ── registerTransaction / rollbackTransaction ───────────────────────────────

  describe('registerTransaction + rollbackTransaction', () => {
    it('rolls back a registered transaction', async () => {
      const repo = makeRepo({ library: makeLibrary(projectId) });
      const service = new CleanupService(repo);

      let rolledBack = false;
      service.registerTransaction({
        id: 'tx-1',
        projectId,
        description: 'test run',
        rollback: async () => {
          rolledBack = true;
        },
      });

      expect(service.openTransactionCount).toBe(1);

      const result = await service.rollbackTransaction('tx-1', 'user-a');

      expect(rolledBack).toBe(true);
      expect(result.rolledBack).toBe(true);
      expect(result.transactionId).toBe('tx-1');
      expect(result.auditLog.action).toBe('CLEANUP_ROLLBACK');
      expect(service.openTransactionCount).toBe(0);
    });

    it('throws when rolling back an unregistered transaction', async () => {
      const repo = makeRepo();
      const service = new CleanupService(repo);

      await expect(service.rollbackTransaction('ghost-tx')).rejects.toThrow(
        /Transaction not found in registry/,
      );
    });

    it('removes the transaction from the registry after rollback', async () => {
      const repo = makeRepo({ library: makeLibrary(projectId) });
      const service = new CleanupService(repo);

      service.registerTransaction({
        id: 'tx-del',
        projectId,
        rollback: async () => undefined,
      });

      await service.rollbackTransaction('tx-del');
      expect(service.getOpenTransactionIds()).not.toContain('tx-del');
    });
  });

  // ── rollbackAll ────────────────────────────────────────────────────────────

  describe('rollbackAll', () => {
    it('rolls back all registered transactions for a project', async () => {
      const repo = makeRepo({ library: makeLibrary(projectId) });
      const service = new CleanupService(repo);

      const rolled: string[] = [];
      service.registerTransaction({
        id: 'tx-a',
        projectId,
        rollback: async () => { rolled.push('tx-a'); },
      });
      service.registerTransaction({
        id: 'tx-b',
        projectId,
        rollback: async () => { rolled.push('tx-b'); },
      });
      service.registerTransaction({
        id: 'tx-other',
        projectId: 'other-proj',
        rollback: async () => { rolled.push('tx-other'); },
      });

      const results = await service.rollbackAll(projectId);

      expect(results).toHaveLength(2);
      expect(rolled).toEqual(expect.arrayContaining(['tx-a', 'tx-b']));
      expect(rolled).not.toContain('tx-other');
      expect(service.openTransactionCount).toBe(1); // 'tx-other' remains
    });

    it('rolls back all transactions when projectId is omitted', async () => {
      const repo = makeRepo({ library: makeLibrary(projectId) });
      const service = new CleanupService(repo);

      service.registerTransaction({
        id: 'tx-x',
        projectId: 'proj-x',
        rollback: async () => undefined,
      });
      service.registerTransaction({
        id: 'tx-y',
        projectId: 'proj-y',
        rollback: async () => undefined,
      });

      await service.rollbackAll();

      expect(service.openTransactionCount).toBe(0);
    });
  });

  // ── Inspection ─────────────────────────────────────────────────────────────

  describe('openTransactionCount / getOpenTransactionIds', () => {
    it('tracks registered transaction IDs', () => {
      const repo = makeRepo();
      const service = new CleanupService(repo);

      service.registerTransaction({ id: 'tx-1', projectId, rollback: async () => undefined });
      service.registerTransaction({ id: 'tx-2', projectId, rollback: async () => undefined });

      expect(service.openTransactionCount).toBe(2);
      expect(service.getOpenTransactionIds()).toEqual(expect.arrayContaining(['tx-1', 'tx-2']));
    });
  });
});
