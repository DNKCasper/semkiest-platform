import { BaseAgent } from '@semkiest/agent-base';
import { TestExecutor } from './executor';
import type {
  UIAgentConfig,
  UIAgentInput,
  UIAgentOutput,
  UITestResult,
} from './types';

/**
 * UIFunctionalAgent
 *
 * Executes automated functional tests against web applications using Playwright.
 *
 * Capabilities:
 * - Click-through flows
 * - Form submissions
 * - Navigation path testing
 * - SPA / client-side routing support
 * - Element visibility, text content, URL and HTTP response validation
 * - Dynamic content handling (AJAX, infinite scroll)
 * - Configurable wait strategies (selector, navigation, network-idle, timeout)
 * - Configurable browser viewport per test case
 * - Screenshot capture on failure for evidence collection
 *
 * Extends {@link BaseAgent} which provides timeout enforcement, structured
 * logging, lifecycle events, and consistent result shapes.
 */
export class UIFunctionalAgent extends BaseAgent<UIAgentConfig, UIAgentInput, UIAgentOutput> {
  private readonly executor: TestExecutor;

  constructor(config: UIAgentConfig) {
    super(config);
    this.executor = new TestExecutor();
  }

  /**
   * Core execution logic called by BaseAgent.run().
   *
   * Runs all test cases sequentially within the agent's configured timeout.
   * Each test case gets an isolated Playwright browser context so failures
   * in one test do not affect others.
   */
  protected async executeImpl(input: UIAgentInput): Promise<UIAgentOutput> {
    const { tests, defaultViewport, baseUrl } = input;

    this.info('Starting UI functional test run', { totalTests: tests.length });

    const results: UITestResult[] = [];

    for (const testCase of tests) {
      this.debug('Executing test case', { testId: testCase.id, testName: testCase.name });

      const result = await this.executor.execute(testCase, {
        viewport: testCase.viewport ?? defaultViewport ?? this.config.defaultViewport,
        headless: this.config.headless ?? true,
        baseUrl: baseUrl ?? this.config.baseUrl,
        timeout: this.config.testTimeout,
      });

      results.push(result);

      this.info('Test case complete', {
        testId: result.testId,
        status: result.status,
        duration: result.duration,
        stepCount: result.steps.length,
        consoleErrors: result.consoleErrors.length,
      });
    }

    const summary = this.buildSummary(results);

    this.info('UI functional test run complete', summary);

    return { results, summary };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private buildSummary(results: UITestResult[]): UIAgentOutput['summary'] {
    return {
      total: results.length,
      passed: results.filter((r) => r.status === 'pass').length,
      failed: results.filter((r) => r.status === 'fail').length,
      warned: results.filter((r) => r.status === 'warning').length,
      skipped: results.filter((r) => r.status === 'skip').length,
    };
  }
}
