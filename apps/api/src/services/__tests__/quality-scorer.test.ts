import {
  computeCompositeScore,
  assignBadge,
  computeTrend,
  calculateQualityScore,
  validateWeights,
  DEFAULT_WEIGHTS,
  type CategoryPassRates,
  type CategoryWeights,
} from '../quality-scorer';

// ─── validateWeights ──────────────────────────────────────────────────────────

describe('validateWeights', () => {
  it('accepts weights that sum to 1.0', () => {
    expect(() => validateWeights(DEFAULT_WEIGHTS)).not.toThrow();
  });

  it('accepts weights within floating-point tolerance', () => {
    const weights: CategoryWeights = {
      functional: 0.1,
      visual: 0.1,
      performance: 0.2,
      accessibility: 0.2,
      security: 0.2,
      api: 0.2,
    };
    expect(() => validateWeights(weights)).not.toThrow();
  });

  it('throws when weights sum to > 1.0', () => {
    const weights: CategoryWeights = {
      ...DEFAULT_WEIGHTS,
      functional: 0.5,
    };
    expect(() => validateWeights(weights)).toThrow(/sum to 1\.0/i);
  });

  it('throws when weights sum to < 1.0', () => {
    const weights: CategoryWeights = {
      ...DEFAULT_WEIGHTS,
      functional: 0.1,
    };
    expect(() => validateWeights(weights)).toThrow(/sum to 1\.0/i);
  });
});

// ─── computeCompositeScore ────────────────────────────────────────────────────

describe('computeCompositeScore', () => {
  it('returns 0 when no category data is provided', () => {
    expect(computeCompositeScore({})).toBe(0);
  });

  it('returns the single category pass rate when only one category is present', () => {
    const rates: CategoryPassRates = { functional: 80 };
    // Weight redistributes to 100% on functional
    expect(computeCompositeScore(rates)).toBe(80);
  });

  it('computes weighted average for multiple categories', () => {
    const rates: CategoryPassRates = {
      functional: 100,
      visual: 100,
      performance: 100,
      accessibility: 100,
      security: 100,
      api: 100,
    };
    expect(computeCompositeScore(rates)).toBe(100);
  });

  it('correctly redistributes weight for missing categories', () => {
    // Only functional (0.30) and visual (0.20) present — effective weights 0.6 and 0.4
    const rates: CategoryPassRates = { functional: 100, visual: 0 };
    const expected = 100 * (0.3 / 0.5) + 0 * (0.2 / 0.5);
    expect(computeCompositeScore(rates)).toBeCloseTo(expected, 1);
  });

  it('applies custom weights correctly', () => {
    const weights: CategoryWeights = {
      functional: 0.5,
      visual: 0.5,
      performance: 0,
      accessibility: 0,
      security: 0,
      api: 0,
    };
    const rates: CategoryPassRates = { functional: 80, visual: 60 };
    // Weights already only cover functional + visual so no redistribution needed
    // effective: 80*0.5 + 60*0.5 = 70 (renormalized: sum=1.0)
    expect(computeCompositeScore(rates, weights)).toBeCloseTo(70, 1);
  });

  it('rounds to 2 decimal places', () => {
    const rates: CategoryPassRates = { functional: 33.333333 };
    const score = computeCompositeScore(rates);
    expect(score.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it('uses DEFAULT_WEIGHTS when none provided', () => {
    const rates: CategoryPassRates = {
      functional: 90,
      visual: 80,
      performance: 70,
      accessibility: 60,
      security: 50,
      api: 40,
    };
    const score = computeCompositeScore(rates);
    // manual: 90*0.3 + 80*0.2 + 70*0.2 + 60*0.1 + 50*0.1 + 40*0.1 = 72
    expect(score).toBeCloseTo(72, 0);
  });
});

// ─── assignBadge ──────────────────────────────────────────────────────────────

describe('assignBadge', () => {
  it('assigns "excellent" for score >= 95', () => {
    expect(assignBadge(100)).toBe('excellent');
    expect(assignBadge(95)).toBe('excellent');
  });

  it('assigns "good" for score in [85, 95)', () => {
    expect(assignBadge(94.99)).toBe('good');
    expect(assignBadge(85)).toBe('good');
  });

  it('assigns "needs_attention" for score in [70, 85)', () => {
    expect(assignBadge(84.99)).toBe('needs_attention');
    expect(assignBadge(70)).toBe('needs_attention');
  });

  it('assigns "critical" for score < 70', () => {
    expect(assignBadge(69.99)).toBe('critical');
    expect(assignBadge(0)).toBe('critical');
  });
});

// ─── computeTrend ─────────────────────────────────────────────────────────────

describe('computeTrend', () => {
  it('returns "stable" with delta 0 when no previous score exists', () => {
    const result = computeTrend(80, null);
    expect(result.trend).toBe('stable');
    expect(result.trendDelta).toBe(0);
  });

  it('returns "improving" when score increased by more than 1 point', () => {
    const result = computeTrend(90, 88);
    expect(result.trend).toBe('improving');
    expect(result.trendDelta).toBeCloseTo(2);
  });

  it('returns "declining" when score decreased by more than 1 point', () => {
    const result = computeTrend(80, 82);
    expect(result.trend).toBe('declining');
    expect(result.trendDelta).toBeCloseTo(-2);
  });

  it('returns "stable" when score change is within 1 point', () => {
    expect(computeTrend(80.5, 80).trend).toBe('stable');
    expect(computeTrend(80, 80.5).trend).toBe('stable');
    expect(computeTrend(80, 80).trend).toBe('stable');
  });

  it('returns "stable" at exactly ±1 boundary', () => {
    expect(computeTrend(81, 80).trend).toBe('stable');
    expect(computeTrend(79, 80).trend).toBe('stable');
  });

  it('returns "improving" just above the boundary', () => {
    expect(computeTrend(81.01, 80).trend).toBe('improving');
  });
});

// ─── calculateQualityScore ────────────────────────────────────────────────────

describe('calculateQualityScore', () => {
  it('returns a complete score result', () => {
    const rates: CategoryPassRates = { functional: 96, visual: 90 };
    const result = calculateQualityScore(rates);

    expect(result.score).toBeGreaterThan(0);
    expect(['excellent', 'good', 'needs_attention', 'critical']).toContain(result.badge);
    expect(['improving', 'declining', 'stable']).toContain(result.trend);
    expect(result.calculatedAt).toBeInstanceOf(Date);
  });

  it('assigns correct badge based on computed score', () => {
    const result = calculateQualityScore({ functional: 100 });
    expect(result.badge).toBe('excellent');
    expect(result.score).toBe(100);
  });

  it('uses default weights when none provided', () => {
    const result1 = calculateQualityScore({ functional: 80 });
    const result2 = calculateQualityScore({ functional: 80 }, DEFAULT_WEIGHTS);
    expect(result1.score).toBe(result2.score);
  });

  it('calculates trend when previous score is supplied', () => {
    const result = calculateQualityScore({ functional: 95 }, DEFAULT_WEIGHTS, 80);
    expect(result.trend).toBe('improving');
    expect(result.trendDelta).toBeGreaterThan(0);
  });

  it('includes category scores in the result', () => {
    const rates: CategoryPassRates = { functional: 90, api: 70 };
    const result = calculateQualityScore(rates);
    expect(result.categoryScores).toEqual(rates);
  });
});
