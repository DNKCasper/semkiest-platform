import type { Page } from 'playwright';

/** WCAG 2.1 contrast ratio thresholds. */
export const WCAG_THRESHOLDS = {
  /** Normal text: AA level requires 4.5:1 */
  NORMAL_TEXT_AA: 4.5,
  /** Large text (≥18pt or ≥14pt bold): AA level requires 3:1 */
  LARGE_TEXT_AA: 3.0,
  /** Normal text: AAA level requires 7:1 */
  NORMAL_TEXT_AAA: 7.0,
  /** Large text: AAA level requires 4.5:1 */
  LARGE_TEXT_AAA: 4.5,
} as const;

export interface ContrastCheckResult {
  passed: boolean;
  violations: ContrastViolation[];
  checks: ContrastCheck[];
  summary: ContrastSummary;
}

export interface ContrastViolation {
  element: string;
  foreground: string;
  background: string;
  ratio: number;
  requiredRatio: number;
  isLargeText: boolean;
  wcagLevel: 'AA' | 'AAA';
  severity: 'critical' | 'serious' | 'moderate';
}

export interface ContrastCheck {
  element: string;
  foreground: string;
  background: string;
  ratio: number;
  isLargeText: boolean;
  passesAA: boolean;
  passesAAA: boolean;
}

export interface ContrastSummary {
  total: number;
  passed: number;
  failed: number;
  aaCompliance: number;
}

/** Raw color/text data extracted from the DOM for a single element. */
interface ElementColorData {
  selector: string;
  foreground: string;
  background: string;
  fontSize: number;
  fontWeight: string;
  isLargeText: boolean;
}

/**
 * Validates color contrast ratios for all visible text elements on a page,
 * checking against WCAG 2.1 AA standards.
 */
export async function checkColorContrast(page: Page): Promise<ContrastCheckResult> {
  const colorData = await extractElementColors(page);
  const checks: ContrastCheck[] = [];
  const violations: ContrastViolation[] = [];

  for (const data of colorData) {
    const fgRgb = parseRgb(data.foreground);
    const bgRgb = parseRgb(data.background);

    if (!fgRgb || !bgRgb) {
      continue;
    }

    const ratio = calculateContrastRatio(fgRgb, bgRgb);
    const requiredAA = data.isLargeText
      ? WCAG_THRESHOLDS.LARGE_TEXT_AA
      : WCAG_THRESHOLDS.NORMAL_TEXT_AA;
    const requiredAAA = data.isLargeText
      ? WCAG_THRESHOLDS.LARGE_TEXT_AAA
      : WCAG_THRESHOLDS.NORMAL_TEXT_AAA;

    const passesAA = ratio >= requiredAA;
    const passesAAA = ratio >= requiredAAA;

    checks.push({
      element: data.selector,
      foreground: data.foreground,
      background: data.background,
      ratio: Math.round(ratio * 100) / 100,
      isLargeText: data.isLargeText,
      passesAA,
      passesAAA,
    });

    if (!passesAA) {
      violations.push({
        element: data.selector,
        foreground: data.foreground,
        background: data.background,
        ratio: Math.round(ratio * 100) / 100,
        requiredRatio: requiredAA,
        isLargeText: data.isLargeText,
        wcagLevel: 'AA',
        severity: ratio < 2.0 ? 'critical' : ratio < 3.0 ? 'serious' : 'moderate',
      });
    }
  }

  const passed = checks.filter((c) => c.passesAA).length;
  const failed = checks.length - passed;
  const aaCompliance = checks.length > 0 ? Math.round((passed / checks.length) * 100) : 100;

  return {
    passed: violations.length === 0,
    violations,
    checks,
    summary: {
      total: checks.length,
      passed,
      failed,
      aaCompliance,
    },
  };
}

/**
 * Computes the WCAG contrast ratio between two sRGB colors.
 *
 * Formula: (L1 + 0.05) / (L2 + 0.05) where L1 >= L2.
 * @see https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
export function calculateContrastRatio(
  foreground: [number, number, number],
  background: [number, number, number]
): number {
  const fgLuminance = relativeLuminance(foreground);
  const bgLuminance = relativeLuminance(background);
  const lighter = Math.max(fgLuminance, bgLuminance);
  const darker = Math.min(fgLuminance, bgLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Calculates the relative luminance of an sRGB color.
 * @see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const toLinear = (c: number): number => {
    const srgb = c / 255;
    return srgb <= 0.03928
      ? srgb / 12.92
      : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Parses an `rgb(r, g, b)` or `rgba(r, g, b, a)` string into a numeric triple.
 * Returns `null` for transparent or unparseable values.
 */
export function parseRgb(colorStr: string): [number, number, number] | null {
  if (!colorStr || colorStr === 'transparent' || colorStr === 'rgba(0, 0, 0, 0)') {
    return null;
  }
  const match = colorStr.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/
  );
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

/**
 * Extracts foreground/background colors and font metrics for visible text
 * elements from the page.
 */
async function extractElementColors(page: Page): Promise<ElementColorData[]> {
  return page.evaluate((): ElementColorData[] => {
    const textSelectors = [
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'a', 'button', 'label', 'span', 'li', 'td', 'th',
      'input[type="submit"]', 'input[type="button"]',
    ].join(', ');

    const elements = Array.from(document.querySelectorAll<HTMLElement>(textSelectors));

    const results: ElementColorData[] = [];

    for (const el of elements) {
      // Skip elements with no meaningful text
      const text = el.textContent?.trim();
      if (!text) continue;

      const style = window.getComputedStyle(el);

      // Skip hidden elements
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      const fontSize = parseFloat(style.fontSize || '16');
      const fontWeight = style.fontWeight || '400';

      // WCAG large text: ≥18pt (24px) normal, or ≥14pt (18.67px) bold
      const isBold = parseInt(fontWeight, 10) >= 700 || fontWeight === 'bold';
      const isLargeText = fontSize >= 24 || (isBold && fontSize >= 18.67);

      const background = resolveBackground(el);

      const selector = el.id
        ? `#${el.id}`
        : `${el.tagName.toLowerCase()}${
            el.className ? `.${String(el.className).split(' ')[0]}` : ''
          }`;

      results.push({
        selector,
        foreground: style.color,
        background,
        fontSize,
        fontWeight,
        isLargeText,
      });

      // Limit to 100 elements to avoid overwhelming output
      if (results.length >= 100) break;
    }

    return results;

    /** Walk up the DOM tree to find the nearest opaque background color. */
    function resolveBackground(el: HTMLElement): string {
      let node: HTMLElement | null = el;
      while (node) {
        const bg = window.getComputedStyle(node).backgroundColor;
        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
          return bg;
        }
        node = node.parentElement;
      }
      return 'rgb(255, 255, 255)'; // Default: white
    }
  });
}
