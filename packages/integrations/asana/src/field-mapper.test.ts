import { FieldMapper, SEVERITY_MAPPINGS } from './field-mapper';
import type { Severity } from './types';

const mapper = new FieldMapper();

describe('SEVERITY_MAPPINGS', () => {
  const severities: Severity[] = ['critical', 'high', 'medium', 'low'];

  it('has an entry for every severity level', () => {
    severities.forEach((s) => expect(SEVERITY_MAPPINGS[s]).toBeDefined());
  });

  it('maps critical → P0 with dark-red colour', () => {
    expect(SEVERITY_MAPPINGS.critical.priority).toBe('P0');
    expect(SEVERITY_MAPPINGS.critical.tagColor).toBe('dark-red');
  });

  it('maps high → P1 with dark-orange colour', () => {
    expect(SEVERITY_MAPPINGS.high.priority).toBe('P1');
    expect(SEVERITY_MAPPINGS.high.tagColor).toBe('dark-orange');
  });

  it('maps medium → P2 with light-yellow colour', () => {
    expect(SEVERITY_MAPPINGS.medium.priority).toBe('P2');
    expect(SEVERITY_MAPPINGS.medium.tagColor).toBe('light-yellow');
  });

  it('maps low → P3 with light-green colour', () => {
    expect(SEVERITY_MAPPINGS.low.priority).toBe('P3');
    expect(SEVERITY_MAPPINGS.low.tagColor).toBe('light-green');
  });
});

describe('FieldMapper.getSeverityMapping', () => {
  it('returns the correct mapping for each level', () => {
    const severities: Severity[] = ['critical', 'high', 'medium', 'low'];
    severities.forEach((s) => {
      expect(mapper.getSeverityMapping(s)).toStrictEqual(SEVERITY_MAPPINGS[s]);
    });
  });
});

describe('FieldMapper.formatTaskName', () => {
  it('prefixes with the priority code', () => {
    expect(mapper.formatTaskName('login fails', 'critical')).toBe(
      '[P0] Bug: login fails',
    );
    expect(mapper.formatTaskName('slow render', 'low')).toBe(
      '[P3] Bug: slow render',
    );
  });
});

describe('FieldMapper.formatTaskNotes', () => {
  const base = {
    testName: 'submit form',
    suiteName: 'CheckoutFlow',
    errorMessage: 'Expected 200, got 500',
    severity: 'high' as Severity,
    testRunId: 'run-001',
    timestamp: new Date('2024-01-15T10:00:00.000Z'),
  };

  it('includes all metadata fields', () => {
    const notes = mapper.formatTaskNotes(base);
    expect(notes).toContain('submit form');
    expect(notes).toContain('CheckoutFlow');
    expect(notes).toContain('Expected 200, got 500');
    expect(notes).toContain('HIGH');
    expect(notes).toContain('P1');
    expect(notes).toContain('run-001');
    expect(notes).toContain('2024-01-15T10:00:00.000Z');
  });

  it('includes the stack trace section when provided', () => {
    const notes = mapper.formatTaskNotes({
      ...base,
      stackTrace: 'at Object.<anonymous> (test.ts:42)',
    });
    expect(notes).toContain('Stack Trace');
    expect(notes).toContain('at Object.<anonymous> (test.ts:42)');
  });

  it('omits the stack trace section when not provided', () => {
    const notes = mapper.formatTaskNotes(base);
    expect(notes).not.toContain('Stack Trace');
  });

  it('includes the SemkiEst attribution header', () => {
    const notes = mapper.formatTaskNotes(base);
    expect(notes).toContain('SemkiEst');
  });
});
