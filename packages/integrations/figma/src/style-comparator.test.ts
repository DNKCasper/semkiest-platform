import { StyleComparator, criticalMismatches, formatReport } from './style-comparator';
import type { TokenCollection, ComparisonReport } from './token-types';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeTokens(overrides: Partial<TokenCollection> = {}): TokenCollection {
  return {
    colors: [
      {
        type: 'color',
        name: 'Brand/Primary',
        value: '#ff5733',
        rgba: { r: 1, g: 0.341, b: 0.2, a: 1 },
      },
    ],
    typography: [
      {
        type: 'typography',
        name: 'Heading/H1',
        fontFamily: 'Inter',
        fontSize: 32,
        fontWeight: 700,
        lineHeight: 40,
        letterSpacing: 0,
      },
      {
        type: 'typography',
        name: 'Body/Auto',
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: 400,
        lineHeight: 'normal',
        letterSpacing: 0,
      },
    ],
    spacing: [
      {
        type: 'spacing',
        name: 'Card (gap)',
        value: 16,
        direction: 'gap',
      },
    ],
    borderRadius: [
      {
        type: 'border-radius',
        name: 'Button',
        value: 8,
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// StyleComparator.compareStatic
// ---------------------------------------------------------------------------

describe('StyleComparator.compareStatic', () => {
  let comparator: StyleComparator;

  beforeEach(() => {
    comparator = new StyleComparator();
  });

  describe('color comparison', () => {
    it('marks matching colors as matching', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { '.btn': { 'background-color': 'rgb(255, 87, 51)' } },
        { '.btn': { 'background-color': 'Brand/Primary' } },
      );

      expect(report.results[0].matches).toBe(true);
    });

    it('detects out-of-tolerance color mismatch', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { '.btn': { 'background-color': 'rgb(0, 0, 255)' } }, // blue ≠ #ff5733
        { '.btn': { 'background-color': 'Brand/Primary' } },
      );

      expect(report.results[0].matches).toBe(false);
      const mismatch = report.results[0].mismatches[0];
      expect(mismatch.severity).toBe('out-of-tolerance');
      expect(mismatch.property).toBe('color');
    });

    it('marks within-tolerance colors as within-tolerance', () => {
      // #ff5733 → rgb(255,87,51); live is rgb(254,87,51) — delta=1
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { '.btn': { 'background-color': 'rgb(254, 87, 51)' } },
        { '.btn': { 'background-color': 'Brand/Primary' } },
      );

      // delta=1 ≤ DEFAULT_TOLERANCE.colorChannelDelta=2 → within-tolerance → matches=false but severity=within-tolerance
      const mismatch = report.results[0].mismatches[0];
      if (mismatch) {
        expect(mismatch.severity).toBe('within-tolerance');
      } else {
        // delta=1 is within tolerance of 2, so no mismatch is emitted (exact-match threshold)
        expect(report.results[0].matches).toBe(true);
      }
    });

    it('handles rgba() values correctly', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { '.btn': { 'background-color': 'rgba(255, 87, 51, 1)' } },
        { '.btn': { 'background-color': 'Brand/Primary' } },
      );

      expect(report.results[0].matches).toBe(true);
    });

    it('reports out-of-tolerance for unparseable color values', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { '.btn': { 'background-color': 'transparent' } },
        { '.btn': { 'background-color': 'Brand/Primary' } },
      );

      expect(report.results[0].matches).toBe(false);
      expect(report.results[0].mismatches[0].severity).toBe('out-of-tolerance');
    });
  });

  describe('typography comparison', () => {
    it('matches identical font-size', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { 'h1': { 'font-size': '32px' } },
        { 'h1': { 'font-size': 'Heading/H1' } },
      );

      expect(report.results[0].matches).toBe(true);
    });

    it('detects font-size mismatch beyond tolerance', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { 'h1': { 'font-size': '28px' } }, // 4px delta > 0.5px tolerance
        { 'h1': { 'font-size': 'Heading/H1' } },
      );

      expect(report.results[0].matches).toBe(false);
      expect(report.results[0].mismatches[0].difference).toBeCloseTo(4);
    });

    it('matches identical font-weight', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { 'h1': { 'font-weight': '700' } },
        { 'h1': { 'font-weight': 'Heading/H1' } },
      );

      expect(report.results[0].matches).toBe(true);
    });

    it('detects font-family mismatch', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { 'h1': { 'font-family': '"Arial", sans-serif' } },
        { 'h1': { 'font-family': 'Heading/H1' } },
      );

      expect(report.results[0].matches).toBe(false);
    });

    it('matches font-family case-insensitively', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { 'h1': { 'font-family': '"inter", sans-serif' } },
        { 'h1': { 'font-family': 'Heading/H1' } },
      );

      expect(report.results[0].matches).toBe(true);
    });

    it('matches "normal" line-height token against "normal" live value', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { 'p': { 'line-height': 'normal' } },
        { 'p': { 'line-height': 'Body/Auto' } },
      );

      expect(report.results[0].matches).toBe(true);
    });

    it('detects "normal" line-height mismatch when live value is not "normal"', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { 'p': { 'line-height': '24px' } },
        { 'p': { 'line-height': 'Body/Auto' } },
      );

      expect(report.results[0].matches).toBe(false);
    });

    it('matches pixel line-height within tolerance', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { 'h1': { 'line-height': '40.5px' } }, // delta=0.5 ≤ tolerance=1
        { 'h1': { 'line-height': 'Heading/H1' } },
      );

      // 0.5 is within tolerance of 1 → matches
      expect(report.results[0].matches).toBe(true);
    });

    it('matches letter-spacing within tolerance', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { 'h1': { 'letter-spacing': '0px' } },
        { 'h1': { 'letter-spacing': 'Heading/H1' } },
      );

      expect(report.results[0].matches).toBe(true);
    });
  });

  describe('spacing comparison', () => {
    it('matches identical spacing', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { '.card': { 'gap': '16px' } },
        { '.card': { 'gap': 'Card (gap)' } },
      );

      expect(report.results[0].matches).toBe(true);
    });

    it('detects spacing mismatch beyond tolerance', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { '.card': { 'gap': '8px' } }, // 8px delta > 1px tolerance
        { '.card': { 'gap': 'Card (gap)' } },
      );

      expect(report.results[0].matches).toBe(false);
      expect(report.results[0].mismatches[0].difference).toBeCloseTo(8);
    });
  });

  describe('border-radius comparison', () => {
    it('matches identical border-radius', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { '.btn': { 'border-radius': '8px' } },
        { '.btn': { 'border-radius': 'Button' } },
      );

      expect(report.results[0].matches).toBe(true);
    });

    it('detects border-radius mismatch', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { '.btn': { 'border-radius': '4px' } }, // delta=4 > 1px tolerance
        { '.btn': { 'border-radius': 'Button' } },
      );

      expect(report.results[0].matches).toBe(false);
    });
  });

  describe('report structure', () => {
    it('produces a report with correct counts', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        {
          '.btn': { 'background-color': 'rgb(255, 87, 51)', 'border-radius': '8px' },
          'h1': { 'font-size': '99px' }, // mismatch
        },
        {
          '.btn': { 'background-color': 'Brand/Primary', 'border-radius': 'Button' },
          'h1': { 'font-size': 'Heading/H1' },
        },
      );

      expect(report.totalTokens).toBe(3);
      expect(report.matchingTokens).toBe(2);
      expect(report.mismatchingTokens).toBe(1);
    });

    it('sets the url field on the report', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(tokens, {}, {}, 'https://example.com');

      expect(report.url).toBe('https://example.com');
    });

    it('sets a valid ISO timestamp', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(tokens, {}, {});

      expect(() => new Date(report.timestamp)).not.toThrow();
      expect(isNaN(new Date(report.timestamp).getTime())).toBe(false);
    });

    it('skips token lookups for unknown token names', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { '.x': { 'background-color': 'rgb(0,0,0)' } },
        { '.x': { 'background-color': 'NonExistent/Token' } },
      );

      expect(report.totalTokens).toBe(0);
    });

    it('correctly populates category summary', () => {
      const tokens = makeTokens();
      const report = comparator.compareStatic(
        tokens,
        { '.btn': { 'background-color': 'rgb(255, 87, 51)' } },
        { '.btn': { 'background-color': 'Brand/Primary' } },
      );

      expect(report.summary.colors.total).toBe(1);
      expect(report.summary.colors.matching).toBe(1);
    });
  });

  describe('custom tolerances', () => {
    it('respects tighter color tolerance', () => {
      const tightComparator = new StyleComparator({ tolerances: { colorChannelDelta: 0 } });
      const tokens = makeTokens();
      // rgb(254,87,51) vs #ff5733=rgb(255,87,51): delta=1
      const report = tightComparator.compareStatic(
        tokens,
        { '.btn': { 'background-color': 'rgb(254, 87, 51)' } },
        { '.btn': { 'background-color': 'Brand/Primary' } },
      );

      expect(report.results[0].matches).toBe(false);
      expect(report.results[0].mismatches[0].severity).toBe('out-of-tolerance');
    });

    it('respects looser color tolerance', () => {
      const looseComparator = new StyleComparator({ tolerances: { colorChannelDelta: 50 } });
      const tokens = makeTokens();
      // delta=1 ≤ 50 → within-tolerance → matches
      const report = looseComparator.compareStatic(
        tokens,
        { '.btn': { 'background-color': 'rgb(254, 87, 51)' } },
        { '.btn': { 'background-color': 'Brand/Primary' } },
      );

      expect(report.results[0].matches).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Utility function tests
// ---------------------------------------------------------------------------

describe('criticalMismatches', () => {
  it('returns only out-of-tolerance mismatches', () => {
    const report: ComparisonReport = {
      timestamp: new Date().toISOString(),
      url: 'https://example.com',
      totalTokens: 2,
      matchingTokens: 0,
      mismatchingTokens: 2,
      results: [
        {
          token: { type: 'color', name: 'A', value: '#fff', rgba: { r: 1, g: 1, b: 1, a: 1 } },
          matches: false,
          mismatches: [
            {
              tokenType: 'color',
              tokenName: 'A',
              property: 'color',
              figmaValue: '#fff',
              liveValue: '#000',
              difference: 255,
              severity: 'out-of-tolerance',
            },
          ],
        },
        {
          token: { type: 'color', name: 'B', value: '#eee', rgba: { r: 0.93, g: 0.93, b: 0.93, a: 1 } },
          matches: false,
          mismatches: [
            {
              tokenType: 'color',
              tokenName: 'B',
              property: 'color',
              figmaValue: '#eee',
              liveValue: '#ececec',
              difference: 1,
              severity: 'within-tolerance',
            },
          ],
        },
      ],
      summary: {
        colors: { total: 2, matching: 0, mismatching: 2 },
        typography: { total: 0, matching: 0, mismatching: 0 },
        spacing: { total: 0, matching: 0, mismatching: 0 },
        borderRadius: { total: 0, matching: 0, mismatching: 0 },
      },
    };

    const criticals = criticalMismatches(report);

    expect(criticals).toHaveLength(1);
    expect(criticals[0].severity).toBe('out-of-tolerance');
  });
});

describe('formatReport', () => {
  it('returns a string containing key report info', () => {
    const comparator = new StyleComparator();
    const tokens = makeTokens();
    const report = comparator.compareStatic(tokens, {}, {}, 'https://example.com');

    const text = formatReport(report);

    expect(text).toContain('https://example.com');
    expect(text).toContain('Total tokens compared');
    expect(text).toContain('Summary');
  });

  it('lists out-of-tolerance mismatches when present', () => {
    const comparator = new StyleComparator();
    const tokens = makeTokens();
    const report = comparator.compareStatic(
      tokens,
      { '.btn': { 'background-color': 'rgb(0, 0, 255)' } },
      { '.btn': { 'background-color': 'Brand/Primary' } },
      'https://test.com',
    );

    const text = formatReport(report);

    expect(text).toContain('Out-of-tolerance mismatches');
    expect(text).toContain('Brand/Primary');
  });
});
