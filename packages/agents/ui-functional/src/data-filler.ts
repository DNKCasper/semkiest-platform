import type { Page } from '@playwright/test';
import { DetectedField, FieldType, filterInteractableFields } from './field-detector';

/**
 * Strategy for generating test data when filling form fields.
 *
 * - `random`  – Generate plausible random values appropriate for the field type.
 * - `fixed`   – Use the caller-supplied `fixedValues` map; fall back to random for
 *               any field not listed.
 * - `edge`    – Fill with edge-case values (empty strings, very long strings,
 *               special characters) to stress-test validation.
 */
export type FillStrategy = 'random' | 'fixed' | 'edge';

/** Options controlling how `autoFillForm` behaves. */
export interface FillOptions {
  /** Data generation strategy. Defaults to `'random'`. */
  strategy?: FillStrategy;
  /**
   * Map of field name or id → value to use when `strategy === 'fixed'`.
   * Keys are matched first by `field.name`, then by `field.id`.
   */
  fixedValues?: Record<string, string>;
  /** Skip disabled or read-only fields (default: true). */
  skipNonInteractable?: boolean;
  /**
   * Delay in milliseconds between filling each field. Useful for pages
   * that react to input events with animations or async validation.
   */
  interFieldDelayMs?: number;
}

/** Result of attempting to fill a single field. */
export interface FieldFillResult {
  field: DetectedField;
  value: string;
  success: boolean;
  error?: string;
}

/** Aggregate result for an `autoFillForm` call. */
export interface FillResult {
  /** Number of fields successfully filled. */
  filled: number;
  /** Number of fields skipped (non-interactable or deliberately excluded). */
  skipped: number;
  /** Per-field results. */
  fieldResults: FieldFillResult[];
}

// ---------------------------------------------------------------------------
// Data generation helpers
// ---------------------------------------------------------------------------

const SPECIAL_CHARS = '!@#$%^&*()_+-=[]{}|;\':"./<>?`~\\';
const LOREM =
  'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomEmail(): string {
  const names = ['alice', 'bob', 'charlie', 'dave', 'eve'];
  const domains = ['example.com', 'test.org', 'demo.net'];
  return `${randomChoice(names)}${randomInt(1, 999)}@${randomChoice(domains)}`;
}

function randomPhone(): string {
  return `+1${randomInt(200, 999)}${randomInt(100, 999)}${randomInt(1000, 9999)}`;
}

function randomUrl(): string {
  return `https://example-${randomInt(1, 100)}.com/path`;
}

function randomDate(): string {
  const year = randomInt(1970, 2024);
  const month = String(randomInt(1, 12)).padStart(2, '0');
  const day = String(randomInt(1, 28)).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function randomDateTimeLocal(): string {
  return `${randomDate()}T${String(randomInt(0, 23)).padStart(2, '0')}:${String(randomInt(0, 59)).padStart(2, '0')}`;
}

function randomTime(): string {
  return `${String(randomInt(0, 23)).padStart(2, '0')}:${String(randomInt(0, 59)).padStart(2, '0')}`;
}

/**
 * Generates a plausible random value for a given field based on its type and
 * optional constraints.
 */
export function generateRandomValue(field: DetectedField): string {
  const { type, options, maxLength, minLength, min, max } = field;

  switch (type) {
    case FieldType.EMAIL:
      return randomEmail();

    case FieldType.PASSWORD:
      return `P@ssw0rd${randomInt(10, 99)}!`;

    case FieldType.NUMBER: {
      const lo = min !== undefined ? Number(min) : 1;
      const hi = max !== undefined ? Number(max) : 100;
      return String(randomInt(lo, hi));
    }

    case FieldType.TEL:
      return randomPhone();

    case FieldType.URL:
      return randomUrl();

    case FieldType.DATE:
      return randomDate();

    case FieldType.DATETIME_LOCAL:
      return randomDateTimeLocal();

    case FieldType.TIME:
      return randomTime();

    case FieldType.COLOR:
      return `#${randomInt(0, 0xffffff).toString(16).padStart(6, '0')}`;

    case FieldType.RANGE: {
      const lo = min !== undefined ? Number(min) : 0;
      const hi = max !== undefined ? Number(max) : 100;
      return String(randomInt(lo, hi));
    }

    case FieldType.SELECT:
      if (options && options.length > 0) {
        // Avoid the first option as it is usually a placeholder.
        const selectable = options.length > 1 ? options.slice(1) : options;
        return randomChoice(selectable);
      }
      return '';

    case FieldType.CHECKBOX:
      return 'true';

    case FieldType.RADIO:
      return 'true';

    case FieldType.TEXTAREA: {
      const words = LOREM.split(' ');
      const count = randomInt(5, 20);
      let text = words.slice(0, count).join(' ') + '.';
      if (maxLength && text.length > maxLength) {
        text = text.slice(0, maxLength);
      }
      return text;
    }

    default: {
      // Generic text
      const base = `Test input ${randomInt(100, 9999)}`;
      const lo = minLength ?? 0;
      const hi = maxLength ?? 255;
      let text = base;
      while (text.length < lo) text += ' data';
      if (text.length > hi) text = text.slice(0, hi);
      return text;
    }
  }
}

/**
 * Generates an edge-case value for a given field (empty, max-length, or
 * special characters depending on the field type).
 */
export function generateEdgeValue(
  field: DetectedField,
  variant: 'empty' | 'long' | 'special',
): string {
  if (variant === 'empty') return '';

  if (variant === 'long') {
    const length = (field.maxLength ?? 0) > 0 ? field.maxLength! + 10 : 5000;
    return 'a'.repeat(length);
  }

  // special characters
  if (
    field.type === FieldType.NUMBER ||
    field.type === FieldType.DATE ||
    field.type === FieldType.DATETIME_LOCAL ||
    field.type === FieldType.TIME ||
    field.type === FieldType.RANGE
  ) {
    // These fields don't accept special chars via keyboard in real browsers,
    // return a string that violates numeric expectations.
    return 'abc!@#';
  }

  return SPECIAL_CHARS;
}

// ---------------------------------------------------------------------------
// Field filling
// ---------------------------------------------------------------------------

/**
 * Fills a single form field with the provided value using Playwright.
 *
 * Handles checkboxes, radio buttons, selects, and text-based inputs
 * differently to match real user interactions.
 */
export async function fillField(
  page: Page,
  field: DetectedField,
  value: string,
): Promise<FieldFillResult> {
  try {
    const locator = page.locator(field.selector).first();

    switch (field.type) {
      case FieldType.CHECKBOX: {
        const shouldCheck = value === 'true' || value === '1' || value === 'on';
        const isChecked = await locator.isChecked();
        if (shouldCheck !== isChecked) await locator.click();
        break;
      }

      case FieldType.RADIO: {
        await locator.click();
        break;
      }

      case FieldType.SELECT: {
        if (value) await locator.selectOption(value);
        break;
      }

      case FieldType.FILE: {
        // File upload fields require a file path — skip if no value.
        if (value) await locator.setInputFiles(value);
        break;
      }

      case FieldType.DATE:
      case FieldType.DATETIME_LOCAL:
      case FieldType.TIME:
      case FieldType.COLOR:
      case FieldType.RANGE: {
        await locator.fill(value);
        break;
      }

      default: {
        await locator.fill(value);
        break;
      }
    }

    return { field, value, success: true };
  } catch (err) {
    return {
      field,
      value,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Automatically fills all interactable fields on the page.
 *
 * @param page    - Playwright `Page` instance.
 * @param fields  - Fields to fill, typically from `detectFormFields`.
 * @param options - Fill configuration.
 * @returns A `FillResult` summarising what was filled and what was skipped.
 */
export async function autoFillForm(
  page: Page,
  fields: DetectedField[],
  options: FillOptions = {},
): Promise<FillResult> {
  const {
    strategy = 'random',
    fixedValues = {},
    skipNonInteractable = true,
    interFieldDelayMs = 0,
  } = options;

  const candidates = skipNonInteractable ? filterInteractableFields(fields) : fields;
  const skipped = fields.length - candidates.length;
  const fieldResults: FieldFillResult[] = [];

  for (const field of candidates) {
    let value: string;

    if (strategy === 'fixed') {
      const key = field.name ?? field.id ?? '';
      value = fixedValues[key] ?? generateRandomValue(field);
    } else if (strategy === 'edge') {
      value = generateEdgeValue(field, 'special');
    } else {
      value = generateRandomValue(field);
    }

    const result = await fillField(page, field, value);
    fieldResults.push(result);

    if (interFieldDelayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, interFieldDelayMs));
    }
  }

  const filled = fieldResults.filter((r) => r.success).length;

  return { filled, skipped, fieldResults };
}
