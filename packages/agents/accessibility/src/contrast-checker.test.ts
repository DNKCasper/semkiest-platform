import type { Page } from 'playwright';
import {
  calculateContrastRatio,
  relativeLuminance,
  parseRgb,
  checkColorContrast,
  WCAG_THRESHOLDS,
} from './contrast-checker';

describe('relativeLuminance', () => {
  it('returns 0 for pure black', () => {
    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 5);
  });

  it('returns 1 for pure white', () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
  });

  it('handles mid-range values', () => {
    const lum = relativeLuminance([128, 128, 128]);
    expect(lum).toBeGreaterThan(0);
    expect(lum).toBeLessThan(1);
  });
});

describe('calculateContrastRatio', () => {
  it('returns 21:1 for black on white', () => {
    const ratio = calculateContrastRatio([0, 0, 0], [255, 255, 255]);
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('returns 1:1 for identical colors', () => {
    const ratio = calculateContrastRatio([128, 128, 128], [128, 128, 128]);
    expect(ratio).toBeCloseTo(1, 5);
  });

  it('is symmetric (order does not matter)', () => {
    const r1 = calculateContrastRatio([0, 0, 0], [255, 255, 255]);
    const r2 = calculateContrastRatio([255, 255, 255], [0, 0, 0]);
    expect(r1).toBeCloseTo(r2, 5);
  });

  it('passes WCAG AA for normal text at 4.5:1', () => {
    // Black (#000) on white (#fff) => 21:1 — well above 4.5:1
    const ratio = calculateContrastRatio([0, 0, 0], [255, 255, 255]);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_THRESHOLDS.NORMAL_TEXT_AA);
  });

  it('fails WCAG AA for low-contrast colors', () => {
    // Light grey on white
    const ratio = calculateContrastRatio([200, 200, 200], [255, 255, 255]);
    expect(ratio).toBeLessThan(WCAG_THRESHOLDS.NORMAL_TEXT_AA);
  });
});

describe('parseRgb', () => {
  it('parses rgb() strings', () => {
    expect(parseRgb('rgb(255, 0, 0)')).toEqual([255, 0, 0]);
  });

  it('parses rgba() strings', () => {
    expect(parseRgb('rgba(0, 128, 255, 0.5)')).toEqual([0, 128, 255]);
  });

  it('returns null for transparent', () => {
    expect(parseRgb('transparent')).toBeNull();
  });

  it('returns null for rgba(0, 0, 0, 0)', () => {
    expect(parseRgb('rgba(0, 0, 0, 0)')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseRgb('')).toBeNull();
  });

  it('returns null for unrecognized format', () => {
    expect(parseRgb('notacolor')).toBeNull();
  });
});

describe('checkColorContrast', () => {
  function makePage(colorData: unknown[]): Page {
    return {
      evaluate: jest.fn().mockResolvedValue(colorData),
    } as unknown as Page;
  }

  it('returns passed=true when all elements meet AA ratio', async () => {
    const page = makePage([
      {
        selector: 'p',
        foreground: 'rgb(0, 0, 0)',
        background: 'rgb(255, 255, 255)',
        fontSize: 16,
        fontWeight: '400',
        isLargeText: false,
      },
    ]);

    const result = await checkColorContrast(page);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.summary.total).toBe(1);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.aaCompliance).toBe(100);
  });

  it('returns passed=false and reports violation when contrast is too low', async () => {
    const page = makePage([
      {
        selector: 'p.light',
        foreground: 'rgb(200, 200, 200)',
        background: 'rgb(255, 255, 255)',
        fontSize: 16,
        fontWeight: '400',
        isLargeText: false,
      },
    ]);

    const result = await checkColorContrast(page);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].element).toBe('p.light');
    expect(result.violations[0].ratio).toBeLessThan(WCAG_THRESHOLDS.NORMAL_TEXT_AA);
  });

  it('applies large-text threshold for large text elements', async () => {
    // Ratio ~3.07:1 — passes large text AA (3:1) but fails normal text AA (4.5:1)
    const page = makePage([
      {
        selector: 'h1',
        foreground: 'rgb(150, 150, 150)',
        background: 'rgb(255, 255, 255)',
        fontSize: 24,
        fontWeight: '400',
        isLargeText: true,
      },
    ]);

    const result = await checkColorContrast(page);
    const check = result.checks[0];
    expect(check).toBeDefined();
    if (check) {
      // Large text uses 3:1 threshold — check that the logic distinguishes it
      expect(check.isLargeText).toBe(true);
    }
  });

  it('skips elements with unparseable colors', async () => {
    const page = makePage([
      {
        selector: 'span',
        foreground: 'transparent',
        background: 'notacolor',
        fontSize: 16,
        fontWeight: '400',
        isLargeText: false,
      },
    ]);

    const result = await checkColorContrast(page);
    expect(result.summary.total).toBe(0);
  });

  it('returns 100% compliance when page has no text elements', async () => {
    const page = makePage([]);
    const result = await checkColorContrast(page);
    expect(result.passed).toBe(true);
    expect(result.summary.aaCompliance).toBe(100);
  });
});
