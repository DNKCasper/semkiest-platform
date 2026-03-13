import type { Page } from '@playwright/test';
import { DetectedField, FieldType, detectFormFields, filterInteractableFields } from './field-detector';
import { autoFillForm, fillField, generateEdgeValue, generateRandomValue } from './data-filler';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Result of an individual test step within a form test scenario. */
export interface FormTestStep {
  /** Human-readable description of the step. */
  name: string;
  /** Whether the step passed. */
  passed: boolean;
  /** Additional detail or error message. */
  detail: string;
}

/** Result of testing required-field enforcement for a single field. */
export interface RequiredFieldResult {
  field: DetectedField;
  /** Whether the form refused to submit when this field was empty. */
  enforcesRequired: boolean;
  /** The error message text displayed, if any. */
  errorMessage: string | null;
}

/** Aggregate result of form validation testing. */
export interface ValidationTestResult {
  /** Overall pass/fail: true when all required fields are enforced. */
  passed: boolean;
  requiredFieldResults: RequiredFieldResult[];
  /** Whether format validation (e.g. email, url) triggered visible errors. */
  formatValidationWorking: boolean;
  formatValidationDetail: string;
  steps: FormTestStep[];
}

/** Result of happy-path form submission. */
export interface HappyPathResult {
  /** Whether the form submitted without errors. */
  passed: boolean;
  /** Whether a success state (thank-you message, redirect, etc.) was detected. */
  successStateDetected: boolean;
  successDetail: string;
  steps: FormTestStep[];
}

/** Result of a single edge-case scenario. */
export interface EdgeCaseScenario {
  name: string;
  passed: boolean;
  detail: string;
}

/** Aggregate result of edge-case testing. */
export interface EdgeCaseResult {
  passed: boolean;
  emptySubmission: EdgeCaseScenario;
  specialCharacters: EdgeCaseScenario;
  longInput: EdgeCaseScenario;
}

/**
 * Full test report produced by `runFormTests`.
 * Designed to integrate into the wider test reporting infrastructure
 * introduced by SEM-67 (Core Test Execution Engine).
 */
export interface FormTestReport {
  /** Overall pass/fail across all test scenarios. */
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  validation: ValidationTestResult;
  happyPath: HappyPathResult;
  edgeCases: EdgeCaseResult;
  /** ISO-8601 timestamp when the report was generated. */
  timestamp: string;
  /** Total duration in milliseconds. */
  durationMs: number;
}

/** Options for `runFormTests`. */
export interface FormTestOptions {
  /**
   * CSS selector for the form element to test.
   * Defaults to the first `<form>` on the page.
   */
  formSelector?: string;
  /**
   * CSS selector for the submit button/input when there is no `<form>`.
   * Ignored if a `<form>` element is found.
   */
  submitSelector?: string;
  /**
   * Selectors that indicate a successful submission (e.g. a thank-you banner).
   * The tester checks for their visibility after submission.
   */
  successSelectors?: string[];
  /**
   * Time in milliseconds to wait after clicking submit before checking results.
   * Defaults to 2000.
   */
  submitWaitMs?: number;
  /** Whether to capture a screenshot on test failure. Defaults to false. */
  captureScreenshotOnFailure?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getFormFields(page: Page, formSelector?: string): Promise<DetectedField[]> {
  if (formSelector) {
    // Scope evaluation to the specific form element.
    const allFields = await detectFormFields(page);
    // Re-detect using the form's own context; for now filter by presence inside the form.
    // This is a best-effort approach since detectFormFields scans the whole page.
    return allFields;
  }
  return detectFormFields(page);
}

async function clickSubmit(
  page: Page,
  formSelector?: string,
  submitSelector?: string,
): Promise<void> {
  // 1. Named submit selector
  if (submitSelector) {
    await page.locator(submitSelector).first().click();
    return;
  }

  // 2. Submit input/button inside the form
  const scope = formSelector ? page.locator(formSelector).first() : page;
  const submitBtn = scope.locator(
    'button[type="submit"], input[type="submit"], button:not([type])',
  );
  const count = await submitBtn.count();
  if (count > 0) {
    await submitBtn.first().click();
    return;
  }

  // 3. Fallback: press Enter on the last input
  const inputs = page.locator('input:not([type="hidden"]):not([type="submit"])');
  const inputCount = await inputs.count();
  if (inputCount > 0) {
    await inputs.last().press('Enter');
  }
}

async function checkSuccessState(
  page: Page,
  successSelectors: string[],
): Promise<{ detected: boolean; detail: string }> {
  if (successSelectors.length === 0) {
    // Heuristic: look for common success keywords in the page body.
    const bodyText = await page.locator('body').textContent();
    const lower = (bodyText ?? '').toLowerCase();
    const keywords = ['success', 'thank you', 'thank-you', 'submitted', 'confirmation'];
    const found = keywords.find((k) => lower.includes(k));
    if (found) {
      return { detected: true, detail: `Found success keyword: "${found}"` };
    }
    return { detected: false, detail: 'No success indicator found in page text' };
  }

  for (const sel of successSelectors) {
    try {
      const visible = await page.locator(sel).first().isVisible();
      if (visible) return { detected: true, detail: `Success element visible: ${sel}` };
    } catch {
      // selector may not exist on the page; continue
    }
  }
  return { detected: false, detail: 'None of the provided success selectors are visible' };
}

async function getVisibleErrorMessages(page: Page): Promise<string[]> {
  const errorLocators = [
    '[role="alert"]',
    '.error',
    '.error-message',
    '.field-error',
    '.invalid-feedback',
    '[aria-invalid="true"]',
    '.form-error',
  ];
  const messages: string[] = [];

  for (const sel of errorLocators) {
    const elements = page.locator(sel);
    const count = await elements.count();
    for (let i = 0; i < count; i++) {
      const text = await elements.nth(i).textContent();
      if (text?.trim()) messages.push(text.trim());
    }
  }

  return [...new Set(messages)];
}

// ---------------------------------------------------------------------------
// Validation testing
// ---------------------------------------------------------------------------

/**
 * Tests form validation by:
 * 1. Submitting the form empty to check required-field enforcement.
 * 2. Entering invalid format values (e.g. text into an email field) to verify
 *    format validation triggers visible error messages.
 *
 * @param page    - Playwright `Page` pointing to the page containing the form.
 * @param options - Test configuration.
 */
export async function testFormValidation(
  page: Page,
  options: FormTestOptions = {},
): Promise<ValidationTestResult> {
  const {
    formSelector,
    submitSelector,
    submitWaitMs = 2000,
  } = options;

  const steps: FormTestStep[] = [];
  const requiredFieldResults: RequiredFieldResult[] = [];

  // --- Step 1: detect fields ---
  const allFields = await getFormFields(page, formSelector);
  const interactable = filterInteractableFields(allFields);
  const requiredFields = interactable.filter((f) => f.required);

  steps.push({
    name: 'Detect form fields',
    passed: allFields.length > 0,
    detail: `Found ${allFields.length} total fields, ${interactable.length} interactable, ${requiredFields.length} required`,
  });

  // --- Step 2: test required fields by submitting empty ---
  for (const field of requiredFields) {
    // Clear the field then attempt submit.
    try {
      if (
        field.type !== FieldType.CHECKBOX &&
        field.type !== FieldType.RADIO &&
        field.type !== FieldType.SELECT
      ) {
        await page.locator(field.selector).first().fill('');
      }
    } catch {
      // best effort
    }

    await clickSubmit(page, formSelector, submitSelector);
    await page.waitForTimeout(submitWaitMs / 4);

    const errors = await getVisibleErrorMessages(page);
    const enforced = errors.length > 0;
    const errorMsg = errors.length > 0 ? errors[0] : null;

    requiredFieldResults.push({
      field,
      enforcesRequired: enforced,
      errorMessage: errorMsg,
    });
  }

  const requiredEnforced = requiredFieldResults.every((r) => r.enforcesRequired);
  steps.push({
    name: 'Required field enforcement',
    passed: requiredEnforced,
    detail: requiredFields.length === 0
      ? 'No required fields found'
      : `${requiredFieldResults.filter((r) => r.enforcesRequired).length}/${requiredFields.length} required fields enforced`,
  });

  // --- Step 3: format validation ---
  const emailFields = interactable.filter((f) => f.type === FieldType.EMAIL);
  const urlFields = interactable.filter((f) => f.type === FieldType.URL);
  let formatValidationWorking = false;
  let formatValidationDetail = 'No email or URL fields found to test format validation';

  if (emailFields.length > 0) {
    await fillField(page, emailFields[0], 'not-a-valid-email');
    await clickSubmit(page, formSelector, submitSelector);
    await page.waitForTimeout(submitWaitMs / 4);
    const errors = await getVisibleErrorMessages(page);
    formatValidationWorking = errors.length > 0;
    formatValidationDetail = formatValidationWorking
      ? `Email format validation triggered: "${errors[0]}"`
      : 'Email format validation did not produce a visible error';
  } else if (urlFields.length > 0) {
    await fillField(page, urlFields[0], 'not-a-url');
    await clickSubmit(page, formSelector, submitSelector);
    await page.waitForTimeout(submitWaitMs / 4);
    const errors = await getVisibleErrorMessages(page);
    formatValidationWorking = errors.length > 0;
    formatValidationDetail = formatValidationWorking
      ? `URL format validation triggered: "${errors[0]}"`
      : 'URL format validation did not produce a visible error';
  }

  steps.push({
    name: 'Format validation',
    passed: formatValidationWorking || (emailFields.length === 0 && urlFields.length === 0),
    detail: formatValidationDetail,
  });

  const passed = steps.every((s) => s.passed);
  return {
    passed,
    requiredFieldResults,
    formatValidationWorking,
    formatValidationDetail,
    steps,
  };
}

// ---------------------------------------------------------------------------
// Happy path testing
// ---------------------------------------------------------------------------

/**
 * Tests the happy path: fills all fields with valid data and submits,
 * then checks for a success state.
 *
 * @param page    - Playwright `Page` pointing to the page containing the form.
 * @param options - Test configuration.
 */
export async function testHappyPath(
  page: Page,
  options: FormTestOptions = {},
): Promise<HappyPathResult> {
  const {
    formSelector,
    submitSelector,
    successSelectors = [],
    submitWaitMs = 2000,
  } = options;

  const steps: FormTestStep[] = [];

  // Step 1: detect and fill
  const allFields = await getFormFields(page, formSelector);
  steps.push({
    name: 'Detect form fields',
    passed: allFields.length > 0,
    detail: `Found ${allFields.length} fields`,
  });

  const fillResult = await autoFillForm(page, allFields, { strategy: 'random' });
  steps.push({
    name: 'Fill form with valid data',
    passed: fillResult.filled > 0 || allFields.length === 0,
    detail: `Filled ${fillResult.filled} fields, skipped ${fillResult.skipped}`,
  });

  // Step 2: submit
  await clickSubmit(page, formSelector, submitSelector);
  await page.waitForTimeout(submitWaitMs);

  // Step 3: check for errors
  const errors = await getVisibleErrorMessages(page);
  const noErrors = errors.length === 0;
  steps.push({
    name: 'No validation errors after submission',
    passed: noErrors,
    detail: noErrors ? 'No errors detected' : `Errors: ${errors.join('; ')}`,
  });

  // Step 4: check success state
  const { detected, detail } = await checkSuccessState(page, successSelectors);
  steps.push({
    name: 'Success state detected',
    passed: detected,
    detail,
  });

  const passed = steps.every((s) => s.passed);
  return {
    passed,
    successStateDetected: detected,
    successDetail: detail,
    steps,
  };
}

// ---------------------------------------------------------------------------
// Edge case testing
// ---------------------------------------------------------------------------

/**
 * Tests edge cases: empty submission, special characters, and extremely long input.
 *
 * @param page    - Playwright `Page` pointing to the page containing the form.
 * @param options - Test configuration.
 */
export async function testEdgeCases(
  page: Page,
  options: FormTestOptions = {},
): Promise<EdgeCaseResult> {
  const { formSelector, submitSelector, submitWaitMs = 2000 } = options;
  const allFields = await getFormFields(page, formSelector);
  const textFields = filterInteractableFields(allFields).filter(
    (f) =>
      f.type === FieldType.TEXT ||
      f.type === FieldType.TEXTAREA ||
      f.type === FieldType.EMAIL ||
      f.type === FieldType.SEARCH,
  );

  // --- Empty submission ---
  const emptySubmission = await (async (): Promise<EdgeCaseScenario> => {
    try {
      // Clear all text fields
      for (const field of textFields) {
        await page.locator(field.selector).first().fill('');
      }
      await clickSubmit(page, formSelector, submitSelector);
      await page.waitForTimeout(submitWaitMs / 2);
      const errors = await getVisibleErrorMessages(page);
      const handled = errors.length > 0 || allFields.every((f) => !f.required);
      return {
        name: 'Empty form submission',
        passed: handled,
        detail: handled
          ? `Form handled empty submission correctly (${errors.length} error(s) shown)`
          : 'Form accepted empty submission without validation errors',
      };
    } catch (err) {
      return {
        name: 'Empty form submission',
        passed: false,
        detail: `Error during empty submission test: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  })();

  // --- Special characters ---
  const specialCharacters = await (async (): Promise<EdgeCaseScenario> => {
    if (textFields.length === 0) {
      return {
        name: 'Special character input',
        passed: true,
        detail: 'No text fields found to test special character input',
      };
    }
    try {
      const targetField = textFields[0];
      const specialValue = generateEdgeValue(targetField, 'special');
      await fillField(page, targetField, specialValue);
      // Re-read the field value to verify it was accepted.
      const actualValue = await page.locator(targetField.selector).first().inputValue();
      const accepted = actualValue === specialValue || actualValue.length > 0;
      return {
        name: 'Special character input',
        passed: accepted,
        detail: accepted
          ? `Field "${targetField.name ?? targetField.id ?? targetField.selector}" accepted special characters`
          : `Field "${targetField.name ?? targetField.id ?? targetField.selector}" rejected or cleared special characters`,
      };
    } catch (err) {
      return {
        name: 'Special character input',
        passed: false,
        detail: `Error during special character test: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  })();

  // --- Long input ---
  const longInput = await (async (): Promise<EdgeCaseScenario> => {
    if (textFields.length === 0) {
      return {
        name: 'Long input handling',
        passed: true,
        detail: 'No text fields found to test long input',
      };
    }
    try {
      const targetField = textFields[0];
      const longValue = generateEdgeValue(targetField, 'long');
      await fillField(page, targetField, longValue);
      const actualValue = await page.locator(targetField.selector).first().inputValue();

      const maxLen = targetField.maxLength ?? Infinity;
      const truncated = actualValue.length <= maxLen;
      const notEmpty = actualValue.length > 0;

      const passed = notEmpty && (maxLen === Infinity || truncated);
      const detail = passed
        ? `Long input (${longValue.length} chars) handled correctly; field value length: ${actualValue.length}`
        : `Field value length ${actualValue.length} exceeds maxLength ${maxLen}`;

      return { name: 'Long input handling', passed, detail };
    } catch (err) {
      return {
        name: 'Long input handling',
        passed: false,
        detail: `Error during long input test: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  })();

  const passed =
    emptySubmission.passed && specialCharacters.passed && longInput.passed;

  return { passed, emptySubmission, specialCharacters, longInput };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Runs the complete form test suite (validation, happy path, edge cases) and
 * returns a structured `FormTestReport` suitable for integration into the
 * test reporting pipeline.
 *
 * @param page    - Playwright `Page` instance already navigated to the target URL.
 * @param options - Configuration for the test run.
 */
export async function runFormTests(
  page: Page,
  options: FormTestOptions = {},
): Promise<FormTestReport> {
  const startTime = Date.now();
  const { captureScreenshotOnFailure = false } = options;

  const validation = await testFormValidation(page, options);

  // Reload page between scenarios to get a clean state.
  await page.reload();

  const happyPath = await testHappyPath(page, options);

  await page.reload();

  const edgeCases = await testEdgeCases(page, options);

  const allTests = [
    ...validation.steps,
    ...happyPath.steps,
    edgeCases.emptySubmission,
    edgeCases.specialCharacters,
    edgeCases.longInput,
  ];

  const totalTests = allTests.length;
  const passedTests = allTests.filter((t) => t.passed).length;
  const failedTests = totalTests - passedTests;
  const passed = failedTests === 0;

  if (!passed && captureScreenshotOnFailure) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({
      path: `form-test-failure-${timestamp}.png`,
      fullPage: true,
    });
  }

  return {
    passed,
    totalTests,
    passedTests,
    failedTests,
    validation,
    happyPath,
    edgeCases,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  };
}
