/**
 * StyleComparator — compares a TokenCollection against computed CSS styles
 * captured from a live site using Playwright.
 *
 * For each selector/property pair in the provided SelectorMap, the comparator:
 *  1. Navigates Playwright to the target URL
 *  2. Reads the computed style for each mapping
 *  3. Looks up the corresponding design token from the TokenCollection
 *  4. Compares values within configurable tolerance thresholds
 *  5. Returns a ComparisonReport
 */

import type { Browser, Page } from 'playwright';
import type {
  BorderRadiusToken,
  ColorToken,
  ComparisonReport,
  DesignToken,
  MismatchSeverity,
  RgbaColor,
  SelectorMap,
  SpacingToken,
  ToleranceThresholds,
  TokenCollection,
  TokenComparisonResult,
  TokenMismatch,
  TokenType,
  TypographyToken,
} from './token-types';
import { DEFAULT_TOLERANCE } from './token-types';
import { flattenTokenCollection } from './token-extractor';

// ---------------------------------------------------------------------------
// CSS value parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parses a CSS `rgb()` or `rgba()` computed value into a normalised RgbaColor.
 * Returns `null` when the value is not a recognised colour function.
 */
function parseComputedColor(value: string): RgbaColor | null {
  const match = value
    .trim()
    .match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (!match) return null;
  return {
    r: parseInt(match[1], 10) / 255,
    g: parseInt(match[2], 10) / 255,
    b: parseInt(match[3], 10) / 255,
    a: match[4] !== undefined ? parseFloat(match[4]) : 1,
  };
}

/**
 * Parses a CSS pixel value such as "16px" → 16, or "1.5rem" at 16px base → 24.
 * Returns `null` when the string cannot be parsed as a numeric measurement.
 */
function parsePixelValue(value: string): number | null {
  const trimmed = value.trim();
  const px = trimmed.match(/^([\d.]+)px$/);
  if (px) return parseFloat(px[1]);
  // Browsers return computed values in px, so this covers the common case.
  return null;
}

/**
 * Resolves a CSS `font-weight` string ("bold", "normal", "700", etc.) to a
 * numeric weight.
 */
function parseFontWeight(value: string): number | null {
  const numeric = parseFloat(value);
  if (!isNaN(numeric)) return numeric;
  if (value === 'bold') return 700;
  if (value === 'normal') return 400;
  return null;
}

// ---------------------------------------------------------------------------
// Colour comparison
// ---------------------------------------------------------------------------

/**
 * Returns the maximum per-channel absolute difference between two colours
 * (channels normalised to 0–1, result in 0–255 range).
 */
function colorChannelDelta(a: RgbaColor, b: RgbaColor): number {
  const d = (x: number, y: number) => Math.abs(Math.round(x * 255) - Math.round(y * 255));
  return Math.max(d(a.r, b.r), d(a.g, b.g), d(a.b, b.b));
}

/**
 * Converts a normalised RgbaColor to a hex string for display purposes.
 */
function colorToDisplay(c: RgbaColor): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

// ---------------------------------------------------------------------------
// Mismatch severity helper
// ---------------------------------------------------------------------------

function severity(delta: number, tolerance: number): MismatchSeverity {
  if (delta === 0) return 'exact-match';
  if (delta <= tolerance) return 'within-tolerance';
  return 'out-of-tolerance';
}

// ---------------------------------------------------------------------------
// Per-type comparison functions
// ---------------------------------------------------------------------------

function compareColor(
  token: ColorToken,
  liveValue: string,
  tolerances: ToleranceThresholds,
): TokenMismatch[] {
  const mismatches: TokenMismatch[] = [];
  const liveColor = parseComputedColor(liveValue);
  if (!liveColor) {
    mismatches.push({
      tokenType: 'color',
      tokenName: token.name,
      property: 'color',
      figmaValue: token.value,
      liveValue,
      difference: null,
      severity: 'out-of-tolerance',
    });
    return mismatches;
  }

  const delta = colorChannelDelta(token.rgba, liveColor);
  const sev = severity(delta, tolerances.colorChannelDelta);
  if (sev !== 'exact-match') {
    mismatches.push({
      tokenType: 'color',
      tokenName: token.name,
      property: 'color',
      figmaValue: token.value,
      liveValue: colorToDisplay(liveColor),
      difference: delta,
      severity: sev,
    });
  }
  return mismatches;
}

function compareTypography(
  token: TypographyToken,
  property: string,
  liveValue: string,
  tolerances: ToleranceThresholds,
): TokenMismatch[] {
  const mismatches: TokenMismatch[] = [];

  const addMismatch = (
    prop: string,
    figmaVal: string | number,
    liveVal: string | number,
    diff: number | null,
    tol: number,
  ) => {
    const sev = diff !== null ? severity(diff, tol) : 'out-of-tolerance';
    if (sev !== 'exact-match') {
      mismatches.push({
        tokenType: 'typography',
        tokenName: token.name,
        property: prop,
        figmaValue: figmaVal,
        liveValue: liveVal,
        difference: diff,
        severity: sev,
      });
    }
  };

  switch (property) {
    case 'font-family': {
      const liveFamilies = liveValue.split(',').map((f) => f.trim().replace(/["']/g, ''));
      if (!liveFamilies.some((f) => f.toLowerCase() === token.fontFamily.toLowerCase())) {
        addMismatch(property, token.fontFamily, liveValue, null, 0);
      }
      break;
    }
    case 'font-size': {
      const liveSize = parsePixelValue(liveValue);
      if (liveSize !== null) {
        const diff = Math.abs(token.fontSize - liveSize);
        addMismatch(property, `${token.fontSize}px`, liveValue, diff, tolerances.fontSizePx);
      }
      break;
    }
    case 'font-weight': {
      const liveWeight = parseFontWeight(liveValue);
      if (liveWeight !== null) {
        const diff = Math.abs(token.fontWeight - liveWeight);
        addMismatch(property, token.fontWeight, liveValue, diff, tolerances.fontWeight);
      }
      break;
    }
    case 'line-height': {
      if (token.lineHeight === 'normal') {
        if (liveValue !== 'normal') {
          addMismatch(property, 'normal', liveValue, null, 0);
        }
      } else {
        const liveLH = parsePixelValue(liveValue);
        if (liveLH !== null) {
          const diff = Math.abs(token.lineHeight - liveLH);
          addMismatch(property, `${token.lineHeight}px`, liveValue, diff, tolerances.lineHeightPx);
        }
      }
      break;
    }
    case 'letter-spacing': {
      const liveLS = parsePixelValue(liveValue);
      if (liveLS !== null) {
        const diff = Math.abs(token.letterSpacing - liveLS);
        addMismatch(property, `${token.letterSpacing}px`, liveValue, diff, tolerances.letterSpacingPx);
      }
      break;
    }
    default:
      break;
  }

  return mismatches;
}

function compareSpacing(
  token: SpacingToken,
  liveValue: string,
  tolerances: ToleranceThresholds,
): TokenMismatch[] {
  const mismatches: TokenMismatch[] = [];
  const liveSpacing = parsePixelValue(liveValue);
  if (liveSpacing === null) return mismatches;

  const diff = Math.abs(token.value - liveSpacing);
  const sev = severity(diff, tolerances.spacingPx);
  if (sev !== 'exact-match') {
    mismatches.push({
      tokenType: 'spacing',
      tokenName: token.name,
      property: 'spacing',
      figmaValue: `${token.value}px`,
      liveValue,
      difference: diff,
      severity: sev,
    });
  }
  return mismatches;
}

function compareBorderRadius(
  token: BorderRadiusToken,
  liveValue: string,
  tolerances: ToleranceThresholds,
): TokenMismatch[] {
  const mismatches: TokenMismatch[] = [];
  const liveRadius = parsePixelValue(liveValue);
  if (liveRadius === null) return mismatches;

  const diff = Math.abs(token.value - liveRadius);
  const sev = severity(diff, tolerances.borderRadiusPx);
  if (sev !== 'exact-match') {
    mismatches.push({
      tokenType: 'border-radius',
      tokenName: token.name,
      property: 'border-radius',
      figmaValue: `${token.value}px`,
      liveValue,
      difference: diff,
      severity: sev,
    });
  }
  return mismatches;
}

// ---------------------------------------------------------------------------
// Token lookup
// ---------------------------------------------------------------------------

function findToken(
  allTokens: DesignToken[],
  name: string,
  type?: TokenType,
): DesignToken | undefined {
  return allTokens.find(
    (t) => t.name === name && (type === undefined || t.type === type),
  );
}

// ---------------------------------------------------------------------------
// Playwright page helpers
// ---------------------------------------------------------------------------

/**
 * Reads the computed CSS value for `property` on the first element matching
 * `selector`.  Returns `null` when no matching element is found.
 */
async function getComputedProperty(
  page: Page,
  selector: string,
  property: string,
): Promise<string | null> {
  return page.evaluate(
    ({ sel, prop }: { sel: string; prop: string }) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return window.getComputedStyle(el).getPropertyValue(prop).trim();
    },
    { sel: selector, prop: property },
  );
}

// ---------------------------------------------------------------------------
// StyleComparator
// ---------------------------------------------------------------------------

export interface StyleComparatorConfig {
  /** Override default tolerance values */
  tolerances?: Partial<ToleranceThresholds>;
}

/**
 * Compares a TokenCollection against computed styles on a live web page.
 *
 * @example
 * ```ts
 * const comparator = new StyleComparator({ tolerances: { colorChannelDelta: 5 } });
 * const report = await comparator.compare(
 *   tokens,
 *   'https://example.com',
 *   {
 *     '.btn-primary': { 'background-color': 'Brand/Primary', 'border-radius': 'Button/Radius' },
 *   },
 * );
 * ```
 */
export class StyleComparator {
  private readonly tolerances: ToleranceThresholds;

  constructor(config: StyleComparatorConfig = {}) {
    this.tolerances = { ...DEFAULT_TOLERANCE, ...(config.tolerances ?? {}) };
  }

  /**
   * Runs the comparison by launching a Playwright browser, navigating to `url`,
   * capturing computed styles, and comparing against `tokens`.
   *
   * @param tokens - Token collection produced by FigmaTokenExtractor
   * @param url - The live site URL to compare against
   * @param selectorMap - Maps CSS selectors → property → token name
   * @param browser - Optional pre-created Playwright browser instance.
   *   When omitted, the method creates its own chromium instance and closes it
   *   after the comparison.
   */
  async compare(
    tokens: TokenCollection,
    url: string,
    selectorMap: SelectorMap,
    browser?: Browser,
  ): Promise<ComparisonReport> {
    const allTokens = flattenTokenCollection(tokens);
    let ownBrowser = false;
    let resolvedBrowser = browser;

    if (!resolvedBrowser) {
      // Dynamic import to keep playwright as a peer / optional dep at runtime
      const { chromium } = await import('playwright');
      resolvedBrowser = await chromium.launch();
      ownBrowser = true;
    }

    const page = await resolvedBrowser.newPage();
    const results: TokenComparisonResult[] = [];

    try {
      await page.goto(url, { waitUntil: 'networkidle' });

      for (const [selector, propertyMap] of Object.entries(selectorMap)) {
        for (const [cssProperty, tokenName] of Object.entries(propertyMap)) {
          const liveValue = await getComputedProperty(page, selector, cssProperty);
          const token = findToken(allTokens, tokenName);

          if (!token) continue;
          if (liveValue === null) continue;

          const mismatches = this._compareSingleToken(token, cssProperty, liveValue);
          results.push({
            token,
            matches: mismatches.length === 0,
            mismatches,
          });
        }
      }
    } finally {
      await page.close();
      if (ownBrowser) await resolvedBrowser.close();
    }

    return this._buildReport(url, results);
  }

  /**
   * Compares a set of pre-captured style values without launching a browser.
   * Useful for testing or when styles are captured externally.
   *
   * @param tokens - Token collection to validate against
   * @param capturedStyles - Map of selector → CSS property → computed value
   * @param selectorMap - Maps selectors/properties to token names
   * @param url - URL label for the report (informational)
   */
  compareStatic(
    tokens: TokenCollection,
    capturedStyles: Record<string, Record<string, string>>,
    selectorMap: SelectorMap,
    url = 'static',
  ): ComparisonReport {
    const allTokens = flattenTokenCollection(tokens);
    const results: TokenComparisonResult[] = [];

    for (const [selector, propertyMap] of Object.entries(selectorMap)) {
      for (const [cssProperty, tokenName] of Object.entries(propertyMap)) {
        const liveValue = capturedStyles[selector]?.[cssProperty];
        const token = findToken(allTokens, tokenName);

        if (!token || liveValue === undefined) continue;

        const mismatches = this._compareSingleToken(token, cssProperty, liveValue);
        results.push({
          token,
          matches: mismatches.length === 0,
          mismatches,
        });
      }
    }

    return this._buildReport(url, results);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _compareSingleToken(
    token: DesignToken,
    cssProperty: string,
    liveValue: string,
  ): TokenMismatch[] {
    switch (token.type) {
      case 'color':
        return compareColor(token as ColorToken, liveValue, this.tolerances);
      case 'typography':
        return compareTypography(
          token as TypographyToken,
          cssProperty,
          liveValue,
          this.tolerances,
        );
      case 'spacing':
        return compareSpacing(token as SpacingToken, liveValue, this.tolerances);
      case 'border-radius':
        return compareBorderRadius(token as BorderRadiusToken, liveValue, this.tolerances);
      default:
        return [];
    }
  }

  private _buildReport(url: string, results: TokenComparisonResult[]): ComparisonReport {
    const countByType = (type: TokenType) => {
      const ofType = results.filter((r) => r.token.type === type);
      return {
        total: ofType.length,
        matching: ofType.filter((r) => r.matches).length,
        mismatching: ofType.filter((r) => !r.matches).length,
      };
    };

    return {
      timestamp: new Date().toISOString(),
      url,
      totalTokens: results.length,
      matchingTokens: results.filter((r) => r.matches).length,
      mismatchingTokens: results.filter((r) => !r.matches).length,
      results,
      summary: {
        colors: countByType('color'),
        typography: countByType('typography'),
        spacing: countByType('spacing'),
        borderRadius: countByType('border-radius'),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Utility exports
// ---------------------------------------------------------------------------

/** Returns only out-of-tolerance mismatches from a report */
export function criticalMismatches(report: ComparisonReport): TokenMismatch[] {
  return report.results.flatMap((r) =>
    r.mismatches.filter((m) => m.severity === 'out-of-tolerance'),
  );
}

/** Formats a ComparisonReport as a human-readable summary string */
export function formatReport(report: ComparisonReport): string {
  const lines: string[] = [
    `Design Token Comparison Report`,
    `URL: ${report.url}`,
    `Timestamp: ${report.timestamp}`,
    ``,
    `Summary`,
    `  Total tokens compared : ${report.totalTokens}`,
    `  Matching              : ${report.matchingTokens}`,
    `  Mismatching           : ${report.mismatchingTokens}`,
    ``,
    `By category`,
    `  Colors      ${report.summary.colors.matching}/${report.summary.colors.total} match`,
    `  Typography  ${report.summary.typography.matching}/${report.summary.typography.total} match`,
    `  Spacing     ${report.summary.spacing.matching}/${report.summary.spacing.total} match`,
    `  Radius      ${report.summary.borderRadius.matching}/${report.summary.borderRadius.total} match`,
  ];

  const criticals = criticalMismatches(report);
  if (criticals.length > 0) {
    lines.push(``, `Out-of-tolerance mismatches`);
    for (const m of criticals) {
      lines.push(
        `  [${m.tokenType}] ${m.tokenName} » ${m.property}: ` +
          `figma=${m.figmaValue}, live=${m.liveValue}` +
          (m.difference !== null ? `, Δ=${m.difference}` : ''),
      );
    }
  }

  return lines.join('\n');
}
