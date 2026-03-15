/**
 * AssertionEngine — evaluates assertions against API responses.
 *
 * Validates response status codes, headers, body content, schemas,
 * response times, and custom JSON path expressions.
 */

import { Assertion, AssertionResult, AssertionType } from './types';

/**
 * AssertionEngine evaluates assertions against actual API responses.
 */
export class AssertionEngine {
  /**
   * Create a new AssertionEngine instance.
   */
  constructor() {}

  /**
   * Evaluate an array of assertions against a response.
   *
   * @param assertions The assertions to evaluate.
   * @param actualStatus The actual HTTP status code.
   * @param actualBody The actual response body.
   * @param responseHeaders The response headers.
   * @param responseTimeMs The response time in milliseconds.
   * @returns Array of assertion results.
   */
  evaluateAssertions(
    assertions: Assertion[],
    actualStatus: number,
    actualBody: unknown,
    responseHeaders: Record<string, string>,
    responseTimeMs: number
  ): AssertionResult[] {
    return assertions.map((assertion) =>
      this.evaluateAssertion(assertion, actualStatus, actualBody, responseHeaders, responseTimeMs)
    );
  }

  /**
   * Evaluate a single assertion against a response.
   *
   * @param assertion The assertion to evaluate.
   * @param actualStatus The actual HTTP status code.
   * @param actualBody The actual response body.
   * @param responseHeaders The response headers.
   * @param responseTimeMs The response time in milliseconds.
   * @returns The assertion result.
   */
  private evaluateAssertion(
    assertion: Assertion,
    actualStatus: number,
    actualBody: unknown,
    responseHeaders: Record<string, string>,
    responseTimeMs: number
  ): AssertionResult {
    try {
      const result = this.evaluateByType(
        assertion.type,
        assertion.expected,
        assertion.path,
        actualStatus,
        actualBody,
        responseHeaders,
        responseTimeMs
      );

      return {
        assertion,
        passed: result.passed,
        actual: result.actual,
        message: result.message,
      };
    } catch (error) {
      return {
        assertion,
        passed: false,
        message: `Assertion evaluation error: ${error}`,
      };
    }
  }

  /**
   * Evaluate an assertion by type.
   *
   * @param type The assertion type.
   * @param expected The expected value.
   * @param path Optional JSON path for extraction.
   * @param actualStatus The actual HTTP status.
   * @param actualBody The actual response body.
   * @param responseHeaders The response headers.
   * @param responseTimeMs The response time in milliseconds.
   * @returns The evaluation result.
   */
  private evaluateByType(
    type: AssertionType,
    expected: unknown,
    path: string | undefined,
    actualStatus: number,
    actualBody: unknown,
    responseHeaders: Record<string, string>,
    responseTimeMs: number
  ): { passed: boolean; actual?: unknown; message: string } {
    switch (type) {
      case 'status':
        return this.evaluateStatus(expected, actualStatus);
      case 'header':
        return this.evaluateHeader(expected as Record<string, unknown>, responseHeaders, path);
      case 'body-contains':
        return this.evaluateBodyContains(expected, actualBody, path);
      case 'body-schema':
        return this.evaluateBodySchema(expected as Record<string, unknown>, actualBody);
      case 'response-time':
        return this.evaluateResponseTime(expected as number, responseTimeMs);
      case 'content-type':
        return this.evaluateContentType(expected as string, responseHeaders);
      case 'not-empty':
        return this.evaluateNotEmpty(actualBody, path);
      case 'array-length':
        return this.evaluateArrayLength(expected as number, actualBody, path);
      case 'json-path':
        return this.evaluateJsonPath(expected, actualBody, path);
      default:
        return { passed: false, message: `Unknown assertion type: ${type}` };
    }
  }

  /**
   * Evaluate status code assertion.
   */
  private evaluateStatus(
    expected: unknown,
    actual: number
  ): { passed: boolean; actual: number; message: string } {
    if (Array.isArray(expected)) {
      const passed = expected.includes(actual);
      return {
        passed,
        actual,
        message: passed ? `Status ${actual} is in expected list` : `Status ${actual} not in expected: ${expected.join(', ')}`,
      };
    } else if (typeof expected === 'number') {
      const passed = expected === actual;
      return {
        passed,
        actual,
        message: passed ? `Status code matches ${expected}` : `Status ${actual} does not match expected ${expected}`,
      };
    }
    return { passed: false, actual: 0, message: 'Invalid expected status value' };
  }

  /**
   * Evaluate header assertion.
   */
  private evaluateHeader(
    expected: Record<string, unknown>,
    actual: Record<string, string>,
    path?: string
  ): { passed: boolean; actual?: string; message: string } {
    const headerName = path || Object.keys(expected)[0];
    if (!headerName) {
      return { passed: false, message: 'No header name specified' };
    }

    const headerValue = actual[headerName.toLowerCase()] || actual[headerName];
    const expectedValue = expected[headerName];
    const passed = headerValue === expectedValue;

    return {
      passed,
      actual: headerValue,
      message: passed ? `Header ${headerName} matches expected value` : `Header ${headerName}: expected "${expectedValue}", got "${headerValue}"`,
    };
  }

  /**
   * Evaluate body contains assertion.
   */
  private evaluateBodyContains(
    expected: unknown,
    actual: unknown,
    path?: string
  ): { passed: boolean; actual?: unknown; message: string } {
    const value = path ? this.extractJsonPath(actual, path) : actual;
    const stringified = typeof value === 'string' ? value : JSON.stringify(value);

    if (typeof expected !== 'string') {
      return { passed: false, message: 'Expected value must be a string for body-contains' };
    }

    const passed = stringified.includes(expected);
    return {
      passed,
      actual: stringified,
      message: passed ? `Body contains "${expected}"` : `Body does not contain "${expected}"`,
    };
  }

  /**
   * Evaluate body schema assertion (basic schema validation).
   */
  private evaluateBodySchema(
    expected: Record<string, unknown>,
    actual: unknown
  ): { passed: boolean; message: string } {
    if (typeof actual !== 'object' || actual === null) {
      return { passed: false, message: 'Response body is not an object' };
    }

    const actualObj = actual as Record<string, unknown>;

    for (const key of Object.keys(expected)) {
      if (!(key in actualObj)) {
        return { passed: false, message: `Response missing required property: ${key}` };
      }
    }

    return { passed: true, message: 'Response body matches schema' };
  }

  /**
   * Evaluate response time assertion.
   */
  private evaluateResponseTime(
    expectedMs: number,
    actualMs: number
  ): { passed: boolean; actual: number; message: string } {
    const passed = actualMs <= expectedMs;
    return {
      passed,
      actual: actualMs,
      message: passed
        ? `Response time ${actualMs}ms is within limit ${expectedMs}ms`
        : `Response time ${actualMs}ms exceeds limit ${expectedMs}ms`,
    };
  }

  /**
   * Evaluate content-type assertion.
   */
  private evaluateContentType(
    expected: string,
    headers: Record<string, string>
  ): { passed: boolean; actual?: string; message: string } {
    const contentType = headers['content-type'] || headers['Content-Type'] || '';
    const passed = contentType.includes(expected);

    return {
      passed,
      actual: contentType,
      message: passed ? `Content-Type includes "${expected}"` : `Content-Type "${contentType}" does not include "${expected}"`,
    };
  }

  /**
   * Evaluate not-empty assertion.
   */
  private evaluateNotEmpty(actual: unknown, path?: string): { passed: boolean; message: string } {
    const value = path ? this.extractJsonPath(actual, path) : actual;
    const isEmpty =
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === 'object' && Object.keys(value as Record<string, unknown>).length === 0);

    return {
      passed: !isEmpty,
      message: isEmpty ? `Value at ${path || 'root'} is empty` : `Value at ${path || 'root'} is not empty`,
    };
  }

  /**
   * Evaluate array length assertion.
   */
  private evaluateArrayLength(
    expected: number,
    actual: unknown,
    path?: string
  ): { passed: boolean; actual?: number; message: string } {
    const value = path ? this.extractJsonPath(actual, path) : actual;

    if (!Array.isArray(value)) {
      return { passed: false, message: `Value at ${path || 'root'} is not an array` };
    }

    const passed = value.length === expected;
    return {
      passed,
      actual: value.length,
      message: passed
        ? `Array length is ${expected}`
        : `Array length is ${value.length}, expected ${expected}`,
    };
  }

  /**
   * Evaluate JSON path assertion.
   */
  private evaluateJsonPath(
    expected: unknown,
    actual: unknown,
    path?: string
  ): { passed: boolean; actual?: unknown; message: string } {
    if (!path) {
      return { passed: false, message: 'JSON path must be specified' };
    }

    const value = this.extractJsonPath(actual, path);
    const passed = value === expected;

    return {
      passed,
      actual: value,
      message: passed ? `JSON path "${path}" matches expected value` : `JSON path "${path}": expected "${expected}", got "${value}"`,
    };
  }

  /**
   * Extract a value from a JSON object using dot notation path.
   *
   * @param obj The object to extract from.
   * @param path The path in dot notation (e.g., "data.user.id").
   * @returns The extracted value or undefined.
   */
  private extractJsonPath(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current && typeof current === 'object') {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }
}
