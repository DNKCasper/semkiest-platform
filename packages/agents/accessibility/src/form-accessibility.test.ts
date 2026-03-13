import type { Page } from 'playwright';
import { checkFormAccessibility } from './form-accessibility';

function makePage(formData: unknown[]): Page {
  return {
    evaluate: jest.fn().mockResolvedValue(formData),
  } as unknown as Page;
}

const labeledInput = {
  element: '#email',
  inputType: 'email',
  hasLabel: true,
  labelText: 'Email address',
  labelMethod: 'for-attribute' as const,
  isRequired: false,
  hasRequiredIndicator: false,
  hasAriaRequired: false,
  isValid: true,
};

const unlabeledInput = {
  element: 'input[type="text"]',
  inputType: 'text',
  hasLabel: false,
  labelText: null,
  labelMethod: 'none' as const,
  isRequired: false,
  hasRequiredIndicator: false,
  hasAriaRequired: false,
  isValid: false,
};

const requiredInputMissingIndicator = {
  element: '#phone',
  inputType: 'tel',
  hasLabel: true,
  labelText: 'Phone',
  labelMethod: 'for-attribute' as const,
  isRequired: true,
  hasRequiredIndicator: false,
  hasAriaRequired: false,
  isValid: true,
};

const accessibleErrorContainer = {
  element: '#error-msg',
  hasAriaLive: true,
  ariaLiveValue: 'assertive',
  hasRole: false,
  roleValue: null,
  isAccessible: true,
};

const inaccessibleErrorContainer = {
  element: 'div.error',
  hasAriaLive: false,
  ariaLiveValue: null,
  hasRole: false,
  roleValue: null,
  isAccessible: false,
};

describe('checkFormAccessibility', () => {
  it('returns passed=true for a fully accessible form', async () => {
    const page = makePage([
      {
        formSelector: 'form#contact',
        inputs: [labeledInput],
        hasFieldsets: false,
        errorContainers: [accessibleErrorContainer],
      },
    ]);

    const result = await checkFormAccessibility(page);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.summary.labeledInputs).toBe(1);
    expect(result.summary.unlabeledInputs).toBe(0);
  });

  it('reports missing-label violation for unlabeled inputs', async () => {
    const page = makePage([
      {
        formSelector: 'form#search',
        inputs: [unlabeledInput],
        hasFieldsets: false,
        errorContainers: [],
      },
    ]);

    const result = await checkFormAccessibility(page);
    expect(result.passed).toBe(false);
    const labelViolations = result.violations.filter((v) => v.type === 'missing-label');
    expect(labelViolations).toHaveLength(1);
    expect(labelViolations[0].severity).toBe('critical');
  });

  it('reports missing-required-indicator when required but no aria-required', async () => {
    const page = makePage([
      {
        formSelector: 'form#signup',
        inputs: [requiredInputMissingIndicator],
        hasFieldsets: false,
        errorContainers: [],
      },
    ]);

    const result = await checkFormAccessibility(page);
    expect(result.passed).toBe(false);
    const reqViolations = result.violations.filter(
      (v) => v.type === 'missing-required-indicator'
    );
    expect(reqViolations).toHaveLength(1);
    expect(reqViolations[0].element).toBe('#phone');
  });

  it('reports missing-fieldset when radios/checkboxes have no fieldset', async () => {
    const radioInput = {
      ...labeledInput,
      inputType: 'radio',
      element: 'input[type="radio"]',
    };

    const page = makePage([
      {
        formSelector: 'form#preferences',
        inputs: [radioInput],
        hasFieldsets: false,
        errorContainers: [],
      },
    ]);

    const result = await checkFormAccessibility(page);
    const fieldsetViolations = result.violations.filter(
      (v) => v.type === 'missing-fieldset'
    );
    expect(fieldsetViolations).toHaveLength(1);
    expect(fieldsetViolations[0].severity).toBe('moderate');
  });

  it('does NOT report missing-fieldset when fieldset is present', async () => {
    const radioInput = {
      ...labeledInput,
      inputType: 'radio',
      element: 'input[type="radio"]',
    };

    const page = makePage([
      {
        formSelector: 'form#preferences',
        inputs: [radioInput],
        hasFieldsets: true,
        errorContainers: [],
      },
    ]);

    const result = await checkFormAccessibility(page);
    const fieldsetViolations = result.violations.filter(
      (v) => v.type === 'missing-fieldset'
    );
    expect(fieldsetViolations).toHaveLength(0);
  });

  it('reports missing-error-announcement for inaccessible error containers', async () => {
    const page = makePage([
      {
        formSelector: 'form#login',
        inputs: [labeledInput],
        hasFieldsets: false,
        errorContainers: [inaccessibleErrorContainer],
      },
    ]);

    const result = await checkFormAccessibility(page);
    const errorViolations = result.violations.filter(
      (v) => v.type === 'missing-error-announcement'
    );
    expect(errorViolations).toHaveLength(1);
    expect(errorViolations[0].element).toBe('div.error');
  });

  it('reports empty-label violation for inputs with blank labels', async () => {
    const emptyLabelInput = {
      ...labeledInput,
      labelText: '   ',
    };

    const page = makePage([
      {
        formSelector: 'form#test',
        inputs: [emptyLabelInput],
        hasFieldsets: false,
        errorContainers: [],
      },
    ]);

    const result = await checkFormAccessibility(page);
    const emptyViolations = result.violations.filter((v) => v.type === 'empty-label');
    expect(emptyViolations).toHaveLength(1);
    expect(emptyViolations[0].severity).toBe('serious');
  });

  it('computes summary totals correctly', async () => {
    const page = makePage([
      {
        formSelector: 'form#big',
        inputs: [labeledInput, unlabeledInput],
        hasFieldsets: false,
        errorContainers: [accessibleErrorContainer],
      },
    ]);

    const result = await checkFormAccessibility(page);
    expect(result.summary.totalForms).toBe(1);
    expect(result.summary.totalInputs).toBe(2);
    expect(result.summary.labeledInputs).toBe(1);
    expect(result.summary.unlabeledInputs).toBe(1);
    expect(result.summary.accessibleErrors).toBe(1);
  });

  it('handles pages with no forms gracefully', async () => {
    const page = makePage([]);
    const result = await checkFormAccessibility(page);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.summary.totalForms).toBe(0);
  });
});
