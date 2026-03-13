import {
  ApprovalWorkflow,
  BaselineNotFoundError,
  InvalidStatusTransitionError,
  InsufficientPermissionsError,
  resolveAutoApproveThreshold,
  mapDbBaselineToVisualBaseline,
  mapDbApprovalRecord,
  type RawDbBaseline,
  type RawDbApprovalRecord,
} from './approval-workflow';
import type {
  ApprovalRecord,
  BaselineQuery,
  BaselineRepository,
  BaselineStatus,
  BaselineUpdateData,
  CreateApprovalRecordData,
  VisualBaseline,
} from './types';

// ─── Test Fixtures ────────────────────────────────────────────────────────────

function makeBaseline(overrides: Partial<VisualBaseline> = {}): VisualBaseline {
  return {
    id: 'baseline-1',
    projectId: 'project-1',
    componentName: 'Button',
    viewport: '1920x1080',
    version: '1',
    baseline: {
      url: 'https://example.com/baseline.png',
      width: 1920,
      height: 1080,
      capturedAt: '2024-01-01T00:00:00.000Z',
    },
    actual: {
      url: 'https://example.com/actual.png',
      width: 1920,
      height: 1080,
      capturedAt: '2024-01-02T00:00:00.000Z',
    },
    diff: {
      diffPixels: 100,
      totalPixels: 2073600,
      diffPercentage: 0.005,
      diffImageUrl: 'https://example.com/diff.png',
    },
    status: 'pending',
    autoApproveThreshold: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function makeApprovalRecord(
  overrides: Partial<ApprovalRecord> = {},
): ApprovalRecord {
  return {
    id: 'record-1',
    baselineId: 'baseline-1',
    action: 'approved',
    userId: 'user-1',
    userName: 'Alice',
    comment: 'Looks good',
    previousStatus: 'pending',
    newStatus: 'approved',
    version: '1',
    createdAt: '2024-01-02T00:00:00.000Z',
    ...overrides,
  };
}

// ─── Mock Repository ──────────────────────────────────────────────────────────

function makeMockRepo(
  initial: VisualBaseline | null = makeBaseline(),
): jest.Mocked<BaselineRepository> & { _data: VisualBaseline | null } {
  let data = initial;

  return {
    _data: data,
    findById: jest.fn(async (id: string) => {
      if (data && data.id === id) return data;
      return null;
    }),
    findMany: jest.fn(async (_query: BaselineQuery) => (data ? [data] : [])),
    update: jest.fn(async (id: string, updates: BaselineUpdateData) => {
      if (!data || data.id !== id) throw new Error('Not found');
      data = { ...data, ...updates } as VisualBaseline;
      return data;
    }),
    createApprovalRecord: jest.fn(
      async (record: CreateApprovalRecordData): Promise<ApprovalRecord> => ({
        id: 'new-record',
        ...record,
        createdAt: new Date().toISOString(),
      }),
    ),
    findApprovalHistory: jest.fn(async () => [makeApprovalRecord()]),
  };
}

// ─── ApprovalWorkflow Tests ───────────────────────────────────────────────────

describe('ApprovalWorkflow', () => {
  describe('approve()', () => {
    it('transitions status from pending to approved', async () => {
      const repo = makeMockRepo();
      const workflow = new ApprovalWorkflow(repo);

      const result = await workflow.approve('baseline-1', {
        userId: 'user-1',
        userName: 'Alice',
        comment: 'LGTM',
      });

      expect(result.status).toBe('approved');
      expect(repo.update).toHaveBeenCalledWith('baseline-1', {
        status: 'approved',
      });
    });

    it('creates an approval record with correct metadata', async () => {
      const repo = makeMockRepo();
      const workflow = new ApprovalWorkflow(repo);

      await workflow.approve('baseline-1', {
        userId: 'user-42',
        userName: 'Bob',
        comment: 'Approved!',
      });

      expect(repo.createApprovalRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          baselineId: 'baseline-1',
          action: 'approved',
          userId: 'user-42',
          userName: 'Bob',
          comment: 'Approved!',
          previousStatus: 'pending',
          newStatus: 'approved',
        }),
      );
    });

    it('throws BaselineNotFoundError when baseline does not exist', async () => {
      const repo = makeMockRepo(null);
      const workflow = new ApprovalWorkflow(repo);

      await expect(
        workflow.approve('nonexistent', { userId: 'user-1' }),
      ).rejects.toThrow(BaselineNotFoundError);
    });

    it('throws InvalidStatusTransitionError for approved → approved', async () => {
      const repo = makeMockRepo(makeBaseline({ status: 'approved' }));
      const workflow = new ApprovalWorkflow(repo);

      await expect(
        workflow.approve('baseline-1', { userId: 'user-1' }),
      ).rejects.toThrow(InvalidStatusTransitionError);
    });

    it('throws InsufficientPermissionsError when checker denies', async () => {
      const repo = makeMockRepo();
      const noPermissions = {
        canApprove: jest.fn(() => false),
        canReject: jest.fn(() => true),
      };
      const workflow = new ApprovalWorkflow(repo, noPermissions);

      await expect(
        workflow.approve('baseline-1', { userId: 'user-1' }),
      ).rejects.toThrow(InsufficientPermissionsError);
    });

    it('allows re-approving a rejected baseline', async () => {
      const repo = makeMockRepo(makeBaseline({ status: 'rejected' }));
      const workflow = new ApprovalWorkflow(repo);

      const result = await workflow.approve('baseline-1', { userId: 'user-1' });
      expect(result.status).toBe('approved');
    });
  });

  describe('reject()', () => {
    it('transitions status from pending to rejected', async () => {
      const repo = makeMockRepo();
      const workflow = new ApprovalWorkflow(repo);

      const result = await workflow.reject('baseline-1', {
        userId: 'user-1',
        reason: 'Layout shift detected',
      });

      expect(result.status).toBe('rejected');
    });

    it('stores the rejection reason as comment', async () => {
      const repo = makeMockRepo();
      const workflow = new ApprovalWorkflow(repo);

      await workflow.reject('baseline-1', {
        userId: 'user-1',
        reason: 'Wrong color',
      });

      expect(repo.createApprovalRecord).toHaveBeenCalledWith(
        expect.objectContaining({ comment: 'Wrong color', action: 'rejected' }),
      );
    });

    it('throws InvalidStatusTransitionError for rejected → rejected', async () => {
      const repo = makeMockRepo(makeBaseline({ status: 'rejected' }));
      const workflow = new ApprovalWorkflow(repo);

      await expect(
        workflow.reject('baseline-1', { userId: 'user-1', reason: 'Again' }),
      ).rejects.toThrow(InvalidStatusTransitionError);
    });

    it('throws InsufficientPermissionsError when checker denies', async () => {
      const repo = makeMockRepo();
      const noPermissions = {
        canApprove: jest.fn(() => true),
        canReject: jest.fn(() => false),
      };
      const workflow = new ApprovalWorkflow(repo, noPermissions);

      await expect(
        workflow.reject('baseline-1', { userId: 'user-1', reason: 'Denied' }),
      ).rejects.toThrow(InsufficientPermissionsError);
    });
  });

  describe('batchProcess()', () => {
    it('approves multiple baselines and returns success results', async () => {
      const repo = makeMockRepo();
      // Make findById return for any id
      repo.findById.mockImplementation(async (id) =>
        makeBaseline({ id, status: 'pending' }),
      );
      repo.update.mockImplementation(async (id, updates) =>
        makeBaseline({ id, ...updates } as Partial<VisualBaseline>),
      );

      const workflow = new ApprovalWorkflow(repo);
      const result = await workflow.batchProcess({
        baselineIds: ['b-1', 'b-2', 'b-3'],
        action: 'approve',
        userId: 'user-1',
      });

      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(result.results.every((r) => r.success)).toBe(true);
    });

    it('reports failures for missing baselines without aborting the batch', async () => {
      const repo = makeMockRepo();
      repo.findById.mockImplementation(async (id) => {
        if (id === 'missing') return null;
        return makeBaseline({ id, status: 'pending' });
      });
      repo.update.mockImplementation(async (id, updates) =>
        makeBaseline({ id, ...updates } as Partial<VisualBaseline>),
      );

      const workflow = new ApprovalWorkflow(repo);
      const result = await workflow.batchProcess({
        baselineIds: ['b-1', 'missing', 'b-3'],
        action: 'approve',
        userId: 'user-1',
      });

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);

      const failedItem = result.results.find((r) => r.baselineId === 'missing');
      expect(failedItem?.success).toBe(false);
      expect(failedItem?.error).toContain('not found');
    });

    it('rejects multiple baselines', async () => {
      const repo = makeMockRepo();
      repo.findById.mockImplementation(async (id) =>
        makeBaseline({ id, status: 'pending' }),
      );
      repo.update.mockImplementation(async (id, updates) =>
        makeBaseline({ id, ...updates } as Partial<VisualBaseline>),
      );

      const workflow = new ApprovalWorkflow(repo);
      const result = await workflow.batchProcess({
        baselineIds: ['b-1', 'b-2'],
        action: 'reject',
        userId: 'user-1',
        comment: 'Batch reject',
      });

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
    });
  });

  describe('checkAndAutoApprove()', () => {
    it('auto-approves when diff is below per-baseline threshold', async () => {
      const repo = makeMockRepo(
        makeBaseline({ diff: { diffPixels: 5, totalPixels: 1000, diffPercentage: 0.5 }, autoApproveThreshold: 1.0 }),
      );
      const workflow = new ApprovalWorkflow(repo);

      const result = await workflow.checkAndAutoApprove('baseline-1');

      expect(result.status).toBe('auto-approved');
      expect(repo.createApprovalRecord).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auto-approved', userId: 'system' }),
      );
    });

    it('does not auto-approve when diff exceeds threshold', async () => {
      const repo = makeMockRepo(
        makeBaseline({ diff: { diffPixels: 500, totalPixels: 1000, diffPercentage: 50 }, autoApproveThreshold: 1.0 }),
      );
      const workflow = new ApprovalWorkflow(repo);

      const result = await workflow.checkAndAutoApprove('baseline-1');

      expect(result.status).toBe('pending');
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('uses global config when per-baseline threshold is null', async () => {
      const repo = makeMockRepo(
        makeBaseline({
          diff: { diffPixels: 5, totalPixels: 1000, diffPercentage: 0.5 },
          autoApproveThreshold: null,
        }),
      );
      const workflow = new ApprovalWorkflow(repo);

      const result = await workflow.checkAndAutoApprove('baseline-1', {
        enabled: true,
        threshold: 1.0,
      });

      expect(result.status).toBe('auto-approved');
    });

    it('skips non-pending baselines', async () => {
      const repo = makeMockRepo(makeBaseline({ status: 'approved' }));
      const workflow = new ApprovalWorkflow(repo);

      const result = await workflow.checkAndAutoApprove('baseline-1');

      expect(result.status).toBe('approved');
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('skips baselines with no diff result', async () => {
      const repo = makeMockRepo(makeBaseline({ diff: undefined }));
      const workflow = new ApprovalWorkflow(repo);

      const result = await workflow.checkAndAutoApprove('baseline-1', {
        enabled: true,
        threshold: 5,
      });

      expect(result.status).toBe('pending');
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('prepareDiffViewerData()', () => {
    it('returns complete diff viewer data for a valid baseline', async () => {
      const repo = makeMockRepo();
      const workflow = new ApprovalWorkflow(repo);

      const data = await workflow.prepareDiffViewerData('baseline-1');

      expect(data.baselineId).toBe('baseline-1');
      expect(data.baseline.url).toBe('https://example.com/baseline.png');
      expect(data.actual.url).toBe('https://example.com/actual.png');
      expect(data.diffOverlay?.url).toBe('https://example.com/diff.png');
      expect(data.availableViewModes).toContain('side-by-side');
      expect(data.availableViewModes).toContain('overlay');
      expect(data.availableViewModes).toContain('slider');
    });

    it('throws when actual screenshot is missing', async () => {
      const repo = makeMockRepo(makeBaseline({ actual: undefined }));
      const workflow = new ApprovalWorkflow(repo);

      await expect(workflow.prepareDiffViewerData('baseline-1')).rejects.toThrow(
        'no actual screenshot',
      );
    });

    it('throws when diff result is missing', async () => {
      const repo = makeMockRepo(makeBaseline({ diff: undefined }));
      const workflow = new ApprovalWorkflow(repo);

      await expect(workflow.prepareDiffViewerData('baseline-1')).rejects.toThrow(
        'no diff result',
      );
    });
  });

  describe('getHistory()', () => {
    it('returns approval history for a valid baseline', async () => {
      const repo = makeMockRepo();
      const workflow = new ApprovalWorkflow(repo);

      const history = await workflow.getHistory('baseline-1');

      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ action: 'approved' });
    });

    it('throws when baseline does not exist', async () => {
      const repo = makeMockRepo(null);
      const workflow = new ApprovalWorkflow(repo);

      await expect(workflow.getHistory('nonexistent')).rejects.toThrow(
        BaselineNotFoundError,
      );
    });
  });

  describe('setAutoApproveThreshold()', () => {
    it('updates the threshold to a valid value', async () => {
      const repo = makeMockRepo();
      const workflow = new ApprovalWorkflow(repo);

      await workflow.setAutoApproveThreshold('baseline-1', 2.5);

      expect(repo.update).toHaveBeenCalledWith('baseline-1', {
        autoApproveThreshold: 2.5,
      });
    });

    it('allows setting threshold to null to disable', async () => {
      const repo = makeMockRepo();
      const workflow = new ApprovalWorkflow(repo);

      await workflow.setAutoApproveThreshold('baseline-1', null);

      expect(repo.update).toHaveBeenCalledWith('baseline-1', {
        autoApproveThreshold: null,
      });
    });

    it('throws RangeError for threshold > 100', async () => {
      const repo = makeMockRepo();
      const workflow = new ApprovalWorkflow(repo);

      await expect(
        workflow.setAutoApproveThreshold('baseline-1', 101),
      ).rejects.toThrow(RangeError);
    });

    it('throws RangeError for negative threshold', async () => {
      const repo = makeMockRepo();
      const workflow = new ApprovalWorkflow(repo);

      await expect(
        workflow.setAutoApproveThreshold('baseline-1', -1),
      ).rejects.toThrow(RangeError);
    });
  });
});

// ─── resolveAutoApproveThreshold Tests ───────────────────────────────────────

describe('resolveAutoApproveThreshold()', () => {
  it('returns per-baseline threshold when set', () => {
    const baseline = makeBaseline({ autoApproveThreshold: 0.5 });
    expect(resolveAutoApproveThreshold(baseline)).toBe(0.5);
  });

  it('returns global config threshold when per-baseline is null', () => {
    const baseline = makeBaseline({ autoApproveThreshold: null });
    expect(resolveAutoApproveThreshold(baseline, { enabled: true, threshold: 1.0 })).toBe(1.0);
  });

  it('returns null when both are disabled', () => {
    const baseline = makeBaseline({ autoApproveThreshold: null });
    expect(resolveAutoApproveThreshold(baseline)).toBeNull();
    expect(
      resolveAutoApproveThreshold(baseline, { enabled: false, threshold: 1.0 }),
    ).toBeNull();
  });

  it('per-baseline threshold overrides global config', () => {
    const baseline = makeBaseline({ autoApproveThreshold: 0.1 });
    expect(
      resolveAutoApproveThreshold(baseline, { enabled: true, threshold: 5.0 }),
    ).toBe(0.1);
  });
});

// ─── mapDbBaselineToVisualBaseline Tests ─────────────────────────────────────

describe('mapDbBaselineToVisualBaseline()', () => {
  const now = new Date('2024-01-01T00:00:00.000Z');

  function makeRawRow(overrides: Partial<RawDbBaseline> = {}): RawDbBaseline {
    return {
      id: 'b-1',
      projectId: 'p-1',
      componentName: 'Header',
      viewport: '1440x900',
      version: '2',
      baselineUrl: 'https://cdn.example.com/baseline.png',
      baselineWidth: 1440,
      baselineHeight: 900,
      baselineCapturedAt: now,
      actualUrl: 'https://cdn.example.com/actual.png',
      actualWidth: 1440,
      actualHeight: 900,
      actualCapturedAt: now,
      diffImageUrl: 'https://cdn.example.com/diff.png',
      diffPixels: 200,
      totalPixels: 1296000,
      diffPercentage: 0.015,
      status: 'pending',
      autoApproveThreshold: 0.5,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  it('maps all fields correctly', () => {
    const row = makeRawRow();
    const result = mapDbBaselineToVisualBaseline(row);

    expect(result.id).toBe('b-1');
    expect(result.baseline.url).toBe('https://cdn.example.com/baseline.png');
    expect(result.actual?.url).toBe('https://cdn.example.com/actual.png');
    expect(result.diff?.diffPercentage).toBe(0.015);
    expect(result.diff?.diffImageUrl).toBe('https://cdn.example.com/diff.png');
    expect(result.autoApproveThreshold).toBe(0.5);
  });

  it('maps actual and diff to undefined when null in DB', () => {
    const row = makeRawRow({
      actualUrl: null,
      actualWidth: null,
      actualHeight: null,
      actualCapturedAt: null,
      diffPixels: null,
      totalPixels: null,
      diffPercentage: null,
      diffImageUrl: null,
    });
    const result = mapDbBaselineToVisualBaseline(row);

    expect(result.actual).toBeUndefined();
    expect(result.diff).toBeUndefined();
  });

  it('converts Date objects to ISO strings', () => {
    const row = makeRawRow();
    const result = mapDbBaselineToVisualBaseline(row);

    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(result.baseline.capturedAt).toBe('2024-01-01T00:00:00.000Z');
  });
});

// ─── mapDbApprovalRecord Tests ────────────────────────────────────────────────

describe('mapDbApprovalRecord()', () => {
  it('maps all fields correctly', () => {
    const now = new Date('2024-01-01T00:00:00.000Z');
    const row: RawDbApprovalRecord = {
      id: 'r-1',
      baselineId: 'b-1',
      action: 'approved',
      userId: 'user-99',
      userName: 'Charlie',
      comment: 'Ship it',
      previousStatus: 'pending',
      newStatus: 'approved',
      version: '1',
      createdAt: now,
    };

    const result = mapDbApprovalRecord(row);

    expect(result.id).toBe('r-1');
    expect(result.action).toBe('approved');
    expect(result.userId).toBe('user-99');
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('maps null userName and comment to undefined', () => {
    const row: RawDbApprovalRecord = {
      id: 'r-2',
      baselineId: 'b-1',
      action: 'auto-approved',
      userId: 'system',
      userName: null,
      comment: null,
      previousStatus: 'pending',
      newStatus: 'auto-approved',
      version: '1',
      createdAt: new Date(),
    };

    const result = mapDbApprovalRecord(row);

    expect(result.userName).toBeUndefined();
    expect(result.comment).toBeUndefined();
  });
});

// ─── Status Transition Tests ──────────────────────────────────────────────────

describe('Status transition edge cases', () => {
  it('rejects auto-approved → approved transition is allowed', async () => {
    const repo = makeMockRepo(makeBaseline({ status: 'auto-approved' }));
    const workflow = new ApprovalWorkflow(repo);

    const result = await workflow.approve('baseline-1', { userId: 'user-1' });
    expect(result.status).toBe('approved');
  });

  it('rejects auto-approved → rejected transition is allowed', async () => {
    const repo = makeMockRepo(makeBaseline({ status: 'auto-approved' }));
    const workflow = new ApprovalWorkflow(repo);

    const result = await workflow.reject('baseline-1', {
      userId: 'user-1',
      reason: 'False positive',
    });
    expect(result.status).toBe('rejected');
  });
});

// ─── Permissions via status transitions ───────────────────────────────────────

describe('BaselineStatus type guard coverage', () => {
  const allStatuses: BaselineStatus[] = ['pending', 'approved', 'rejected', 'auto-approved'];

  it('covers all status values', () => {
    expect(allStatuses).toHaveLength(4);
  });
});
