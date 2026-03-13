import type { Page } from '@playwright/test';

/**
 * Represents the type of a detected form field.
 */
export enum FieldType {
  TEXT = 'text',
  EMAIL = 'email',
  PASSWORD = 'password',
  NUMBER = 'number',
  TEL = 'tel',
  URL = 'url',
  DATE = 'date',
  DATETIME_LOCAL = 'datetime-local',
  TIME = 'time',
  SEARCH = 'search',
  HIDDEN = 'hidden',
  COLOR = 'color',
  RANGE = 'range',
  SELECT = 'select',
  TEXTAREA = 'textarea',
  CHECKBOX = 'checkbox',
  RADIO = 'radio',
  FILE = 'file',
  SUBMIT = 'submit',
  BUTTON = 'button',
  RESET = 'reset',
  UNKNOWN = 'unknown',
}

/**
 * Metadata describing a single detected form field.
 */
export interface DetectedField {
  /** Resolved field type. */
  type: FieldType;
  /** A unique CSS selector for locating the element on the page. */
  selector: string;
  /** The `name` attribute value, or null if absent. */
  name: string | null;
  /** The `id` attribute value, or null if absent. */
  id: string | null;
  /** Associated `<label>` text, or null if none found. */
  label: string | null;
  /** The `placeholder` attribute value, or null if absent. */
  placeholder: string | null;
  /** Whether the field is marked as required. */
  required: boolean;
  /** Whether the field is disabled. */
  disabled: boolean;
  /** Whether the field is read-only. */
  readOnly: boolean;
  /** Available options for `select` and `radio` field types. */
  options?: string[];
  /** Maximum character length constraint. */
  maxLength?: number;
  /** Minimum character length constraint. */
  minLength?: number;
  /** Validation pattern (regex string) if defined on the element. */
  pattern?: string;
  /** Minimum value constraint (for number/date fields). */
  min?: string;
  /** Maximum value constraint (for number/date fields). */
  max?: string;
}

/** Raw field data extracted inside page.evaluate — no DOM references. */
interface RawFieldData {
  tagName: string;
  type: string;
  name: string | null;
  id: string | null;
  placeholder: string | null;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  options: string[];
  maxLength: number;
  minLength: number;
  pattern: string | null;
  min: string | null;
  max: string | null;
  labelText: string | null;
  /** XPath used to construct a stable selector. */
  xpath: string;
}

const INPUT_TYPE_MAP: Record<string, FieldType> = {
  text: FieldType.TEXT,
  email: FieldType.EMAIL,
  password: FieldType.PASSWORD,
  number: FieldType.NUMBER,
  tel: FieldType.TEL,
  url: FieldType.URL,
  date: FieldType.DATE,
  'datetime-local': FieldType.DATETIME_LOCAL,
  time: FieldType.TIME,
  search: FieldType.SEARCH,
  hidden: FieldType.HIDDEN,
  color: FieldType.COLOR,
  range: FieldType.RANGE,
  checkbox: FieldType.CHECKBOX,
  radio: FieldType.RADIO,
  file: FieldType.FILE,
  submit: FieldType.SUBMIT,
  button: FieldType.BUTTON,
  reset: FieldType.RESET,
};

function resolveFieldType(raw: RawFieldData): FieldType {
  if (raw.tagName === 'SELECT') return FieldType.SELECT;
  if (raw.tagName === 'TEXTAREA') return FieldType.TEXTAREA;
  if (raw.tagName === 'INPUT') {
    return INPUT_TYPE_MAP[raw.type.toLowerCase()] ?? FieldType.UNKNOWN;
  }
  return FieldType.UNKNOWN;
}

function buildSelector(raw: RawFieldData): string {
  if (raw.id) return `#${CSS.escape(raw.id)}`;
  if (raw.name) {
    const tag = raw.tagName.toLowerCase();
    return `${tag}[name="${raw.name}"]`;
  }
  return raw.xpath;
}

/** Minimal CSS.escape polyfill for Node environments. */
function cssEscape(value: string): string {
  // In browsers CSS.escape exists; in Node we apply a basic replacement.
  return value.replace(/([^\w-])/g, '\\$1');
}

/**
 * Detects all interactive form fields on the current page.
 *
 * @param page - Playwright `Page` instance pointing to the target URL.
 * @returns A list of `DetectedField` objects, one per discovered field.
 */
export async function detectFormFields(page: Page): Promise<DetectedField[]> {
  const rawFields: RawFieldData[] = await page.evaluate(() => {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>('input, select, textarea'),
    );

    function getXPath(el: Element): string {
      if (el.id) return `//*[@id="${el.id}"]`;
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && node.nodeType === Node.ELEMENT_NODE) {
        let index = 1;
        let sibling = node.previousElementSibling;
        while (sibling) {
          if (sibling.nodeName === node.nodeName) index++;
          sibling = sibling.previousElementSibling;
        }
        parts.unshift(`${node.nodeName.toLowerCase()}[${index}]`);
        node = node.parentElement;
      }
      return `/${parts.join('/')}`;
    }

    function findLabelText(el: HTMLElement): string | null {
      // 1. aria-label attribute
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel.trim();

      // 2. aria-labelledby
      const labelledById = el.getAttribute('aria-labelledby');
      if (labelledById) {
        const labelEl = document.getElementById(labelledById);
        if (labelEl) return labelEl.textContent?.trim() ?? null;
      }

      // 3. <label for="id">
      if (el.id) {
        const label = document.querySelector<HTMLLabelElement>(
          `label[for="${el.id}"]`,
        );
        if (label) return label.textContent?.trim() ?? null;
      }

      // 4. Wrapping <label>
      const wrappingLabel = el.closest('label');
      if (wrappingLabel) {
        const clone = wrappingLabel.cloneNode(true) as HTMLElement;
        const input = clone.querySelector('input, select, textarea');
        if (input) input.remove();
        return clone.textContent?.trim() ?? null;
      }

      return null;
    }

    return elements.map((el) => {
      const tag = el.tagName;
      const input = el as HTMLInputElement;
      const select = el as HTMLSelectElement;

      const options: string[] =
        tag === 'SELECT'
          ? Array.from(select.options).map((o) => o.value)
          : tag === 'INPUT' && input.type === 'radio'
            ? [] // radio options gathered separately by name group
            : [];

      return {
        tagName: tag,
        type: (input as HTMLInputElement).type ?? '',
        name: el.getAttribute('name'),
        id: el.getAttribute('id'),
        placeholder: el.getAttribute('placeholder'),
        required: (input as HTMLInputElement).required ?? false,
        disabled: (input as HTMLInputElement).disabled ?? false,
        readOnly: (input as HTMLInputElement).readOnly ?? false,
        options,
        maxLength: (input as HTMLInputElement).maxLength ?? -1,
        minLength: (input as HTMLInputElement).minLength ?? -1,
        pattern: el.getAttribute('pattern'),
        min: el.getAttribute('min'),
        max: el.getAttribute('max'),
        labelText: findLabelText(el),
        xpath: getXPath(el),
      } satisfies {
        tagName: string;
        type: string;
        name: string | null;
        id: string | null;
        placeholder: string | null;
        required: boolean;
        disabled: boolean;
        readOnly: boolean;
        options: string[];
        maxLength: number;
        minLength: number;
        pattern: string | null;
        min: string | null;
        max: string | null;
        labelText: string | null;
        xpath: string;
      };
    });
  });

  return rawFields.map((raw) => {
    const type = resolveFieldType(raw);
    const selector = raw.id
      ? `#${cssEscape(raw.id)}`
      : raw.name
        ? `${raw.tagName.toLowerCase()}[name="${raw.name}"]`
        : raw.xpath;

    const field: DetectedField = {
      type,
      selector,
      name: raw.name,
      id: raw.id,
      label: raw.labelText,
      placeholder: raw.placeholder,
      required: raw.required,
      disabled: raw.disabled,
      readOnly: raw.readOnly,
    };

    if (raw.options.length > 0) field.options = raw.options;
    if (raw.maxLength > 0) field.maxLength = raw.maxLength;
    if (raw.minLength > 0) field.minLength = raw.minLength;
    if (raw.pattern) field.pattern = raw.pattern;
    if (raw.min) field.min = raw.min;
    if (raw.max) field.max = raw.max;

    return field;
  });
}

/**
 * Filters fields to only those that are interactable (not hidden, disabled, or read-only).
 */
export function filterInteractableFields(fields: DetectedField[]): DetectedField[] {
  return fields.filter(
    (f) =>
      !f.disabled &&
      !f.readOnly &&
      f.type !== FieldType.HIDDEN &&
      f.type !== FieldType.SUBMIT &&
      f.type !== FieldType.BUTTON &&
      f.type !== FieldType.RESET,
  );
}

/**
 * Groups radio button fields by their `name` attribute.
 */
export function groupRadioFields(
  fields: DetectedField[],
): Map<string, DetectedField[]> {
  const groups = new Map<string, DetectedField[]>();
  for (const field of fields) {
    if (field.type !== FieldType.RADIO || !field.name) continue;
    const existing = groups.get(field.name) ?? [];
    existing.push(field);
    groups.set(field.name, existing);
  }
  return groups;
}
