import { formatTestResultComment, TestSuiteResult } from '../status-sync.js';

const baseSuiteResult: TestSuiteResult = {
  issueKey: 'SEM-42',
  suiteId: 'suite-abc',
  suiteStatus: 'passed',
  semProjectId: 'proj-1',
  completedAt: '2026-03-13T12:00:00.000Z',
  reportUrl: 'https://semkiest.example.com/reports/suite-abc',
  results: [
    { testId: 't1', testName: 'Login test', status: 'passed', durationMs: 200 },
    { testId: 't2', testName: 'Logout test', status: 'passed', durationMs: 150 },
  ],
};

describe('formatTestResultComment', () => {
  it('produces a valid ADF document', () => {
    const doc = formatTestResultComment(baseSuiteResult);
    expect(doc.version).toBe(1);
    expect(doc.type).toBe('doc');
    expect(Array.isArray(doc.content)).toBe(true);
    expect(doc.content.length).toBeGreaterThan(0);
  });

  it('includes passed status icon in heading paragraph', () => {
    const doc = formatTestResultComment(baseSuiteResult);
    const texts = doc.content
      .flatMap((node) => node.content ?? [])
      .map((n) => n.text ?? '')
      .join(' ');
    expect(texts).toContain('✅');
    expect(texts).toContain('PASSED');
  });

  it('includes failed tests section when failures exist', () => {
    const failResult: TestSuiteResult = {
      ...baseSuiteResult,
      suiteStatus: 'failed',
      results: [
        { testId: 't1', testName: 'Login test', status: 'failed', durationMs: 100, errorMessage: 'Element not found' },
      ],
    };
    const doc = formatTestResultComment(failResult);
    const allText = JSON.stringify(doc);
    expect(allText).toContain('Failed Tests');
    expect(allText).toContain('Element not found');
  });

  it('includes report URL when provided', () => {
    const doc = formatTestResultComment(baseSuiteResult);
    const allText = JSON.stringify(doc);
    expect(allText).toContain('https://semkiest.example.com/reports/suite-abc');
  });

  it('omits report URL section when not provided', () => {
    const noUrlResult = { ...baseSuiteResult, reportUrl: undefined };
    const doc = formatTestResultComment(noUrlResult);
    const allText = JSON.stringify(doc);
    expect(allText).not.toContain('Full report:');
  });
});
