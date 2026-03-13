/**
 * ViolationCategorizer - Groups axe-core violations by severity, computes
 * WCAG 2.1 AA compliance status, and attaches remediation guidance.
 */

import type { AxeViolation, ImpactLevel, PageScanResult } from './axe-runner';

// ─── Public types ────────────────────────────────────────────────────────────

/** WCAG 2.1 AA compliance status for a single page. */
export type ComplianceStatus =
  | 'compliant'       // zero violations
  | 'minor-issues'    // only minor violations
  | 'needs-improvement' // moderate / serious violations
  | 'non-compliant';  // critical violations present

/** Per-severity violation counts. */
export interface SeverityBreakdown {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
}

/** Remediation guidance for a specific violation rule. */
export interface RemediationGuidance {
  /** Short summary of the fix. */
  summary: string;
  /** Step-by-step remediation instructions. */
  steps: string[];
  /** Relevant WCAG success criterion (e.g. "1.4.3"). */
  wcagCriterion?: string;
  /** Link to additional documentation. */
  referenceUrl?: string;
}

/** An axe violation enriched with categorisation data. */
export interface CategorizedViolation {
  /** Original axe-core violation details. */
  violation: AxeViolation;
  /** Categorised severity level. */
  severity: ImpactLevel;
  /** WCAG 2.1 AA specific tags extracted from the violation tags. */
  wcagTags: string[];
  /** Human-readable remediation guidance. */
  remediation: RemediationGuidance;
  /** Number of affected DOM nodes. */
  affectedNodeCount: number;
}

/** Categorisation results for a single page. */
export interface CategorizedPageResult {
  /** The URL that was audited. */
  url: string;
  /** ISO-8601 scan timestamp. */
  scannedAt: string;
  /** Whether the underlying scan succeeded. */
  scanSucceeded: boolean;
  /** WCAG 2.1 AA compliance status for this page. */
  complianceStatus: ComplianceStatus;
  /** Accessibility score 0–100 (100 = fully compliant). */
  accessibilityScore: number;
  /** Violations grouped and enriched with remediation guidance. */
  categorizedViolations: CategorizedViolation[];
  /** Quick summary of violation counts per severity. */
  severityBreakdown: SeverityBreakdown;
  /** Total number of rules that passed. */
  passCount: number;
  /** Total number of rules that couldn't be fully evaluated. */
  incompleteCount: number;
  /** Error message when scanSucceeded is false. */
  errorMessage?: string;
}

/** Aggregated results across all scanned pages. */
export interface CategorizationReport {
  /** ISO-8601 timestamp when categorisation was performed. */
  categorizedAt: string;
  /** Total number of pages in the report. */
  totalPages: number;
  /** Number of pages with no violations. */
  compliantPages: number;
  /** Overall accessibility score averaged across all pages. */
  overallScore: number;
  /** Per-page categorisation results. */
  pages: CategorizedPageResult[];
  /** Aggregated severity breakdown across all pages. */
  totalSeverityBreakdown: SeverityBreakdown;
}

// ─── Remediation guidance library ────────────────────────────────────────────

/**
 * Lookup table mapping axe-core rule IDs to curated remediation guidance.
 * Rules not listed here fall back to a generic guidance object.
 */
const REMEDIATION_LIBRARY: Record<string, RemediationGuidance> = {
  'color-contrast': {
    summary: 'Ensure sufficient colour contrast between text and background.',
    steps: [
      'Use a contrast checker tool (e.g. WebAIM Contrast Checker) to measure ratios.',
      'Normal text (< 18pt / < 14pt bold) requires a 4.5:1 ratio.',
      'Large text (≥ 18pt / ≥ 14pt bold) requires a 3:1 ratio.',
      'Update foreground or background colour values in CSS to meet the minimum ratio.',
    ],
    wcagCriterion: '1.4.3',
    referenceUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum',
  },
  'image-alt': {
    summary: 'All <img> elements must have descriptive alternative text.',
    steps: [
      'Add an alt attribute to every <img> element.',
      'Write meaningful alt text describing the image content and purpose.',
      'Use alt="" for purely decorative images.',
      'Avoid redundant phrases like "image of" or "picture of".',
    ],
    wcagCriterion: '1.1.1',
    referenceUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content',
  },
  'label': {
    summary: 'Form controls must have programmatically associated labels.',
    steps: [
      'Add a <label> element with a "for" attribute matching the control\'s "id".',
      'Alternatively use aria-label or aria-labelledby on the control.',
      'Verify the label is visible or at minimum accessible to screen readers.',
    ],
    wcagCriterion: '1.3.1',
    referenceUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships',
  },
  'button-name': {
    summary: 'Buttons must have an accessible name.',
    steps: [
      'Add descriptive text content inside the <button> element.',
      'For icon-only buttons, add aria-label with a meaningful description.',
      'Avoid using title attribute alone; it is not reliably exposed to screen readers.',
    ],
    wcagCriterion: '4.1.2',
    referenceUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/name-role-value',
  },
  'link-name': {
    summary: 'Links must have discernible, descriptive text.',
    steps: [
      'Add descriptive text content between <a> tags.',
      'Use aria-label when link text alone is ambiguous (e.g. "Read more").',
      'Avoid empty or whitespace-only link text.',
    ],
    wcagCriterion: '2.4.4',
    referenceUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context',
  },
  'landmark-one-main': {
    summary: 'Pages must contain exactly one <main> landmark region.',
    steps: [
      'Wrap the primary page content in a <main> element.',
      'Ensure there is exactly one <main> per page.',
      'Use other landmark elements (<header>, <nav>, <aside>, <footer>) appropriately.',
    ],
    wcagCriterion: '1.3.6',
    referenceUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/identify-purpose',
  },
  'page-has-heading-one': {
    summary: 'Each page should have exactly one <h1> as the primary heading.',
    steps: [
      'Add an <h1> element that describes the main purpose of the page.',
      'Ensure heading levels are used hierarchically (h1 → h2 → h3…).',
    ],
    wcagCriterion: '2.4.6',
    referenceUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/headings-and-labels',
  },
  'html-has-lang': {
    summary: 'The <html> element must have a "lang" attribute.',
    steps: [
      'Add lang="en" (or the appropriate BCP-47 language tag) to the <html> element.',
      'For multilingual pages, set lang on each language section element too.',
    ],
    wcagCriterion: '3.1.1',
    referenceUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/language-of-page',
  },
  'keyboard': {
    summary: 'All interactive elements must be keyboard-operable.',
    steps: [
      'Ensure every interactive element can receive focus via the Tab key.',
      'Verify custom widgets respond to keyboard events (Enter, Space, Arrow keys).',
      'Do not use tabindex values greater than 0 as they disrupt natural tab order.',
    ],
    wcagCriterion: '2.1.1',
    referenceUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/keyboard',
  },
  'focus-order-semantics': {
    summary: 'Focus order must follow a meaningful sequence.',
    steps: [
      'Ensure DOM order matches the visual reading order.',
      'Avoid CSS techniques (e.g. position: absolute) that create a mismatch.',
      'Test tab order manually and with screen readers.',
    ],
    wcagCriterion: '2.4.3',
    referenceUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/focus-order',
  },
  'aria-required-attr': {
    summary: 'ARIA roles must include all required attributes.',
    steps: [
      'Consult the WAI-ARIA spec for required attributes for each role.',
      'Add any missing required attributes (e.g. aria-expanded for role="button").',
      'Validate with a browser extension such as axe DevTools.',
    ],
    wcagCriterion: '4.1.2',
    referenceUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/name-role-value',
  },
  'aria-valid-attr-value': {
    summary: 'ARIA attribute values must conform to the specification.',
    steps: [
      'Check that ARIA attribute values use allowed token sets (e.g. "true"/"false").',
      'Ensure ARIA ID references point to existing elements.',
      'Use an automated linter to catch typos in ARIA values.',
    ],
    wcagCriterion: '4.1.2',
    referenceUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/name-role-value',
  },
};

const GENERIC_REMEDIATION: RemediationGuidance = {
  summary: 'Review the axe-core help documentation and apply the suggested fix.',
  steps: [
    'Follow the help link provided in the violation details.',
    'Inspect the affected elements using browser developer tools.',
    'Apply the recommended fix described in the Deque University article.',
    'Re-run axe-core to confirm the violation is resolved.',
  ],
};

// ─── Scoring helpers ──────────────────────────────────────────────────────────

/** Weight penalties deducted per violation node, by severity. */
const PENALTY_WEIGHTS: Record<ImpactLevel, number> = {
  critical: 10,
  serious: 5,
  moderate: 2,
  minor: 1,
};

/**
 * Compute an accessibility score (0–100) for a page.
 *
 * Score starts at 100 and is reduced by the sum of weighted violation penalties,
 * clamped to a minimum of 0.
 */
function computeScore(violations: AxeViolation[]): number {
  const totalPenalty = violations.reduce((acc, v) => {
    const weight = PENALTY_WEIGHTS[normaliseImpact(v.impact)];
    return acc + weight * v.nodes.length;
  }, 0);
  return Math.max(0, 100 - totalPenalty);
}

function normaliseImpact(level: string | null | undefined): ImpactLevel {
  const allowed: ImpactLevel[] = ['critical', 'serious', 'moderate', 'minor'];
  return allowed.includes(level as ImpactLevel) ? (level as ImpactLevel) : 'minor';
}

function deriveComplianceStatus(breakdown: SeverityBreakdown): ComplianceStatus {
  if (breakdown.critical > 0) return 'non-compliant';
  if (breakdown.serious > 0 || breakdown.moderate > 0) return 'needs-improvement';
  if (breakdown.minor > 0) return 'minor-issues';
  return 'compliant';
}

function extractWcagTags(tags: string[]): string[] {
  return tags.filter((t) =>
    /^wcag\d|^best-practice|^ACT/.test(t),
  );
}

function buildSeverityBreakdown(violations: AxeViolation[]): SeverityBreakdown {
  const breakdown: SeverityBreakdown = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };
  for (const v of violations) {
    breakdown[normaliseImpact(v.impact)] += 1;
  }
  return breakdown;
}

// ─── ViolationCategorizer ─────────────────────────────────────────────────────

/**
 * Enriches raw {@link PageScanResult} objects from {@link AxeRunner} with
 * severity categorisation, WCAG tagging, remediation guidance, and scoring.
 */
export class ViolationCategorizer {
  /**
   * Categorise a single page's scan results.
   *
   * @param scanResult - Raw result from {@link AxeRunner.scanPage}.
   * @returns {@link CategorizedPageResult} with full enrichment.
   */
  categorizePage(scanResult: PageScanResult): CategorizedPageResult {
    if (!scanResult.scanSucceeded) {
      return {
        url: scanResult.url,
        scannedAt: scanResult.scannedAt,
        scanSucceeded: false,
        complianceStatus: 'non-compliant',
        accessibilityScore: 0,
        categorizedViolations: [],
        severityBreakdown: { critical: 0, serious: 0, moderate: 0, minor: 0 },
        passCount: 0,
        incompleteCount: 0,
        errorMessage: scanResult.errorMessage,
      };
    }

    const categorizedViolations = scanResult.violations.map(
      (v): CategorizedViolation => ({
        violation: v,
        severity: normaliseImpact(v.impact),
        wcagTags: extractWcagTags(v.tags),
        remediation: REMEDIATION_LIBRARY[v.id] ?? {
          ...GENERIC_REMEDIATION,
          referenceUrl: v.helpUrl,
        },
        affectedNodeCount: v.nodes.length,
      }),
    );

    const severityBreakdown = buildSeverityBreakdown(scanResult.violations);

    return {
      url: scanResult.url,
      scannedAt: scanResult.scannedAt,
      scanSucceeded: true,
      complianceStatus: deriveComplianceStatus(severityBreakdown),
      accessibilityScore: computeScore(scanResult.violations),
      categorizedViolations,
      severityBreakdown,
      passCount: scanResult.passCount,
      incompleteCount: scanResult.incompleteCount,
    };
  }

  /**
   * Categorise multiple page scan results and produce an aggregate report.
   *
   * @param scanResults - Array of raw scan results from {@link AxeRunner.scanPages}.
   * @returns {@link CategorizationReport} containing per-page and aggregate data.
   */
  categorizeAll(scanResults: PageScanResult[]): CategorizationReport {
    const pages = scanResults.map((r) => this.categorizePage(r));

    const compliantPages = pages.filter(
      (p) => p.complianceStatus === 'compliant',
    ).length;

    const overallScore =
      pages.length === 0
        ? 100
        : Math.round(
            pages.reduce((sum, p) => sum + p.accessibilityScore, 0) /
              pages.length,
          );

    const totalSeverityBreakdown: SeverityBreakdown = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    };
    for (const page of pages) {
      totalSeverityBreakdown.critical += page.severityBreakdown.critical;
      totalSeverityBreakdown.serious += page.severityBreakdown.serious;
      totalSeverityBreakdown.moderate += page.severityBreakdown.moderate;
      totalSeverityBreakdown.minor += page.severityBreakdown.minor;
    }

    return {
      categorizedAt: new Date().toISOString(),
      totalPages: pages.length,
      compliantPages,
      overallScore,
      pages,
      totalSeverityBreakdown,
    };
  }
}
