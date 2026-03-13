import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import {
  DEFAULT_WEIGHTS,
  type CategoryWeights,
  validateWeights,
} from './quality-scorer';

// ─── Validation Schemas ───────────────────────────────────────────────────────

/** Input schema for creating or updating scoring weights. */
export const updateWeightsInputSchema = z.object({
  functional: z.number().min(0).max(1),
  visual: z.number().min(0).max(1),
  performance: z.number().min(0).max(1),
  accessibility: z.number().min(0).max(1),
  security: z.number().min(0).max(1),
  api: z.number().min(0).max(1),
});

export type UpdateWeightsInput = z.infer<typeof updateWeightsInputSchema>;

/** Shape of a scoring config record returned to callers. */
export interface ScoringConfigRecord {
  id: string;
  organizationId: string;
  weights: CategoryWeights;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * ScoringConfigService manages per-organization scoring weight configurations.
 * It persists weights to the database and provides validated access.
 */
export class ScoringConfigService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Returns the scoring weights for an organization.
   * Falls back to DEFAULT_WEIGHTS if no custom configuration exists.
   */
  async getWeights(organizationId: string): Promise<CategoryWeights> {
    const config = await this.db.scoringConfig.findUnique({
      where: { organizationId },
    });

    if (!config) {
      return { ...DEFAULT_WEIGHTS };
    }

    return {
      functional: config.functionalWeight,
      visual: config.visualWeight,
      performance: config.performanceWeight,
      accessibility: config.accessibilityWeight,
      security: config.securityWeight,
      api: config.apiWeight,
    };
  }

  /**
   * Returns the full scoring config record for an organization, or null if
   * the organization uses the platform defaults.
   */
  async getConfig(organizationId: string): Promise<ScoringConfigRecord | null> {
    const config = await this.db.scoringConfig.findUnique({
      where: { organizationId },
    });

    if (!config) return null;

    return this.mapToRecord(config);
  }

  /**
   * Creates or fully replaces the scoring weight configuration for an organization.
   *
   * @throws Error if the provided weights do not sum to 1.0.
   */
  async upsertWeights(
    organizationId: string,
    input: UpdateWeightsInput,
  ): Promise<ScoringConfigRecord> {
    const parsed = updateWeightsInputSchema.parse(input);

    const weights: CategoryWeights = {
      functional: parsed.functional,
      visual: parsed.visual,
      performance: parsed.performance,
      accessibility: parsed.accessibility,
      security: parsed.security,
      api: parsed.api,
    };

    validateWeights(weights);

    const config = await this.db.scoringConfig.upsert({
      where: { organizationId },
      create: {
        organizationId,
        functionalWeight: weights.functional,
        visualWeight: weights.visual,
        performanceWeight: weights.performance,
        accessibilityWeight: weights.accessibility,
        securityWeight: weights.security,
        apiWeight: weights.api,
      },
      update: {
        functionalWeight: weights.functional,
        visualWeight: weights.visual,
        performanceWeight: weights.performance,
        accessibilityWeight: weights.accessibility,
        securityWeight: weights.security,
        apiWeight: weights.api,
      },
    });

    return this.mapToRecord(config);
  }

  /**
   * Resets an organization's scoring config to platform defaults by deleting
   * the custom row. Subsequent calls to getWeights will return DEFAULT_WEIGHTS.
   */
  async resetToDefaults(organizationId: string): Promise<void> {
    await this.db.scoringConfig.deleteMany({
      where: { organizationId },
    });
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private mapToRecord(
    config: Awaited<ReturnType<PrismaClient['scoringConfig']['findUniqueOrThrow']>>,
  ): ScoringConfigRecord {
    return {
      id: config.id,
      organizationId: config.organizationId,
      weights: {
        functional: config.functionalWeight,
        visual: config.visualWeight,
        performance: config.performanceWeight,
        accessibility: config.accessibilityWeight,
        security: config.securityWeight,
        api: config.apiWeight,
      },
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}
