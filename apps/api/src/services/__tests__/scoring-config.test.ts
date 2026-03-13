import { ScoringConfigService, type UpdateWeightsInput } from '../scoring-config';
import { DEFAULT_WEIGHTS } from '../quality-scorer';
import type { PrismaClient } from '@prisma/client';

// ─── Mock PrismaClient ────────────────────────────────────────────────────────

const makeDbMock = (): jest.Mocked<Pick<PrismaClient, 'scoringConfig'>> => ({
  scoringConfig: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  } as unknown as jest.Mocked<PrismaClient['scoringConfig']>,
});

const dbRecord = {
  id: 'config-id',
  organizationId: 'org-1',
  functionalWeight: 0.3,
  visualWeight: 0.2,
  performanceWeight: 0.2,
  accessibilityWeight: 0.1,
  securityWeight: 0.1,
  apiWeight: 0.1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ScoringConfigService', () => {
  let db: ReturnType<typeof makeDbMock>;
  let service: ScoringConfigService;

  beforeEach(() => {
    db = makeDbMock();
    service = new ScoringConfigService(db as unknown as PrismaClient);
  });

  // ─── getWeights ────────────────────────────────────────────────────────────

  describe('getWeights', () => {
    it('returns DEFAULT_WEIGHTS when no custom config exists', async () => {
      (db.scoringConfig.findUnique as jest.Mock).mockResolvedValue(null);
      const weights = await service.getWeights('org-1');
      expect(weights).toEqual(DEFAULT_WEIGHTS);
    });

    it('returns stored weights when a config exists', async () => {
      (db.scoringConfig.findUnique as jest.Mock).mockResolvedValue(dbRecord);
      const weights = await service.getWeights('org-1');
      expect(weights.functional).toBe(0.3);
      expect(weights.visual).toBe(0.2);
      expect(weights.performance).toBe(0.2);
      expect(weights.accessibility).toBe(0.1);
      expect(weights.security).toBe(0.1);
      expect(weights.api).toBe(0.1);
    });

    it('queries with the correct organizationId', async () => {
      (db.scoringConfig.findUnique as jest.Mock).mockResolvedValue(null);
      await service.getWeights('my-org');
      expect(db.scoringConfig.findUnique).toHaveBeenCalledWith({
        where: { organizationId: 'my-org' },
      });
    });
  });

  // ─── getConfig ─────────────────────────────────────────────────────────────

  describe('getConfig', () => {
    it('returns null when no config is stored', async () => {
      (db.scoringConfig.findUnique as jest.Mock).mockResolvedValue(null);
      const config = await service.getConfig('org-1');
      expect(config).toBeNull();
    });

    it('returns a mapped config record', async () => {
      (db.scoringConfig.findUnique as jest.Mock).mockResolvedValue(dbRecord);
      const config = await service.getConfig('org-1');
      expect(config).not.toBeNull();
      expect(config!.id).toBe('config-id');
      expect(config!.organizationId).toBe('org-1');
      expect(config!.weights.functional).toBe(0.3);
    });
  });

  // ─── upsertWeights ─────────────────────────────────────────────────────────

  describe('upsertWeights', () => {
    const validInput: UpdateWeightsInput = {
      functional: 0.3,
      visual: 0.2,
      performance: 0.2,
      accessibility: 0.1,
      security: 0.1,
      api: 0.1,
    };

    it('creates a new config when none exists', async () => {
      (db.scoringConfig.upsert as jest.Mock).mockResolvedValue(dbRecord);
      const result = await service.upsertWeights('org-1', validInput);
      expect(db.scoringConfig.upsert).toHaveBeenCalledTimes(1);
      expect(result.organizationId).toBe('org-1');
    });

    it('throws when weights do not sum to 1.0', async () => {
      const badInput: UpdateWeightsInput = { ...validInput, functional: 0.99 };
      await expect(service.upsertWeights('org-1', badInput)).rejects.toThrow(
        /sum to 1\.0/i,
      );
      expect(db.scoringConfig.upsert).not.toHaveBeenCalled();
    });

    it('rejects invalid weight values via Zod (>1)', async () => {
      const badInput = { ...validInput, functional: 1.5 };
      await expect(
        service.upsertWeights('org-1', badInput as UpdateWeightsInput),
      ).rejects.toThrow();
    });

    it('rejects negative weight values via Zod', async () => {
      const badInput = { ...validInput, functional: -0.1 };
      await expect(
        service.upsertWeights('org-1', badInput as UpdateWeightsInput),
      ).rejects.toThrow();
    });

    it('passes correct field values to upsert', async () => {
      (db.scoringConfig.upsert as jest.Mock).mockResolvedValue(dbRecord);
      await service.upsertWeights('org-1', validInput);

      const call = (db.scoringConfig.upsert as jest.Mock).mock.calls[0][0] as {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      };
      expect(call.create.functionalWeight).toBe(0.3);
      expect(call.update.apiWeight).toBe(0.1);
    });
  });

  // ─── resetToDefaults ───────────────────────────────────────────────────────

  describe('resetToDefaults', () => {
    it('deletes the custom config row', async () => {
      (db.scoringConfig.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
      await service.resetToDefaults('org-1');
      expect(db.scoringConfig.deleteMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
      });
    });
  });
});
