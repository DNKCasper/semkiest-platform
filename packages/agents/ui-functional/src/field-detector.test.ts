import {
  FieldType,
  filterInteractableFields,
  groupRadioFields,
  DetectedField,
} from './field-detector';

// ---------------------------------------------------------------------------
// filterInteractableFields
// ---------------------------------------------------------------------------

describe('filterInteractableFields', () => {
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

  it('includes a standard text input', () => {
    const fields = [makeField({ type: FieldType.TEXT })];
    expect(filterInteractableFields(fields)).toHaveLength(1);
  });

  it('excludes disabled fields', () => {
    const fields = [makeField({ disabled: true })];
    expect(filterInteractableFields(fields)).toHaveLength(0);
  });

  it('excludes read-only fields', () => {
    const fields = [makeField({ readOnly: true })];
    expect(filterInteractableFields(fields)).toHaveLength(0);
  });

  it('excludes hidden fields', () => {
    const fields = [makeField({ type: FieldType.HIDDEN })];
    expect(filterInteractableFields(fields)).toHaveLength(0);
  });

  it('excludes submit buttons', () => {
    const fields = [makeField({ type: FieldType.SUBMIT })];
    expect(filterInteractableFields(fields)).toHaveLength(0);
  });

  it('excludes button elements', () => {
    const fields = [makeField({ type: FieldType.BUTTON })];
    expect(filterInteractableFields(fields)).toHaveLength(0);
  });

  it('excludes reset buttons', () => {
    const fields = [makeField({ type: FieldType.RESET })];
    expect(filterInteractableFields(fields)).toHaveLength(0);
  });

  it('includes email, select, textarea, checkbox, and radio', () => {
    const fields = [
      makeField({ type: FieldType.EMAIL }),
      makeField({ type: FieldType.SELECT }),
      makeField({ type: FieldType.TEXTAREA }),
      makeField({ type: FieldType.CHECKBOX }),
      makeField({ type: FieldType.RADIO }),
    ];
    expect(filterInteractableFields(fields)).toHaveLength(5);
  });

  it('returns empty array when given an empty array', () => {
    expect(filterInteractableFields([])).toEqual([]);
  });

  it('keeps interactable and filters non-interactable in a mixed set', () => {
    const fields = [
      makeField({ type: FieldType.TEXT, id: 'a' }),
      makeField({ type: FieldType.HIDDEN, id: 'b' }),
      makeField({ type: FieldType.EMAIL, id: 'c', disabled: true }),
      makeField({ type: FieldType.TEXTAREA, id: 'd' }),
    ];
    const result = filterInteractableFields(fields);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.id)).toEqual(['a', 'd']);
  });
});

// ---------------------------------------------------------------------------
// groupRadioFields
// ---------------------------------------------------------------------------

describe('groupRadioFields', () => {
  function radioField(name: string, id: string): DetectedField {
    return {
      type: FieldType.RADIO,
      selector: `#${id}`,
      name,
      id,
      label: null,
      placeholder: null,
      required: false,
      disabled: false,
      readOnly: false,
    };
  }

  it('groups radio buttons by name', () => {
    const fields = [
      radioField('gender', 'gender-male'),
      radioField('gender', 'gender-female'),
      radioField('plan', 'plan-free'),
    ];
    const groups = groupRadioFields(fields);
    expect(groups.size).toBe(2);
    expect(groups.get('gender')).toHaveLength(2);
    expect(groups.get('plan')).toHaveLength(1);
  });

  it('ignores non-radio fields', () => {
    const fields: DetectedField[] = [
      {
        type: FieldType.TEXT,
        selector: '#t',
        name: 'text',
        id: 't',
        label: null,
        placeholder: null,
        required: false,
        disabled: false,
        readOnly: false,
      },
      radioField('choice', 'choice-a'),
    ];
    const groups = groupRadioFields(fields);
    expect(groups.size).toBe(1);
    expect(groups.has('choice')).toBe(true);
    expect(groups.has('text')).toBe(false);
  });

  it('ignores radio fields without a name attribute', () => {
    const field: DetectedField = {
      type: FieldType.RADIO,
      selector: '#anon',
      name: null,
      id: 'anon',
      label: null,
      placeholder: null,
      required: false,
      disabled: false,
      readOnly: false,
    };
    const groups = groupRadioFields([field]);
    expect(groups.size).toBe(0);
  });

  it('returns empty map for empty input', () => {
    expect(groupRadioFields([])).toEqual(new Map());
  });
});

// ---------------------------------------------------------------------------
// FieldType enum sanity checks
// ---------------------------------------------------------------------------

describe('FieldType enum', () => {
  it('contains expected members', () => {
    expect(FieldType.TEXT).toBe('text');
    expect(FieldType.EMAIL).toBe('email');
    expect(FieldType.PASSWORD).toBe('password');
    expect(FieldType.SELECT).toBe('select');
    expect(FieldType.TEXTAREA).toBe('textarea');
    expect(FieldType.CHECKBOX).toBe('checkbox');
    expect(FieldType.RADIO).toBe('radio');
    expect(FieldType.HIDDEN).toBe('hidden');
    expect(FieldType.SUBMIT).toBe('submit');
    expect(FieldType.FILE).toBe('file');
  });
});
