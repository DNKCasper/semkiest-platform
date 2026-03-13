import { z } from 'zod';

// ─── Domain Types ─────────────────────────────────────────────────────────────

export const SCORING_CATEGORIES = [
  'functional',
  'visual',
  'performance',
  'accessibility',
  'security',
  'api',
] as const;

export type ScoringCategory = (typeof SCORING_CATEGORIES)[number];

/** Quality badge thresholds (score is 0–100). */
export const BADGE_THRESHOLDS = {
  EXCELLENT: 95,
  GOOD: 85,
  NEEDS_ATTENTION: 70,
} as const;

export type QualityBadge = 'excellent' | 'good' | 'needs_attention' | 'critical';

/** Trend direction based on score delta. */
export type TrendDirection = 'improving' | 'declining' | 'stable';

/** Threshold (in score points) below which a change is considered meaningful. */
const TREND_STABILITY_THRESHOLD = 1.0;

/** Pass rates per test category. Values in range [0, 100]. */
export const categoryPassRatesSchema = z.object({
  functional: z.number().min(0).max(100).optional(),
  visual: z.number().min(0).max(100).optional(),
  performance: z.number().min(0).max(100).optional(),
  accessibility: z.number().min(0).max(100).optional(),
  security: z.number().min(0).max(100).optional(),
  api: z.number().min(0).max(100).optional(),
});

export type CategoryPassRates = z.infer<typeof categoryPassRatesSchema>;

/** Weight configuration — each weight is a fraction; all must sum to 1.0. */
export const categoryWeightsSchema = z.object({
  functional: z.number().min(0).max(1),
  visual: z.number().min(0).max(1),
  performance: z.number().min(0).max(1),
  accessibility: z.number().min(0).max(1),
  security: z.number().min(0).max(1),
  api: z.number().min(0).max(1),
});

export type CategoryWeights = z.infer<typeof categoryWeightsSchema>;

/** Default scoring weights (sum = 1.0). */
export const DEFAULT_WEIGHTS: CategoryWeights = {
  functional: 0.30,
  visual: 0.20,
  performance: 0.20,
  accessibility: 0.10,
  security: 0.10,
  api: 0.10,
};

/** Result of a quality score computation. */
export interface QualityScoreResult {
  score: number;
  badge: QualityBadge;
  trend: TrendDirection;
  trendDelta: number;
  categoryScores: CategoryPassRates;
  calculatedAt: Date;
}

// ─── Core Algorithm ───────────────────────────────────────────────────────────

/**
 * Validates that the provided weights are a valid probability distribution.
 * Weights must sum to approximately 1.0 (±0.001 tolerance for floating-point).
 */
export function validateWeights(weights: CategoryWeights): void {
  const sum = Object.values(weights).reduce((acc, w) => acc + w, 0);
  if (Math.abs(sum - 1.0) > 0.001) {
    throw new Error(
      `Scoring weights must sum to 1.0 but got ${sum.toFixed(4)}. ` +
        `Adjust category weights so they total exactly 1.`,
    );
  }
}

/**
 * Computes the composite quality score as a weighted average of category pass rates.
 *
 * Categories with no pass rate data (undefined) are excluded from the weighted
 * average and their weight is redistributed proportionally across active categories.
 * This ensures a project is not penalised for not running certain test types.
 *
 * @param passRates  Pass rates per category (0–100), undefined means not tested.
 * @param weights    Per-category weight fractions (must sum to 1.0).
 * @returns          Composite score in [0, 100], rounded to 2 decimal places.
 */
export function computeCompositeScore(
  passRates: CategoryPassRates,
  weights: CategoryWeights = DEFAULT_WEIGHTS,
): number {
  validateWeights(weights);

  // Collect categories that have data
  const active = SCORING_CATEGORIES.filter(
    (cat) => passRates[cat] !== undefined && passRates[cat] !== null,
  );

  if (active.length === 0) {
    return 0;
  }

  // Sum of active weights (used to redistribute excluded categories)
  const activeWeightSum = active.reduce((sum, cat) => sum + weights[cat], 0);

  if (activeWeightSum === 0) {
    return 0;
  }

  // Weighted average, renormalised over active categories
  const score = active.reduce((sum, cat) => {
    const normalizedWeight = weights[cat] / activeWeightSum;
    return sum + (passRates[cat] as number) * normalizedWeight;
  }, 0);

  return Math.round(score * 100) / 100;
}

/**
 * Assigns a quality badge based on the composite score.
 *
 * Thresholds:
 *  - Excellent      score >= 95
 *  - Good           score >= 85
 *  - Needs Attention score >= 70
 *  - Critical       score <  70
 */
export function assignBadge(score: number): QualityBadge {
  if (score >= BADGE_THRESHOLDS.EXCELLENT) return 'excellent';
  if (score >= BADGE_THRESHOLDS.GOOD) return 'good';
  if (score >= BADGE_THRESHOLDS.NEEDS_ATTENTION) return 'needs_attention';
  return 'critical';
}

/**
 * Determines the score trend by comparing the current score against the previous.
 *
 * - improving : delta >  +TREND_STABILITY_THRESHOLD
 * - declining : delta < -TREND_STABILITY_THRESHOLD
 * - stable    : |delta| <= TREND_STABILITY_THRESHOLD
 */
export function computeTrend(
  currentScore: number,
  previousScore: number | null,
): { trend: TrendDirection; trendDelta: number } {
  if (previousScore === null) {
    return { trend: 'stable', trendDelta: 0 };
  }

  const delta = currentScore - previousScore;

  if (delta > TREND_STABILITY_THRESHOLD) {
    return { trend: 'improving', trendDelta: delta };
  }
  if (delta < -TREND_STABILITY_THRESHOLD) {
    return { trend: 'declining', trendDelta: delta };
  }
  return { trend: 'stable', trendDelta: delta };
}

/**
 * Full quality score calculation for a project snapshot.
 *
 * @param passRates      Current category pass rates.
 * @param weights        Organization-specific scoring weights.
 * @param previousScore  Previous composite score for trend calculation.
 */
export function calculateQualityScore(
  passRates: CategoryPassRates,
  weights: CategoryWeights = DEFAULT_WEIGHTS,
  previousScore: number | null = null,
): QualityScoreResult {
  const score = computeCompositeScore(passRates, weights);
  const badge = assignBadge(score);
  const { trend, trendDelta } = computeTrend(score, previousScore);

  return {
    score,
    badge,
    trend,
    trendDelta,
    categoryScores: passRates,
    calculatedAt: new Date(),
  };
}
