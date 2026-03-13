/**
 * AxeRunner - Playwright + axe-core integration for WCAG 2.1 AA auditing.
 *
 * Launches a Chromium browser, navigates to each target URL, injects axe-core
 * via @axe-core/playwright, and returns the raw scan results per page.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

// ─── Public types ────────────────────────────────────────────────────────────

/** WCAG tag filters understood by axe-core. */
export type WcagTag =
  | 'wcag2a'
  | 'wcag2aa'
  | 'wcag21a'
  | 'wcag21aa'
  | 'wcag22aa'
  | 'best-practice'
  | 'ACT';

/** axe-core impact levels, ordered from most to least severe. */
export type ImpactLevel = 'critical' | 'serious' | 'moderate' | 'minor';

/** A single affected DOM node reported by axe-core. */
export interface AffectedNode {
  /** CSS selector path to the element. */
  target: string[];
  /** Relevant HTML snippet. */
  html: string;
  /** axe failure summary for this specific node. */
  failureSummary: string;
}

/** One accessibility rule violation on a given page. */
export interface AxeViolation {
  /** Unique rule identifier (e.g. "color-contrast"). */
  id: string;
  /** Human-readable rule description. */
  description: string;
  /** Link to the Deque University help article. */
  helpUrl: string;
  /** Severity of the violation. */
  impact: ImpactLevel;
  /** WCAG / best-practice tags associated with this rule. */
  tags: string[];
  /** Individual elements that triggered the violation. */
  nodes: AffectedNode[];
}

/** Scan results for a single page. */
export interface PageScanResult {
  /** The URL that was audited. */
  url: string;
  /** ISO-8601 timestamp when the scan started. */
  scannedAt: string;
  /** Whether the page could be loaded and scanned without error. */
  scanSucceeded: boolean;
  /** Violations found on this page. */
  violations: AxeViolation[];
  /** Rules that passed on this page (count only). */
  passCount: number;
  /** Rules that couldn't be fully tested (count only). */
  incompleteCount: number;
  /** Rules that don't apply to this page (count only). */
  inapplicableCount: number;
  /** Error message if scanSucceeded is false. */
  errorMessage?: string;
}

/** Configuration for {@link AxeRunner}. */
export interface AxeRunnerConfig {
  /**
   * WCAG tag filters passed to axe-core.
   * Default: ['wcag2a', 'wcag2aa', 'wcag21aa']
   */
  wcagTags?: WcagTag[];
  /**
   * Page load timeout in milliseconds (default: 30 000).
   */
  pageTimeoutMs?: number;
  /**
   * Whether to run the browser in headless mode (default: true).
   */
  headless?: boolean;
  /**
   * CSS selectors for elements to exclude from axe scanning.
   */
  excludeSelectors?: string[];
}

// ─── Internal helpers ────────────────────────────────────────────────────────

const DEFAULT_WCAG_TAGS: WcagTag[] = ['wcag2a', 'wcag2aa', 'wcag21aa'];
const DEFAULT_PAGE_TIMEOUT_MS = 30_000;

function normaliseImpact(raw: string | null | undefined): ImpactLevel {
  const allowed: ImpactLevel[] = ['critical', 'serious', 'moderate', 'minor'];
  return allowed.includes(raw as ImpactLevel)
    ? (raw as ImpactLevel)
    : 'minor';
}

// ─── AxeRunner ───────────────────────────────────────────────────────────────

/**
 * Manages a Playwright browser session and runs axe-core audits against
 * a list of URLs, returning structured {@link PageScanResult} objects.
 */
export class AxeRunner {
  private readonly wcagTags: WcagTag[];
  private readonly pageTimeoutMs: number;
  private readonly headless: boolean;
  private readonly excludeSelectors: string[];

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor(config: AxeRunnerConfig = {}) {
    this.wcagTags = config.wcagTags ?? DEFAULT_WCAG_TAGS;
    this.pageTimeoutMs = config.pageTimeoutMs ?? DEFAULT_PAGE_TIMEOUT_MS;
    this.headless = config.headless ?? true;
    this.excludeSelectors = config.excludeSelectors ?? [];
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Launch the browser and create a reusable browser context.
   * Must be called before {@link scanPage} or {@link scanPages}.
   */
  async launch(): Promise<void> {
    this.browser = await chromium.launch({ headless: this.headless });
    this.context = await this.browser.newContext();
  }

  /**
   * Close the browser context and browser.
   * Should be called in a finally block after scanning is complete.
   */
  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  // ── Scanning ───────────────────────────────────────────────────────────────

  /**
   * Run an axe-core audit on a single URL.
   *
   * @param url - Fully-qualified URL to audit.
   * @returns Structured {@link PageScanResult}.
   */
  async scanPage(url: string): Promise<PageScanResult> {
    if (!this.context) {
      throw new Error('AxeRunner has not been launched. Call launch() first.');
    }

    const scannedAt = new Date().toISOString();
    const page: Page = await this.context.newPage();

    try {
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: this.pageTimeoutMs,
      });

      let builder = new AxeBuilder({ page }).withTags(this.wcagTags);

      for (const selector of this.excludeSelectors) {
        builder = builder.exclude(selector);
      }

      const results = await builder.analyze();

      return {
        url,
        scannedAt,
        scanSucceeded: true,
        violations: results.violations.map((v) => ({
          id: v.id,
          description: v.description,
          helpUrl: v.helpUrl,
          impact: normaliseImpact(v.impact),
          tags: v.tags,
          nodes: v.nodes.map((n) => ({
            target: n.target.map(String),
            html: n.html,
            failureSummary: n.failureSummary ?? '',
          })),
        })),
        passCount: results.passes.length,
        incompleteCount: results.incomplete.length,
        inapplicableCount: results.inapplicable.length,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      return {
        url,
        scannedAt,
        scanSucceeded: false,
        violations: [],
        passCount: 0,
        incompleteCount: 0,
        inapplicableCount: 0,
        errorMessage,
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Run axe-core audits on multiple URLs sequentially.
   *
   * @param urls - Array of fully-qualified URLs to audit.
   * @returns One {@link PageScanResult} per URL, preserving order.
   */
  async scanPages(urls: string[]): Promise<PageScanResult[]> {
    const results: PageScanResult[] = [];
    for (const url of urls) {
      const result = await this.scanPage(url);
      results.push(result);
    }
    return results;
  }
}
