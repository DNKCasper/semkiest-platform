/**
 * TestExecutor — executes API test cases and measures response metrics.
 *
 * Handles concurrent request execution with timeouts, response capture,
 * and assertion evaluation.
 */

import { ApiTestCase, ApiTestResult, Logger } from './types';
import { RequestBuilder } from './request-builder';
import { AssertionEngine } from './assertion-engine';

/**
 * TestExecutor executes API test cases and gathers results.
 */
export class TestExecutor {
  private logger: Logger;
  private requestBuilder: RequestBuilder;
  private assertionEngine: AssertionEngine;
  private maxConcurrency: number;
  private timeout: number;

  /**
   * Create a new TestExecutor instance.
   *
   * @param maxConcurrency Maximum number of concurrent requests. Defaults to 5.
   * @param timeout Request timeout in milliseconds. Defaults to 30000.
   * @param logger Optional logger instance.
   */
  constructor(maxConcurrency: number = 5, timeout: number = 30000, logger?: Logger) {
    this.maxConcurrency = maxConcurrency;
    this.timeout = timeout;
    this.logger = logger || {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    };
    this.requestBuilder = new RequestBuilder();
    this.assertionEngine = new AssertionEngine();
  }

  /**
   * Execute an array of test cases with concurrent request handling.
   *
   * @param testCases The test cases to execute.
   * @returns Array of test execution results.
   */
  async executeTests(testCases: ApiTestCase[]): Promise<ApiTestResult[]> {
    this.logger.info(`Executing ${testCases.length} test cases with concurrency ${this.maxConcurrency}`);

    const results: ApiTestResult[] = [];
    const queue = [...testCases];
    const inProgress = new Set<Promise<ApiTestResult>>();

    while (queue.length > 0 || inProgress.size > 0) {
      // Add new requests up to concurrency limit
      while (queue.length > 0 && inProgress.size < this.maxConcurrency) {
        const testCase = queue.shift()!;
        const promise = this.executeTest(testCase).then((result) => {
          inProgress.delete(promise);
          return result;
        });
        inProgress.add(promise);
      }

      // Wait for at least one request to complete
      if (inProgress.size > 0) {
        const result = await Promise.race(inProgress);
        results.push(result);
      }
    }

    this.logger.info(`Completed ${results.length} test executions`);
    return results;
  }

  /**
   * Execute a single test case.
   *
   * @param testCase The test case to execute.
   * @returns The test execution result.
   */
  async executeTest(testCase: ApiTestCase): Promise<ApiTestResult> {
    const startTime = Date.now();
    let actualStatus = 0;
    let actualBody: unknown = undefined;
    let responseHeaders: Record<string, string> = {};
    let error: string | undefined;

    try {
      const request = this.requestBuilder.buildRequest(testCase.endpoint);

      this.logger.debug(`Executing ${testCase.name}: ${request.method} ${request.url}`);

      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          signal: controller.signal,
        });

        clearTimeout(timeoutHandle);

        actualStatus = response.status;

        // Capture response headers
        response.headers.forEach((value, name) => {
          responseHeaders[name.toLowerCase()] = value;
        });

        // Parse response body
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          try {
            actualBody = await response.json();
          } catch {
            actualBody = await response.text();
          }
        } else {
          actualBody = await response.text();
        }
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          error = `Request timeout after ${this.timeout}ms`;
          actualStatus = 0;
        } else {
          error = `Request failed: ${fetchError}`;
          actualStatus = 0;
        }
      }
    } catch (err) {
      error = `Test execution error: ${err}`;
    }

    const responseTimeMs = Date.now() - startTime;

    // Evaluate assertions
    const assertionResults = this.assertionEngine.evaluateAssertions(
      testCase.assertions,
      actualStatus,
      actualBody,
      responseHeaders,
      responseTimeMs
    );

    // Check expected status
    const expectedStatusArray = Array.isArray(testCase.expectedStatus)
      ? testCase.expectedStatus
      : [testCase.expectedStatus];
    const statusPassed = expectedStatusArray.includes(actualStatus);

    // Overall pass: status check passes AND all assertions pass (if any)
    const passed =
      statusPassed &&
      (testCase.assertions.length === 0 || assertionResults.every((result) => result.passed)) &&
      !error;

    return {
      testCase,
      passed,
      actualStatus,
      actualBody,
      responseTimeMs,
      responseHeaders,
      assertions: assertionResults,
      error,
    };
  }
}
