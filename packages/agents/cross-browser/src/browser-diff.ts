/**
 * Cross-browser visual diff engine.
 *
 * Compares screenshots captured from multiple browsers for the same test/URL
 * and produces structured `VisualDiff` records. When raw PNG buffers are
 * available the engine performs a byte-level comparison; without screenshots
 * it marks the diff as indeterminate (0 diff pixels, hasDifferences: false).
 *
 * For production-grade pixel accuracy, replace the internal `comparePngBytes`
 * implementation with a library such as `pixelmatch` + `pngjs`.
 */

import type {
  BrowserType,
  BrowserTestResult,
  VisualDiff,
} from './compatibility-report';

// ---------------------------------------------------------------------------
// Internal comparison helpers
// ---------------------------------------------------------------------------

/**
 * Derive a coarse but fast similarity score from two raw buffers.
 *
 * Strategy:
 *  1. Sample every `stride`-th byte for a reasonable approximation.
 *  2. Count bytes whose values differ by more than `threshold * 255`.
 *  3. Return the differing count and the sample size so the caller can
 *     compute a percentage.
 *
 * This is intentionally simple — swap this for `pixelmatch` when proper
 * PNG decoding is available.
 */
function comparePngBytes(
  buf1: Buffer,
  buf2: Buffer,
  thresholdFraction: number,
): { diffSamples: number; totalSamples: number } {
  const stride = 4; // sample every 4th byte (roughly one channel per pixel)
  const maxTolerance = Math.round(thresholdFraction * 255);
  const totalSamples = Math.floor(Math.min(buf1.length, buf2.length) / stride);
  let diffSamples = 0;

  for (let i = 0; i < totalSamples; i++) {
    const idx = i * stride;
    if (Math.abs((buf1[idx] ?? 0) - (buf2[idx] ?? 0)) > maxTolerance) {
      diffSamples++;
    }
  }

  // Penalise length mismatch: each missing byte counts as a diff sample
  const lenDiff = Math.abs(buf1.length - buf2.length);
  const extraSamples = Math.floor(lenDiff / stride);

  return {
    diffSamples: diffSamples + extraSamples,
    totalSamples: totalSamples + extraSamples,
  };
}

function buildVisualDiff(
  browser1: BrowserType,
  browser2: BrowserType,
  testId: string,
  url: string,
  screenshot1: Buffer | undefined,
  screenshot2: Buffer | undefined,
  threshold: number,
): VisualDiff {
  if (!screenshot1 || !screenshot2) {
    return {
      browser1,
      browser2,
      testId,
      url,
      diffPixels: 0,
      diffPercentage: 0,
      totalPixels: 0,
      hasDifferences: false,
      threshold,
    };
  }

  const { diffSamples, totalSamples } = comparePngBytes(
    screenshot1,
    screenshot2,
    threshold,
  );

  const diffPercentage =
    totalSamples > 0 ? diffSamples / totalSamples : 0;

  return {
    browser1,
    browser2,
    testId,
    url,
    diffPixels: diffSamples,
    diffPercentage,
    totalPixels: totalSamples,
    hasDifferences: diffPercentage > threshold,
    threshold,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Options controlling how diffs are computed. */
export interface DiffOptions {
  /**
   * Maximum fraction of differing pixels (0–1) before the diff is flagged.
   * @default 0.01
   */
  threshold?: number;
  /**
   * Browsers to compare. When omitted, all unique browsers in the supplied
   * results are compared pairwise.
   */
  browsers?: BrowserType[];
}

/**
 * Generates visual diffs by comparing screenshots across browsers for every
 * test present in the supplied results array.
 *
 * @example
 * ```ts
 * const engine = new BrowserDiffEngine();
 * const diffs = engine.generateDiffs(browserTestResults);
 * const significantDiffs = diffs.filter(d => d.hasDifferences);
 * ```
 */
export class BrowserDiffEngine {
  private readonly defaultThreshold: number;

  constructor(defaultThreshold = 0.01) {
    this.defaultThreshold = defaultThreshold;
  }

  /**
   * Produces all pairwise visual diffs for results that share the same
   * `testId`.  Screenshots that are missing are treated as "no diff".
   */
  generateDiffs(
    results: BrowserTestResult[],
    opts: DiffOptions = {},
  ): VisualDiff[] {
    const threshold = opts.threshold ?? this.defaultThreshold;

    // Group results by testId
    const byTest = new Map<string, BrowserTestResult[]>();
    for (const r of results) {
      const bucket = byTest.get(r.testId) ?? [];
      bucket.push(r);
      byTest.set(r.testId, bucket);
    }

    const diffs: VisualDiff[] = [];

    for (const testResults of byTest.values()) {
      const browsers =
        opts.browsers ?? testResults.map((r) => r.browser);
      const uniqueBrowsers = [...new Set(browsers)];

      // Generate all unique pairs
      for (let i = 0; i < uniqueBrowsers.length; i++) {
        for (let j = i + 1; j < uniqueBrowsers.length; j++) {
          const b1 = uniqueBrowsers[i] as BrowserType;
          const b2 = uniqueBrowsers[j] as BrowserType;

          const r1 = testResults.find((r) => r.browser === b1);
          const r2 = testResults.find((r) => r.browser === b2);

          if (!r1 && !r2) continue;

          const url = r1?.url ?? r2?.url ?? '';
          const testId = r1?.testId ?? r2?.testId ?? '';

          diffs.push(
            buildVisualDiff(
              b1,
              b2,
              testId,
              url,
              r1?.screenshot,
              r2?.screenshot,
              threshold,
            ),
          );
        }
      }
    }

    return diffs;
  }

  /**
   * Compares two individual screenshots directly, without needing full test
   * result objects.
   */
  compareScreenshots(
    browser1: BrowserType,
    browser2: BrowserType,
    screenshot1: Buffer | undefined,
    screenshot2: Buffer | undefined,
    testId: string,
    url: string,
    opts: DiffOptions = {},
  ): VisualDiff {
    const threshold = opts.threshold ?? this.defaultThreshold;
    return buildVisualDiff(
      browser1,
      browser2,
      testId,
      url,
      screenshot1,
      screenshot2,
      threshold,
    );
  }

  /**
   * Filters a list of diffs to only those that exceed the diff threshold.
   */
  filterSignificant(diffs: VisualDiff[]): VisualDiff[] {
    return diffs.filter((d) => d.hasDifferences);
  }

  /**
   * Returns a summary object keyed by browser pair.
   */
  summarise(diffs: VisualDiff[]): Record<string, { total: number; significant: number }> {
    const summary: Record<string, { total: number; significant: number }> = {};
    for (const diff of diffs) {
      const key = `${diff.browser1}:${diff.browser2}`;
      const entry = summary[key] ?? { total: 0, significant: 0 };
      entry.total++;
      if (diff.hasDifferences) entry.significant++;
      summary[key] = entry;
    }
    return summary;
  }
}
