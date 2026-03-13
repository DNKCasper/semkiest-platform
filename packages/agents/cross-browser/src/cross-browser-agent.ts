/**
 * CrossBrowserAgent — replays functional tests across Chromium, Firefox, and
 * WebKit using Playwright, capturing per-browser pass/fail results and
 * screenshots for visual comparison.
 *
 * Story: SEM-76
 * Dependencies: SEM-50 (BaseAgent), SEM-53 (Playwright tools),
 *               SEM-67/SEM-68/SEM-69 (UI/Functional agents)
 */

import * as path from 'path';
import * as fs from 'fs';
import { chromium, firefox, webkit, Browser, BrowserContext, Page } from 'playwright';

import { BaseAgent, AgentConfig } from './base-agent';
import {
  BrowserMatrix,
  BrowserName,
  BrowserConfig,
  ViewportConfig,
  DEFAULT_BROWSER_MATRIX,
  getEnabledBrowsers,
} from './browser-matrix';
import { ParallelExecutor, ExecutionTask } from './parallel-executor';

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

/** A single step within a functional test case */
export interface TestStep {
  /** Step action type */
  action: 'navigate' | 'click' | 'fill' | 'assert' | 'screenshot' | 'wait';
  /** CSS selector target (where applicable) */
  selector?: string;
  /** Value used for 'fill' actions or URL for 'navigate' */
  value?: string;
  /** Expected text used by 'assert' actions */
  expected?: string;
  /** Timeout override in milliseconds */
  timeoutMs?: number;
}

/** A functional test case to replay across browsers */
export interface TestCase {
  /** Unique test identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Initial URL to load */
  url: string;
  /** Ordered steps to execute */
  steps: TestStep[];
}

/** Input payload for CrossBrowserAgent */
export interface CrossBrowserInput {
  /** Test cases to run across the browser matrix */
  testCases: TestCase[];
  /** Browser/viewport matrix override; defaults to {@link DEFAULT_BROWSER_MATRIX} */
  browserMatrix?: BrowserMatrix;
  /** Directory where screenshots will be saved */
  screenshotDir?: string;
  /** Maximum concurrent browser×viewport combinations */
  concurrency?: number;
}

/** Result for a single browser + viewport + test combination */
export interface BrowserTestResult {
  /** Browser engine that ran this test */
  browser: BrowserName;
  /** Viewport used during execution */
  viewport: ViewportConfig;
  /** ID of the test case */
  testId: string;
  /** Name of the test case */
  testName: string;
  /** Whether all steps completed without error */
  passed: boolean;
  /** Error message when `passed` is false */
  errorMessage?: string;
  /** Absolute path to the screenshot taken after test completion (if captured) */
  screenshotPath?: string;
  /** Wall-clock duration of this browser test run in milliseconds */
  durationMs: number;
}

/** Aggregated cross-browser run output */
export interface CrossBrowserOutput {
  /** Flat list of all browser×viewport×test results */
  results: BrowserTestResult[];
  /** High-level summary */
  summary: CrossBrowserSummary;
}

/** High-level statistics for the entire cross-browser run */
export interface CrossBrowserSummary {
  /** Total number of browser×viewport×test combinations executed */
  total: number;
  /** Combinations that passed */
  passed: number;
  /** Combinations that failed */
  failed: number;
  /** Unique browser engines with at least one result */
  browsersRun: BrowserName[];
  /** Matrix of per-browser pass counts */
  perBrowser: Record<BrowserName, { passed: number; failed: number }>;
}

// ---------------------------------------------------------------------------
// Agent configuration
// ---------------------------------------------------------------------------

/** CrossBrowserAgent constructor options */
export interface CrossBrowserAgentConfig extends AgentConfig {
  /** Default concurrency when not supplied in the input payload */
  defaultConcurrency?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Replays functional tests across all enabled browsers and viewports defined
 * in a {@link BrowserMatrix}, collecting pass/fail results and screenshots for
 * each combination.
 */
export class CrossBrowserAgent extends BaseAgent<CrossBrowserInput, CrossBrowserOutput> {
  private readonly defaultConcurrency: number;

  constructor(config: CrossBrowserAgentConfig) {
    super(config);
    this.defaultConcurrency = config.defaultConcurrency ?? 3;
  }

  // -------------------------------------------------------------------------
  // BaseAgent implementation
  // -------------------------------------------------------------------------

  protected async execute(input: CrossBrowserInput): Promise<CrossBrowserOutput> {
    const {
      testCases,
      browserMatrix = DEFAULT_BROWSER_MATRIX,
      screenshotDir,
      concurrency = this.defaultConcurrency,
    } = input;

    if (screenshotDir) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const enabledBrowsers = getEnabledBrowsers(browserMatrix);
    this.logger.info('Cross-browser run starting', {
      browsers: enabledBrowsers.map((b) => b.browser),
      testCount: testCases.length,
    });

    // Build the full Cartesian product: browser × viewport × testCase
    const tasks = this.buildExecutionTasks(enabledBrowsers, testCases, screenshotDir);

    const executor = new ParallelExecutor(concurrency);
    const executionResults = await executor.execute(tasks);

    const results: BrowserTestResult[] = executionResults.map((r) => {
      if (r.result) return r.result;
      // Task itself threw (should be rare; individual browser steps are
      // already caught inside runSingleTest)
      const [browserName, , testId] = r.id.split('::');
      return {
        browser: browserName as BrowserName,
        viewport: { name: 'unknown', width: 0, height: 0 },
        testId,
        testName: testId,
        passed: false,
        errorMessage: r.error?.message ?? 'Unknown execution error',
        durationMs: r.durationMs,
      };
    });

    const summary = this.buildSummary(results);
    this.logger.info('Cross-browser run complete', {
      total: summary.total,
      passed: summary.passed,
      failed: summary.failed,
    });

    return { results, summary };
  }

  // -------------------------------------------------------------------------
  // Task construction
  // -------------------------------------------------------------------------

  private buildExecutionTasks(
    browserConfigs: BrowserConfig[],
    testCases: TestCase[],
    screenshotDir?: string,
  ): ExecutionTask<BrowserTestResult>[] {
    const tasks: ExecutionTask<BrowserTestResult>[] = [];

    for (const browserConfig of browserConfigs) {
      for (const viewport of browserConfig.viewports) {
        for (const testCase of testCases) {
          const id = `${browserConfig.browser}::${viewport.name}::${testCase.id}`;
          tasks.push({
            id,
            execute: () =>
              this.runSingleTest(browserConfig.browser, viewport, testCase, screenshotDir),
          });
        }
      }
    }

    return tasks;
  }

  // -------------------------------------------------------------------------
  // Single browser × viewport × test runner
  // -------------------------------------------------------------------------

  private async runSingleTest(
    browserName: BrowserName,
    viewport: ViewportConfig,
    testCase: TestCase,
    screenshotDir?: string,
  ): Promise<BrowserTestResult> {
    const start = Date.now();
    const browser = await this.launchBrowser(browserName);
    const context = await this.createContext(browser, viewport);
    const page = await context.newPage();

    const result: BrowserTestResult = {
      browser: browserName,
      viewport,
      testId: testCase.id,
      testName: testCase.name,
      passed: false,
      durationMs: 0,
    };

    try {
      await this.executeTestSteps(page, testCase);
      result.passed = true;
    } catch (err) {
      result.errorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      if (screenshotDir) {
        result.screenshotPath = await this.captureScreenshot(
          page,
          screenshotDir,
          browserName,
          viewport,
          testCase.id,
        );
      }
      await context.close();
      await browser.close();
      result.durationMs = Date.now() - start;
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Test step execution
  // -------------------------------------------------------------------------

  private async executeTestSteps(page: Page, testCase: TestCase): Promise<void> {
    for (const step of testCase.steps) {
      await this.executeStep(page, step);
    }
  }

  private async executeStep(page: Page, step: TestStep): Promise<void> {
    const timeout = step.timeoutMs ?? 30_000;

    switch (step.action) {
      case 'navigate': {
        if (!step.value) throw new Error('navigate step requires a value (URL)');
        await page.goto(step.value, { timeout, waitUntil: 'networkidle' });
        break;
      }
      case 'click': {
        if (!step.selector) throw new Error('click step requires a selector');
        await page.click(step.selector, { timeout });
        break;
      }
      case 'fill': {
        if (!step.selector) throw new Error('fill step requires a selector');
        if (step.value === undefined) throw new Error('fill step requires a value');
        await page.fill(step.selector, step.value, { timeout });
        break;
      }
      case 'assert': {
        if (!step.selector) throw new Error('assert step requires a selector');
        const element = page.locator(step.selector);
        await element.waitFor({ timeout });
        if (step.expected !== undefined) {
          const text = await element.textContent();
          if (!text?.includes(step.expected)) {
            throw new Error(
              `Assertion failed: expected "${step.expected}" in "${text ?? ''}"`,
            );
          }
        }
        break;
      }
      case 'screenshot':
        // Named screenshot mid-test — no-op when screenshotDir not configured
        break;
      case 'wait': {
        const waitMs = step.timeoutMs ?? 1_000;
        await page.waitForTimeout(waitMs);
        break;
      }
      default: {
        const exhaustive: never = step.action;
        throw new Error(`Unknown step action: ${String(exhaustive)}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Screenshot capture
  // -------------------------------------------------------------------------

  private async captureScreenshot(
    page: Page,
    screenshotDir: string,
    browserName: BrowserName,
    viewport: ViewportConfig,
    testId: string,
  ): Promise<string | undefined> {
    try {
      const filename = `${testId}__${browserName}__${viewport.name}.png`;
      const screenshotPath = path.join(screenshotDir, filename);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      return screenshotPath;
    } catch (err) {
      this.logger.warn('Screenshot capture failed', {
        browser: browserName,
        viewport: viewport.name,
        testId,
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }

  // -------------------------------------------------------------------------
  // Browser / context factory helpers
  // -------------------------------------------------------------------------

  private async launchBrowser(browserName: BrowserName): Promise<Browser> {
    switch (browserName) {
      case 'chromium':
        return chromium.launch();
      case 'firefox':
        return firefox.launch();
      case 'webkit':
        return webkit.launch();
    }
  }

  private async createContext(
    browser: Browser,
    viewport: ViewportConfig,
  ): Promise<BrowserContext> {
    return browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
  }

  // -------------------------------------------------------------------------
  // Summary builder
  // -------------------------------------------------------------------------

  private buildSummary(results: BrowserTestResult[]): CrossBrowserSummary {
    const browserNames = [...new Set(results.map((r) => r.browser))];

    const perBrowser = {} as Record<BrowserName, { passed: number; failed: number }>;
    for (const b of browserNames) {
      perBrowser[b] = { passed: 0, failed: 0 };
    }

    let passed = 0;
    let failed = 0;

    for (const r of results) {
      if (r.passed) {
        passed += 1;
        perBrowser[r.browser].passed += 1;
      } else {
        failed += 1;
        perBrowser[r.browser].failed += 1;
      }
    }

    return {
      total: results.length,
      passed,
      failed,
      browsersRun: browserNames,
      perBrowser,
    };
  }
}
