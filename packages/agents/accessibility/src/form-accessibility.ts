import type { Page } from 'playwright';

export interface FormAccessibilityResult {
  passed: boolean;
  violations: FormViolation[];
  forms: FormCheckResult[];
  summary: FormSummary;
}

export interface FormViolation {
  type:
    | 'missing-label'
    | 'missing-error-announcement'
    | 'missing-required-indicator'
    | 'inaccessible-error'
    | 'missing-fieldset'
    | 'empty-label';
  element: string;
  message: string;
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
}

export interface FormCheckResult {
  formSelector: string;
  inputs: InputAccessibilityResult[];
  hasFieldsets: boolean;
  errorContainers: ErrorContainerResult[];
}

export interface InputAccessibilityResult {
  element: string;
  inputType: string;
  hasLabel: boolean;
  labelText: string | null;
  labelMethod: 'for-attribute' | 'wrapping' | 'aria-label' | 'aria-labelledby' | 'title' | 'none';
  isRequired: boolean;
  hasRequiredIndicator: boolean;
  hasAriaRequired: boolean;
  isValid: boolean;
}

export interface ErrorContainerResult {
  element: string;
  hasAriaLive: boolean;
  ariaLiveValue: string | null;
  hasRole: boolean;
  roleValue: string | null;
  isAccessible: boolean;
}

export interface FormSummary {
  totalForms: number;
  totalInputs: number;
  labeledInputs: number;
  unlabeledInputs: number;
  accessibleErrors: number;
}

/**
 * Performs a comprehensive form accessibility audit:
 * - Label association (for/id, wrapping, aria-label, aria-labelledby)
 * - Required field indicators accessible to screen readers
 * - Error message containers with live regions or role="alert"
 * - Fieldset/legend usage for grouped inputs
 */
export async function checkFormAccessibility(
  page: Page
): Promise<FormAccessibilityResult> {
  const violations: FormViolation[] = [];
  const forms = await auditForms(page);

  for (const form of forms) {
    for (const input of form.inputs) {
      if (!input.hasLabel) {
        violations.push({
          type: 'missing-label',
          element: input.element,
          message: `Input "${input.inputType}" has no accessible label. Associate a <label> via "for" attribute, wrap the input in a <label>, or use aria-label/aria-labelledby.`,
          severity: 'critical',
        });
      } else if (input.labelText !== null && input.labelText.trim() === '') {
        violations.push({
          type: 'empty-label',
          element: input.element,
          message: `Input "${input.inputType}" has an empty label, which provides no accessible name.`,
          severity: 'serious',
        });
      }

      if (input.isRequired && !input.hasRequiredIndicator && !input.hasAriaRequired) {
        violations.push({
          type: 'missing-required-indicator',
          element: input.element,
          message: `Required input "${input.inputType}" lacks an accessible required indicator. Use aria-required="true" or the HTML required attribute.`,
          severity: 'serious',
        });
      }
    }

    // Check radio/checkbox groups have fieldset+legend
    const hasGroupedInputs = form.inputs.some(
      (i) => i.inputType === 'radio' || i.inputType === 'checkbox'
    );
    if (hasGroupedInputs && !form.hasFieldsets) {
      violations.push({
        type: 'missing-fieldset',
        element: form.formSelector,
        message: `Form contains radio or checkbox inputs but no <fieldset> with <legend>. Group related inputs with fieldset/legend for screen reader clarity.`,
        severity: 'moderate',
      });
    }

    // Check error containers
    for (const errorContainer of form.errorContainers) {
      if (!errorContainer.isAccessible) {
        violations.push({
          type: 'missing-error-announcement',
          element: errorContainer.element,
          message: `Error container is not announced to screen readers. Add aria-live="polite" (or "assertive") or role="alert".`,
          severity: 'serious',
        });
      }
    }
  }

  const allInputs = forms.flatMap((f) => f.inputs);
  const labeled = allInputs.filter((i) => i.hasLabel).length;

  return {
    passed: violations.length === 0,
    violations,
    forms,
    summary: {
      totalForms: forms.length,
      totalInputs: allInputs.length,
      labeledInputs: labeled,
      unlabeledInputs: allInputs.length - labeled,
      accessibleErrors: forms
        .flatMap((f) => f.errorContainers)
        .filter((e) => e.isAccessible).length,
    },
  };
}

async function auditForms(page: Page): Promise<FormCheckResult[]> {
  return page.evaluate(() => {
    const forms = Array.from(document.querySelectorAll('form'));

    // Also capture orphaned inputs not inside a form
    const orphanedInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input:not(form input), select:not(form select), textarea:not(form textarea)'
      )
    );

    const allFormLike: (HTMLFormElement | null)[] = [
      ...forms,
      ...(orphanedInputs.length > 0 ? [null] : []),
    ];

    return allFormLike.map((form) => {
      const container: Element = form ?? document.body;
      const selector = form
        ? form.id
          ? `#${form.id}`
          : `form:nth-of-type(${forms.indexOf(form) + 1})`
        : 'document (orphaned inputs)';

      const inputEls = Array.from(
        container.querySelectorAll<HTMLInputElement>(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea'
        )
      );

      const inputs: {
        element: string;
        inputType: string;
        hasLabel: boolean;
        labelText: string | null;
        labelMethod: 'for-attribute' | 'wrapping' | 'aria-label' | 'aria-labelledby' | 'title' | 'none';
        isRequired: boolean;
        hasRequiredIndicator: boolean;
        hasAriaRequired: boolean;
        isValid: boolean;
      }[] = inputEls.map((el) => {
        const tag = el.tagName.toLowerCase();
        const type =
          el instanceof HTMLInputElement ? el.type || 'text' : tag;
        const inputSelector = el.id
          ? `#${el.id}`
          : `${tag}[type="${type}"]`;

        const ariaLabel = el.getAttribute('aria-label');
        const ariaLabelledBy = el.getAttribute('aria-labelledby');
        const titleAttr = el.getAttribute('title');
        const isRequired =
          el.hasAttribute('required') ||
          el.getAttribute('aria-required') === 'true';
        const hasAriaRequired =
          el.getAttribute('aria-required') === 'true';

        // Check for-attribute label
        let labelMethod: 'for-attribute' | 'wrapping' | 'aria-label' | 'aria-labelledby' | 'title' | 'none' =
          'none';
        let labelText: string | null = null;

        if (ariaLabel) {
          labelMethod = 'aria-label';
          labelText = ariaLabel;
        } else if (ariaLabelledBy) {
          labelMethod = 'aria-labelledby';
          const refEl = document.getElementById(ariaLabelledBy);
          labelText = refEl?.textContent?.trim() ?? null;
        } else if (el.id) {
          const forLabel = document.querySelector<HTMLLabelElement>(
            `label[for="${el.id}"]`
          );
          if (forLabel) {
            labelMethod = 'for-attribute';
            labelText = forLabel.textContent?.trim() ?? null;
          }
        }

        if (labelMethod === 'none') {
          // Check wrapping label
          const wrappingLabel = el.closest('label');
          if (wrappingLabel) {
            labelMethod = 'wrapping';
            labelText = wrappingLabel.textContent?.trim() ?? null;
          } else if (titleAttr) {
            labelMethod = 'title';
            labelText = titleAttr;
          }
        }

        const hasLabel = labelMethod !== 'none';

        // Required indicator: HTML required attr or aria-required
        const hasRequiredIndicator = isRequired;

        return {
          element: inputSelector,
          inputType: type,
          hasLabel,
          labelText,
          labelMethod,
          isRequired,
          hasRequiredIndicator,
          hasAriaRequired,
          isValid: hasLabel,
        };
      });

      // Detect fieldset elements within this form
      const hasFieldsets = container.querySelector('fieldset') !== null;

      // Detect error containers with live regions
      const errorSelectors = [
        '[role="alert"]',
        '[aria-live]',
        '.error', '.errors', '.form-error', '.field-error',
        '[data-error]', '[id*="error"]', '[class*="error"]',
      ].join(', ');

      const errorEls = Array.from(container.querySelectorAll(errorSelectors));
      const errorContainers = errorEls.map((el) => {
        const ariaLive = el.getAttribute('aria-live');
        const role = el.getAttribute('role');
        const isAccessible =
          role === 'alert' ||
          ariaLive === 'assertive' ||
          ariaLive === 'polite';

        const eSelector = el.id
          ? `#${el.id}`
          : `${el.tagName.toLowerCase()}${
              el.className ? `.${String(el.className).split(' ')[0]}` : ''
            }`;

        return {
          element: eSelector,
          hasAriaLive: ariaLive !== null,
          ariaLiveValue: ariaLive,
          hasRole: role !== null,
          roleValue: role,
          isAccessible,
        };
      });

      return {
        formSelector: selector,
        inputs,
        hasFieldsets,
        errorContainers,
      };
    });
  });
}
