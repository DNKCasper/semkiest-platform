import type { Browser, BrowserContext, Page, Response } from 'playwright';
import { chromium } from 'playwright';
import type {
  UITestCase,
  UITestResult,
  StepResult,
  TestStep,
  NetworkLog,
  ViewportConfig,
} from './types';
import { applyWaitCondition } from './wait-strategies';
import { runAssertion } from './validators';

/** Options controlling a single test-case execution */
export interface ExecutorOptions {
  /** Browser viewport for this test run */
  viewport?: ViewportConfig;
  /** Per-test timeout in ms (default: 60 000) */
  timeout?: number;
  /** Whether to run headless (default: true) */
  headless?: boolean;
  /** Base URL prepended to relative navigation URLs */
  baseUrl?: string;
}

const DEFAULT_VIEWPORT: ViewportConfig = { width: 1280, height: 720 };
const DEFAULT_TEST_TIMEOUT = 60_000;

/**
 * Core test execution engine.
 *
 * Responsibilities:
 * - Manage Playwright browser lifecycle per test case
 * - Execute each step (click, navigate, form_submit, wait, assertion)
 * - Capture network logs and console errors
 * - Take failure screenshots for evidence collection
 * - Return a structured UITestResult
 */
export class TestExecutor {
  /**
   * Execute a single UITestCase in an isolated browser context.
   *
   * A new browser is launched and torn down for each test to guarantee
   * complete isolation between test cases.
   */
  async execute(testCase: UITestCase, options: ExecutorOptions = {}): Promise<UITestResult> {
    const startedAt = Date.now();
    const viewport = testCase.viewport ?? options.viewport ?? DEFAULT_VIEWPORT;
    const headless = options.headless ?? true;

    const browser = await this.launchBrowser(headless, viewport);

    const result: UITestResult = {
      testId: testCase.id,
      testName: testCase.name,
      status: 'pass',
      steps: [],
      duration: 0,
      consoleErrors: [],
      networkLogs: [],
    };

    try {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();

      // Attach network + console listeners
      this.attachNetworkListener(page, result.networkLogs);
      this.attachConsoleListener(page, result.consoleErrors);

      // Collect HTTP responses for HTTP-response assertions
      const capturedResponses = new Map<string, Response>();
      page.on('response', (res) => {
        capturedResponses.set(res.url(), res);
      });

      // Execute each step
      for (let i = 0; i < testCase.steps.length; i++) {
        const step = testCase.steps[i];
        const stepResult = await this.executeStep(page, step, i, capturedResponses, options);
        result.steps.push(stepResult);

        if (stepResult.status === 'fail') {
          result.status = 'fail';
          // Capture a screenshot on failure if not already present in the step
          if (!stepResult.screenshotBase64) {
            stepResult.screenshotBase64 = await this.captureScreenshot(page);
          }
          // Stop executing further steps after a failure
          break;
        }

        if (stepResult.status === 'warning' && result.status === 'pass') {
          result.status = 'warning';
        }
      }
    } finally {
      result.duration = Date.now() - startedAt;
      await browser.close();
    }

    return result;
  }

  // ─── Step dispatch ──────────────────────────────────────────────────────────

  private async executeStep(
    page: Page,
    step: TestStep,
    index: number,
    capturedResponses: Map<string, Response>,
    options: ExecutorOptions,
  ): Promise<StepResult> {
    const stepStart = Date.now();

    try {
      switch (step.type) {
        case 'navigate':
          await this.executeNavigate(page, step.url, step.waitUntil, options.baseUrl);
          break;

        case 'click':
          await this.executeClick(page, step.selector);
          if (step.waitAfter) await applyWaitCondition(page, step.waitAfter);
          break;

        case 'form_submit':
          await this.executeFormSubmit(page, step.fields, step.submitSelector);
          if (step.waitAfter) await applyWaitCondition(page, step.waitAfter);
          break;

        case 'wait':
          await applyWaitCondition(page, step.condition);
          break;

        case 'assertion': {
          const assertResult = await runAssertion(page, step.assertion, capturedResponses);
          if (!assertResult.passed) {
            const screenshot = await this.captureScreenshot(page);
            return {
              stepIndex: index,
              stepType: step.type,
              status: 'fail',
              message: assertResult.message,
              duration: Date.now() - stepStart,
              screenshotBase64: screenshot,
            };
          }
          return {
            stepIndex: index,
            stepType: step.type,
            status: 'pass',
            message: assertResult.message,
            duration: Date.now() - stepStart,
          };
        }

        default: {
          const _exhaustive: never = step;
          throw new Error(`Unknown step type: ${JSON.stringify(_exhaustive)}`);
        }
      }

      return {
        stepIndex: index,
        stepType: step.type,
        status: 'pass',
        duration: Date.now() - stepStart,
      };
    } catch (err) {
      const screenshot = await this.captureScreenshot(page).catch(() => undefined);
      return {
        stepIndex: index,
        stepType: step.type,
        status: 'fail',
        message: err instanceof Error ? err.message : String(err),
        duration: Date.now() - stepStart,
        screenshotBase64: screenshot,
      };
    }
  }

  // ─── Step implementations ───────────────────────────────────────────────────

  /**
   * Navigate to a URL.
   * Relative URLs are resolved against `baseUrl` when provided.
   */
  private async executeNavigate(
    page: Page,
    url: string,
    waitUntil: 'load' | 'domcontentloaded' | 'networkidle' | 'commit' = 'load',
    baseUrl?: string,
  ): Promise<void> {
    const resolved = this.resolveUrl(url, baseUrl);
    await page.goto(resolved, { waitUntil });
  }

  /** Click on a CSS selector after waiting for it to become visible */
  private async executeClick(page: Page, selector: string): Promise<void> {
    await page.waitForSelector(selector, { state: 'visible', timeout: 10_000 });
    await page.click(selector);
  }

  /**
   * Fill form fields and optionally submit.
   *
   * Filling is done sequentially to respect autofill / validation logic that
   * may show or hide other fields based on current values.
   */
  private async executeFormSubmit(
    page: Page,
    fields: Record<string, string>,
    submitSelector?: string,
  ): Promise<void> {
    for (const [selector, value] of Object.entries(fields)) {
      await page.waitForSelector(selector, { state: 'visible', timeout: 10_000 });
      await page.fill(selector, value);
    }

    if (submitSelector) {
      await page.waitForSelector(submitSelector, { state: 'visible', timeout: 10_000 });
      await page.click(submitSelector);
    }
  }

  // ─── Listeners ──────────────────────────────────────────────────────────────

  private attachNetworkListener(page: Page, logs: NetworkLog[]): void {
    page.on('response', (response) => {
      logs.push({
        url: response.url(),
        method: response.request().method(),
        status: response.status(),
        timestamp: new Date(),
      });
    });
  }

  private attachConsoleListener(page: Page, errors: string[]): void {
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  private async launchBrowser(headless: boolean, viewport: ViewportConfig): Promise<Browser> {
    return chromium.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        `--window-size=${viewport.width},${viewport.height}`,
      ],
    });
  }

  private async captureScreenshot(page: Page): Promise<string | undefined> {
    try {
      const buffer = await page.screenshot({ fullPage: true });
      return buffer.toString('base64');
    } catch {
      return undefined;
    }
  }

  private resolveUrl(url: string, baseUrl?: string): string {
    if (!baseUrl) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${baseUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
  }
}
