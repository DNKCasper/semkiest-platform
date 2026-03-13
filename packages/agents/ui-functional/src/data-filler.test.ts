import {
  generateRandomValue,
  generateEdgeValue,
  autoFillForm,
  fillField,
  FillResult,
} from './data-filler';
import { DetectedField, FieldType } from './field-detector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeField(overrides: Partial<DetectedField>): DetectedField {
  return {
    type: FieldType.TEXT,
    selector: '#field',
    name: 'field',
    id: 'field',
    label: null,
    placeholder: null,
    required: false,
    disabled: false,
    readOnly: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateRandomValue
// ---------------------------------------------------------------------------

describe('generateRandomValue', () => {
  it('returns a non-empty string for TEXT field', () => {
    const value = generateRandomValue(makeField({ type: FieldType.TEXT }));
    expect(typeof value).toBe('string');
    expect(value.length).toBeGreaterThan(0);
  });

  it('returns a valid-looking email for EMAIL field', () => {
    const value = generateRandomValue(makeField({ type: FieldType.EMAIL }));
    expect(value).toMatch(/@/);
    expect(value).toMatch(/\./);
  });

  it('returns a non-empty password string for PASSWORD field', () => {
    const value = generateRandomValue(makeField({ type: FieldType.PASSWORD }));
    expect(value.length).toBeGreaterThan(7);
  });

  it('returns a numeric string for NUMBER field', () => {
    const value = generateRandomValue(makeField({ type: FieldType.NUMBER }));
    expect(Number.isNaN(Number(value))).toBe(false);
  });

  it('respects min/max for NUMBER field', () => {
    const field = makeField({ type: FieldType.NUMBER, min: '10', max: '10' });
    const value = generateRandomValue(field);
    expect(Number(value)).toBe(10);
  });

  it('returns a tel-like string for TEL field', () => {
    const value = generateRandomValue(makeField({ type: FieldType.TEL }));
    expect(value).toMatch(/^\+/);
  });

  it('returns a URL string for URL field', () => {
    const value = generateRandomValue(makeField({ type: FieldType.URL }));
    expect(value).toMatch(/^https?:\/\//);
  });

  it('returns an ISO date string for DATE field', () => {
    const value = generateRandomValue(makeField({ type: FieldType.DATE }));
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a datetime-local string for DATETIME_LOCAL field', () => {
    const value = generateRandomValue(
      makeField({ type: FieldType.DATETIME_LOCAL }),
    );
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('returns a HH:MM string for TIME field', () => {
    const value = generateRandomValue(makeField({ type: FieldType.TIME }));
    expect(value).toMatch(/^\d{2}:\d{2}$/);
  });

  it('returns a hex color for COLOR field', () => {
    const value = generateRandomValue(makeField({ type: FieldType.COLOR }));
    expect(value).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('returns a value within min/max for RANGE field', () => {
    const field = makeField({ type: FieldType.RANGE, min: '5', max: '5' });
    const value = generateRandomValue(field);
    expect(Number(value)).toBe(5);
  });

  it('returns one of the available options for SELECT field', () => {
    const field = makeField({
      type: FieldType.SELECT,
      options: ['', 'option1', 'option2'],
    });
    const value = generateRandomValue(field);
    expect(['option1', 'option2']).toContain(value);
  });

  it('returns "true" for CHECKBOX field', () => {
    const value = generateRandomValue(makeField({ type: FieldType.CHECKBOX }));
    expect(value).toBe('true');
  });

  it('returns "true" for RADIO field', () => {
    const value = generateRandomValue(makeField({ type: FieldType.RADIO }));
    expect(value).toBe('true');
  });

  it('returns text within maxLength for TEXTAREA', () => {
    const field = makeField({ type: FieldType.TEXTAREA, maxLength: 20 });
    const value = generateRandomValue(field);
    expect(value.length).toBeLessThanOrEqual(20);
  });

  it('returns text at least minLength for TEXT field', () => {
    const field = makeField({ type: FieldType.TEXT, minLength: 50 });
    const value = generateRandomValue(field);
    expect(value.length).toBeGreaterThanOrEqual(50);
  });
});

// ---------------------------------------------------------------------------
// generateEdgeValue
// ---------------------------------------------------------------------------

describe('generateEdgeValue', () => {
  const textField = makeField({ type: FieldType.TEXT });

  it('returns an empty string for variant "empty"', () => {
    expect(generateEdgeValue(textField, 'empty')).toBe('');
  });

  it('returns a long string for variant "long" (exceeds default)', () => {
    const value = generateEdgeValue(textField, 'long');
    expect(value.length).toBeGreaterThanOrEqual(5000);
  });

  it('exceeds maxLength + 10 for variant "long" when maxLength is set', () => {
    const field = makeField({ maxLength: 100 });
    const value = generateEdgeValue(field, 'long');
    expect(value.length).toBe(110);
  });

  it('returns a special-character string for TEXT field with variant "special"', () => {
    const value = generateEdgeValue(textField, 'special');
    expect(value.length).toBeGreaterThan(0);
    expect(value).toContain('@');
  });

  it('returns a non-numeric string for NUMBER field with variant "special"', () => {
    const field = makeField({ type: FieldType.NUMBER });
    const value = generateEdgeValue(field, 'special');
    expect(Number.isNaN(Number(value))).toBe(true);
  });

  it('returns a non-numeric string for DATE field with variant "special"', () => {
    const field = makeField({ type: FieldType.DATE });
    const value = generateEdgeValue(field, 'special');
    expect(value).toBe('abc!@#');
  });
});

// ---------------------------------------------------------------------------
// fillField (unit – mock Playwright locator)
// ---------------------------------------------------------------------------

function makePageMock(behavior: {
  fill?: jest.Mock;
  click?: jest.Mock;
  selectOption?: jest.Mock;
  isChecked?: jest.Mock;
  setInputFiles?: jest.Mock;
  first?: () => ReturnType<typeof makeLocatorMock>;
}) {
  return makeLocatorMock(behavior);
}

function makeLocatorMock(behavior: {
  fill?: jest.Mock;
  click?: jest.Mock;
  selectOption?: jest.Mock;
  isChecked?: jest.Mock;
  setInputFiles?: jest.Mock;
}) {
  const locatorInstance = {
    fill: behavior.fill ?? jest.fn().mockResolvedValue(undefined),
    click: behavior.click ?? jest.fn().mockResolvedValue(undefined),
    selectOption: behavior.selectOption ?? jest.fn().mockResolvedValue(undefined),
    isChecked: behavior.isChecked ?? jest.fn().mockResolvedValue(false),
    setInputFiles: behavior.setInputFiles ?? jest.fn().mockResolvedValue(undefined),
    first: jest.fn().mockReturnThis(),
  };

  const page = {
    locator: jest.fn().mockReturnValue(locatorInstance),
  } as unknown as import('@playwright/test').Page;

  return { page, locator: locatorInstance };
}

describe('fillField', () => {
  it('calls fill() for a TEXT field', async () => {
    const { page, locator } = makeLocatorMock({ fill: jest.fn().mockResolvedValue(undefined) });
    const field = makeField({ type: FieldType.TEXT, selector: '#name' });
    const result = await fillField(page, field, 'Alice');
    expect(locator.fill).toHaveBeenCalledWith('Alice');
    expect(result.success).toBe(true);
    expect(result.value).toBe('Alice');
  });

  it('calls fill() for an EMAIL field', async () => {
    const { page, locator } = makeLocatorMock({ fill: jest.fn().mockResolvedValue(undefined) });
    const field = makeField({ type: FieldType.EMAIL, selector: '#email' });
    const result = await fillField(page, field, 'test@example.com');
    expect(locator.fill).toHaveBeenCalledWith('test@example.com');
    expect(result.success).toBe(true);
  });

  it('calls selectOption() for a SELECT field', async () => {
    const { page, locator } = makeLocatorMock({
      selectOption: jest.fn().mockResolvedValue(undefined),
    });
    const field = makeField({ type: FieldType.SELECT, selector: '#role' });
    const result = await fillField(page, field, 'admin');
    expect(locator.selectOption).toHaveBeenCalledWith('admin');
    expect(result.success).toBe(true);
  });

  it('clicks a CHECKBOX when value is "true" and checkbox is unchecked', async () => {
    const { page, locator } = makeLocatorMock({
      isChecked: jest.fn().mockResolvedValue(false),
      click: jest.fn().mockResolvedValue(undefined),
    });
    const field = makeField({ type: FieldType.CHECKBOX, selector: '#agree' });
    const result = await fillField(page, field, 'true');
    expect(locator.click).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('does NOT click a CHECKBOX when already in desired state', async () => {
    const { page, locator } = makeLocatorMock({
      isChecked: jest.fn().mockResolvedValue(true),
      click: jest.fn().mockResolvedValue(undefined),
    });
    const field = makeField({ type: FieldType.CHECKBOX, selector: '#agree' });
    await fillField(page, field, 'true');
    expect(locator.click).not.toHaveBeenCalled();
  });

  it('clicks a RADIO field', async () => {
    const { page, locator } = makeLocatorMock({
      click: jest.fn().mockResolvedValue(undefined),
    });
    const field = makeField({ type: FieldType.RADIO, selector: '#opt-a' });
    const result = await fillField(page, field, 'true');
    expect(locator.click).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('returns success: false when locator throws', async () => {
    const { page } = makeLocatorMock({
      fill: jest.fn().mockRejectedValue(new Error('Element not found')),
    });
    const field = makeField({ type: FieldType.TEXT, selector: '#missing' });
    const result = await fillField(page, field, 'value');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Element not found');
  });
});

// ---------------------------------------------------------------------------
// autoFillForm
// ---------------------------------------------------------------------------

describe('autoFillForm', () => {
  function buildMockPage(fillFn = jest.fn().mockResolvedValue(undefined)) {
    const locatorInstance = {
      fill: fillFn,
      click: jest.fn().mockResolvedValue(undefined),
      selectOption: jest.fn().mockResolvedValue(undefined),
      isChecked: jest.fn().mockResolvedValue(false),
      setInputFiles: jest.fn().mockResolvedValue(undefined),
      first: jest.fn().mockReturnThis(),
    };
    return {
      page: {
        locator: jest.fn().mockReturnValue(locatorInstance),
      } as unknown as import('@playwright/test').Page,
      locator: locatorInstance,
    };
  }

  it('fills all interactable fields and skips non-interactable ones', async () => {
    const { page } = buildMockPage();
    const fields: DetectedField[] = [
      makeField({ type: FieldType.TEXT, selector: '#a', id: 'a', name: 'a' }),
      makeField({ type: FieldType.HIDDEN, selector: '#b', id: 'b', name: 'b' }),
      makeField({ type: FieldType.EMAIL, selector: '#c', id: 'c', name: 'c' }),
    ];

    const result: FillResult = await autoFillForm(page, fields);
    expect(result.filled).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.fieldResults).toHaveLength(2);
  });

  it('uses fixedValues when strategy is "fixed"', async () => {
    const fillFn = jest.fn().mockResolvedValue(undefined);
    const { page } = buildMockPage(fillFn);
    const fields: DetectedField[] = [
      makeField({ type: FieldType.TEXT, selector: '#name', id: 'name', name: 'name' }),
    ];

    await autoFillForm(page, fields, {
      strategy: 'fixed',
      fixedValues: { name: 'FixedValue' },
    });

    expect(fillFn).toHaveBeenCalledWith('FixedValue');
  });

  it('falls back to random when no fixed value provided for field', async () => {
    const fillFn = jest.fn().mockResolvedValue(undefined);
    const { page } = buildMockPage(fillFn);
    const fields: DetectedField[] = [
      makeField({ type: FieldType.EMAIL, selector: '#email', id: 'email', name: 'email' }),
    ];

    await autoFillForm(page, fields, {
      strategy: 'fixed',
      fixedValues: {},
    });

    // Should have been called with some value (random email)
    expect(fillFn).toHaveBeenCalledTimes(1);
    const calledWith: string = fillFn.mock.calls[0][0];
    expect(calledWith).toMatch(/@/);
  });

  it('returns filled:0 and skipped equal to field count when all fields are disabled', async () => {
    const { page } = buildMockPage();
    const fields: DetectedField[] = [
      makeField({ disabled: true, selector: '#d1', id: 'd1' }),
      makeField({ disabled: true, selector: '#d2', id: 'd2' }),
    ];

    const result = await autoFillForm(page, fields);
    expect(result.filled).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it('returns empty results for empty fields array', async () => {
    const { page } = buildMockPage();
    const result = await autoFillForm(page, []);
    expect(result.filled).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.fieldResults).toHaveLength(0);
  });
});
