import {
  testFormValidation,
  testHappyPath,
  testEdgeCases,
  runFormTests,
} from './form-tester';
import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Playwright page mock factory
// ---------------------------------------------------------------------------

interface LocatorMock {
  fill: jest.Mock;
  click: jest.Mock;
  selectOption: jest.Mock;
  isChecked: jest.Mock;
  isVisible: jest.Mock;
  count: jest.Mock;
  nth: jest.Mock;
  first: jest.Mock;
  last: jest.Mock;
  press: jest.Mock;
  inputValue: jest.Mock;
  textContent: jest.Mock;
}

function makeLocator(overrides: Partial<LocatorMock> = {}): LocatorMock {
  const loc: LocatorMock = {
    fill: jest.fn().mockResolvedValue(undefined),
    click: jest.fn().mockResolvedValue(undefined),
    selectOption: jest.fn().mockResolvedValue(undefined),
    isChecked: jest.fn().mockResolvedValue(false),
    isVisible: jest.fn().mockResolvedValue(false),
    count: jest.fn().mockResolvedValue(0),
    nth: jest.fn(),
    first: jest.fn(),
    last: jest.fn(),
    press: jest.fn().mockResolvedValue(undefined),
    inputValue: jest.fn().mockResolvedValue('test value'),
    textContent: jest.fn().mockResolvedValue(''),
    ...overrides,
  };
  // Make chainable methods return self by default.
  loc.nth.mockReturnValue(loc);
  loc.first.mockReturnValue(loc);
  loc.last.mockReturnValue(loc);
  return loc;
}

interface MockPageOptions {
  /** Return value for page.evaluate (the raw field list). */
  evaluateResult?: unknown[];
  /** Text content returned by page body locator. */
  bodyText?: string;
  /** Whether the submit button locator returns count > 0. */
  hasSubmitButton?: boolean;
  /** Whether any error locator returns visible elements. */
  hasErrors?: boolean;
  errorText?: string;
  /** Whether success locator is visible. */
  successVisible?: boolean;
  /** inputValue returned from fields. */
  inputValue?: string;
  /** page.waitForTimeout – jest mock */
  waitForTimeout?: jest.Mock;
  /** page.reload – jest mock */
  reload?: jest.Mock;
  /** page.screenshot */
  screenshot?: jest.Mock;
}

function buildPage(opts: MockPageOptions = {}): Page {
  const {
    evaluateResult = [],
    bodyText = '',
    hasSubmitButton = true,
    hasErrors = false,
    errorText = 'This field is required',
    successVisible = false,
    inputValue = 'test value',
    waitForTimeout = jest.fn().mockResolvedValue(undefined),
    reload = jest.fn().mockResolvedValue(undefined),
    screenshot = jest.fn().mockResolvedValue(undefined),
  } = opts;

  const submitLocator = makeLocator({
    count: jest.fn().mockResolvedValue(hasSubmitButton ? 1 : 0),
    click: jest.fn().mockResolvedValue(undefined),
  });

  const errorLocator = makeLocator({
    count: jest.fn().mockResolvedValue(hasErrors ? 1 : 0),
    textContent: jest.fn().mockResolvedValue(hasErrors ? errorText : ''),
  });

  const bodyLocator = makeLocator({
    textContent: jest.fn().mockResolvedValue(bodyText),
  });

  const successLocator = makeLocator({
    isVisible: jest.fn().mockResolvedValue(successVisible),
  });

  const inputLocator = makeLocator({
    inputValue: jest.fn().mockResolvedValue(inputValue),
    fill: jest.fn().mockResolvedValue(undefined),
  });

  const page = {
    evaluate: jest.fn().mockResolvedValue(evaluateResult),
    waitForTimeout,
    reload,
    screenshot,
    locator: jest.fn().mockImplementation((selector: string) => {
      if (
        selector === 'button[type="submit"], input[type="submit"], button:not([type])' ||
        selector.includes('submit')
      ) {
        return submitLocator;
      }
      if (selector === 'body') return bodyLocator;
      if (
        selector === '[role="alert"]' ||
        selector === '.error' ||
        selector === '.error-message' ||
        selector === '.field-error' ||
        selector === '.invalid-feedback' ||
        selector === '[aria-invalid="true"]' ||
        selector === '.form-error'
      ) {
        return errorLocator;
      }
      if (selector.startsWith('#success') || selector.startsWith('.success')) {
        return successLocator;
      }
      return inputLocator;
    }),
  } as unknown as Page;

  return page;
}

// ---------------------------------------------------------------------------
// testFormValidation
// ---------------------------------------------------------------------------

describe('testFormValidation', () => {
  it('returns passed:true when no fields detected (empty form)', async () => {
    const page = buildPage({ evaluateResult: [] });
    const result = await testFormValidation(page);
    expect(result.passed).toBe(true);
    expect(result.requiredFieldResults).toHaveLength(0);
  });

  it('marks failed step when required field error is not shown', async () => {
    const rawField = {
      tagName: 'INPUT',
      type: 'text',
      name: 'username',
      id: 'username',
      placeholder: null,
      required: true,
      disabled: false,
      readOnly: false,
      options: [],
      maxLength: -1,
      minLength: -1,
      pattern: null,
      min: null,
      max: null,
      labelText: 'Username',
      xpath: '//input[1]',
    };
    const page = buildPage({
      evaluateResult: [rawField],
      hasErrors: false, // no errors shown → required not enforced
    });
    const result = await testFormValidation(page);
    // Required not enforced → requiredFieldResults show enforcesRequired: false
    expect(result.requiredFieldResults[0].enforcesRequired).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('marks required enforced when error messages appear', async () => {
    const rawField = {
      tagName: 'INPUT',
      type: 'email',
      name: 'email',
      id: 'email',
      placeholder: 'email@example.com',
      required: true,
      disabled: false,
      readOnly: false,
      options: [],
      maxLength: -1,
      minLength: -1,
      pattern: null,
      min: null,
      max: null,
      labelText: 'Email',
      xpath: '//input[1]',
    };
    const page = buildPage({
      evaluateResult: [rawField],
      hasErrors: true,
      errorText: 'Email is required',
    });
    const result = await testFormValidation(page);
    expect(result.requiredFieldResults[0].enforcesRequired).toBe(true);
    expect(result.requiredFieldResults[0].errorMessage).toBe('Email is required');
  });
});

// ---------------------------------------------------------------------------
// testHappyPath
// ---------------------------------------------------------------------------

describe('testHappyPath', () => {
  it('detects success state from page body text', async () => {
    const page = buildPage({
      evaluateResult: [],
      bodyText: 'Thank you for your submission!',
    });
    const result = await testHappyPath(page, { submitWaitMs: 0 });
    expect(result.successStateDetected).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('reports failure when no success state is detected', async () => {
    const page = buildPage({
      evaluateResult: [],
      bodyText: 'Some unrelated page content',
    });
    const result = await testHappyPath(page, { submitWaitMs: 0 });
    expect(result.successStateDetected).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('reports errors in steps when validation errors appear after submission', async () => {
    const page = buildPage({
      evaluateResult: [],
      bodyText: '',
      hasErrors: true,
      errorText: 'Unexpected error',
    });
    const result = await testHappyPath(page, { submitWaitMs: 0 });
    const errorStep = result.steps.find((s) => s.name === 'No validation errors after submission');
    expect(errorStep?.passed).toBe(false);
  });

  it('uses successSelectors when provided', async () => {
    const page = buildPage({
      evaluateResult: [],
      bodyText: '',
      successVisible: true,
    });
    const result = await testHappyPath(page, {
      successSelectors: ['#success-banner'],
      submitWaitMs: 0,
    });
    expect(result.successStateDetected).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// testEdgeCases
// ---------------------------------------------------------------------------

describe('testEdgeCases', () => {
  it('passes edge case tests for page with no text fields', async () => {
    const page = buildPage({ evaluateResult: [] });
    const result = await testEdgeCases(page, { submitWaitMs: 0 });
    expect(result.specialCharacters.passed).toBe(true);
    expect(result.longInput.passed).toBe(true);
  });

  it('emptySubmission passes when form shows errors', async () => {
    const page = buildPage({
      evaluateResult: [],
      hasErrors: true,
      errorText: 'Required',
    });
    const result = await testEdgeCases(page, { submitWaitMs: 0 });
    expect(result.emptySubmission.passed).toBe(true);
  });

  it('emptySubmission fails when form accepts empty without errors and has required fields', async () => {
    const rawField = {
      tagName: 'INPUT',
      type: 'text',
      name: 'name',
      id: 'name',
      placeholder: null,
      required: true,
      disabled: false,
      readOnly: false,
      options: [],
      maxLength: -1,
      minLength: -1,
      pattern: null,
      min: null,
      max: null,
      labelText: 'Name',
      xpath: '//input[1]',
    };
    const page = buildPage({
      evaluateResult: [rawField],
      hasErrors: false,
    });
    const result = await testEdgeCases(page, { submitWaitMs: 0 });
    expect(result.emptySubmission.passed).toBe(false);
  });

  it('longInput passes when field accepts value without truncating below maxLength', async () => {
    const rawField = {
      tagName: 'INPUT',
      type: 'text',
      name: 'bio',
      id: 'bio',
      placeholder: null,
      required: false,
      disabled: false,
      readOnly: false,
      options: [],
      maxLength: -1,
      minLength: -1,
      pattern: null,
      min: null,
      max: null,
      labelText: 'Bio',
      xpath: '//input[1]',
    };
    const page = buildPage({
      evaluateResult: [rawField],
      inputValue: 'a'.repeat(5000),
    });
    const result = await testEdgeCases(page, { submitWaitMs: 0 });
    expect(result.longInput.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runFormTests
// ---------------------------------------------------------------------------

describe('runFormTests', () => {
  it('returns a FormTestReport with all required sections', async () => {
    const page = buildPage({
      evaluateResult: [],
      bodyText: 'Thank you',
    });
    const report = await runFormTests(page, { submitWaitMs: 0 });

    expect(report).toHaveProperty('passed');
    expect(report).toHaveProperty('totalTests');
    expect(report).toHaveProperty('passedTests');
    expect(report).toHaveProperty('failedTests');
    expect(report).toHaveProperty('validation');
    expect(report).toHaveProperty('happyPath');
    expect(report).toHaveProperty('edgeCases');
    expect(report).toHaveProperty('timestamp');
    expect(report).toHaveProperty('durationMs');
    expect(typeof report.durationMs).toBe('number');
    expect(report.totalTests).toBe(report.passedTests + report.failedTests);
  });

  it('calls page.reload between test scenarios', async () => {
    const reloadMock = jest.fn().mockResolvedValue(undefined);
    const page = buildPage({ reload: reloadMock, submitWaitMs: 0 });
    await runFormTests(page, { submitWaitMs: 0 });
    expect(reloadMock).toHaveBeenCalledTimes(2);
  });

  it('timestamp is a valid ISO string', async () => {
    const page = buildPage({ evaluateResult: [] });
    const report = await runFormTests(page, { submitWaitMs: 0 });
    expect(() => new Date(report.timestamp)).not.toThrow();
    expect(new Date(report.timestamp).toISOString()).toBe(report.timestamp);
  });
});
