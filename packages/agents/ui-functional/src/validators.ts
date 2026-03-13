import type { Page, Response } from 'playwright';
import type {
  Assertion,
  ElementVisibleAssertion,
  TextContentAssertion,
  UrlAssertion,
  HttpResponseAssertion,
} from './types';

/** Result of running a single assertion */
export interface AssertionResult {
  passed: boolean;
  message: string;
  actual?: string;
  expected?: string;
}

/**
 * Dispatch an Assertion to the appropriate typed validator.
 */
export async function runAssertion(
  page: Page,
  assertion: Assertion,
  capturedResponses: Map<string, Response>,
): Promise<AssertionResult> {
  switch (assertion.kind) {
    case 'element_visible':
      return validateElementVisible(page, assertion);

    case 'text_content':
      return validateTextContent(page, assertion);

    case 'url':
      return validateUrl(page, assertion);

    case 'http_response':
      return validateHttpResponse(assertion, capturedResponses);

    default: {
      const _exhaustive: never = assertion;
      throw new Error(`Unknown assertion kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Assert that an element matching `selector` is (or is not) visible.
 */
export async function validateElementVisible(
  page: Page,
  assertion: ElementVisibleAssertion,
): Promise<AssertionResult> {
  const { selector, negate = false } = assertion;

  try {
    const locator = page.locator(selector);
    const isVisible = await locator.isVisible();
    const shouldBeVisible = !negate;

    if (isVisible === shouldBeVisible) {
      return {
        passed: true,
        message: `Element "${selector}" is ${negate ? 'not ' : ''}visible as expected`,
      };
    }

    return {
      passed: false,
      message: `Expected element "${selector}" to be ${shouldBeVisible ? 'visible' : 'hidden'}, but it was ${isVisible ? 'visible' : 'hidden'}`,
      actual: String(isVisible),
      expected: String(shouldBeVisible),
    };
  } catch (err) {
    return {
      passed: false,
      message: `Error checking element visibility for "${selector}": ${String(err)}`,
    };
  }
}

/**
 * Assert that an element's text content matches the expected value.
 * Supports exact match, substring containment, and RegExp.
 */
export async function validateTextContent(
  page: Page,
  assertion: TextContentAssertion,
): Promise<AssertionResult> {
  const { selector, expected, contains = false } = assertion;

  try {
    const locator = page.locator(selector);
    const actual = (await locator.textContent()) ?? '';

    const matched =
      expected instanceof RegExp
        ? expected.test(actual)
        : contains
          ? actual.includes(expected)
          : actual === expected;

    if (matched) {
      return {
        passed: true,
        message: `Text content of "${selector}" matches expected value`,
        actual,
        expected: expected instanceof RegExp ? expected.toString() : expected,
      };
    }

    return {
      passed: false,
      message: `Text content mismatch for "${selector}"`,
      actual,
      expected: expected instanceof RegExp ? expected.toString() : expected,
    };
  } catch (err) {
    return {
      passed: false,
      message: `Error reading text content of "${selector}": ${String(err)}`,
    };
  }
}

/**
 * Assert the current page URL matches the expected value.
 * Supports exact match, substring containment, and RegExp.
 */
export async function validateUrl(
  page: Page,
  assertion: UrlAssertion,
): Promise<AssertionResult> {
  const { expected, contains = false } = assertion;
  const actual = page.url();

  const matched =
    expected instanceof RegExp
      ? expected.test(actual)
      : contains
        ? actual.includes(expected)
        : actual === expected;

  if (matched) {
    return {
      passed: true,
      message: 'URL matches expected value',
      actual,
      expected: expected instanceof RegExp ? expected.toString() : expected,
    };
  }

  return {
    passed: false,
    message: 'URL does not match expected value',
    actual,
    expected: expected instanceof RegExp ? expected.toString() : expected,
  };
}

/**
 * Assert that a captured HTTP response matches expectations.
 *
 * Responses are collected by the executor while the test runs; this validator
 * searches the captured set for a URL matching `urlPattern`.
 */
export async function validateHttpResponse(
  assertion: HttpResponseAssertion,
  capturedResponses: Map<string, Response>,
): Promise<AssertionResult> {
  const { urlPattern, expectedStatus, expectedBodyContains } = assertion;

  // Find the most recent response whose URL matches the pattern
  let matchedUrl: string | undefined;
  let matchedResponse: Response | undefined;

  for (const [url, response] of capturedResponses) {
    const matched =
      urlPattern instanceof RegExp ? urlPattern.test(url) : url.includes(urlPattern);

    if (matched) {
      matchedUrl = url;
      matchedResponse = response;
    }
  }

  if (!matchedResponse || !matchedUrl) {
    return {
      passed: false,
      message: `No captured HTTP response matching URL pattern "${urlPattern}"`,
    };
  }

  if (expectedStatus !== undefined && matchedResponse.status() !== expectedStatus) {
    return {
      passed: false,
      message: `HTTP response status mismatch for "${matchedUrl}"`,
      actual: String(matchedResponse.status()),
      expected: String(expectedStatus),
    };
  }

  if (expectedBodyContains !== undefined) {
    let body: string;
    try {
      body = await matchedResponse.text();
    } catch {
      return {
        passed: false,
        message: `Could not read HTTP response body for "${matchedUrl}"`,
      };
    }

    if (!body.includes(expectedBodyContains)) {
      return {
        passed: false,
        message: `HTTP response body for "${matchedUrl}" does not contain expected string`,
        actual: body.slice(0, 200),
        expected: expectedBodyContains,
      };
    }
  }

  return {
    passed: true,
    message: `HTTP response for "${matchedUrl}" matches all expectations`,
    actual: String(matchedResponse.status()),
    expected: expectedStatus !== undefined ? String(expectedStatus) : 'any',
  };
}
