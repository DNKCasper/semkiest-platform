import ExcelJS from 'exceljs';
import { buildRunReportWorkbook } from './run-report';
import type { TestRunReport } from '../../types/reports';

const baseReport: TestRunReport = {
  id: 'run-abc',
  projectId: 'proj-xyz',
  projectName: 'My Project',
  runName: 'Nightly CI',
  environment: 'production',
  startedAt: new Date('2024-03-15T08:00:00Z'),
  completedAt: new Date('2024-03-15T08:03:45Z'),
  totalTests: 7,
  passedTests: 5,
  failedTests: 1,
  skippedTests: 1,
  results: [
    { id: 'r1', name: 'Homepage loads', category: 'ui', status: 'passed', duration: 200 },
    { id: 'r2', name: 'Login flow', category: 'functional', status: 'passed', duration: 350 },
    { id: 'r3', name: 'Screenshot diff', category: 'visual', status: 'failed', duration: 900, error: 'pixel diff 2%', severity: 'medium' },
    { id: 'r4', name: 'Page load time', category: 'performance', status: 'passed', duration: 1200 },
    { id: 'r5', name: 'Contrast check', category: 'accessibility', status: 'passed', duration: 80 },
    { id: 'r6', name: 'OWASP XSS check', category: 'security', status: 'skipped', duration: 0 },
    { id: 'r7', name: 'GET /health', category: 'api', status: 'passed', duration: 55 },
  ],
};

describe('buildRunReportWorkbook', () => {
  let workbook: ExcelJS.Workbook;

  beforeEach(() => {
    workbook = buildRunReportWorkbook(baseReport);
  });

  it('returns an ExcelJS Workbook instance', () => {
    expect(workbook).toBeInstanceOf(ExcelJS.Workbook);
  });

  it('creates exactly 7 worksheets', () => {
    expect(workbook.worksheets).toHaveLength(7);
  });

  it('names the first sheet "Summary"', () => {
    expect(workbook.worksheets[0].name).toBe('Summary');
  });

  it('includes a "UI & Functional" sheet', () => {
    const names = workbook.worksheets.map((s) => s.name);
    expect(names).toContain('UI & Functional');
  });

  it('includes a "Visual" sheet', () => {
    const names = workbook.worksheets.map((s) => s.name);
    expect(names).toContain('Visual');
  });

  it('includes a "Performance" sheet', () => {
    const names = workbook.worksheets.map((s) => s.name);
    expect(names).toContain('Performance');
  });

  it('includes an "Accessibility" sheet', () => {
    const names = workbook.worksheets.map((s) => s.name);
    expect(names).toContain('Accessibility');
  });

  it('includes a "Security" sheet', () => {
    const names = workbook.worksheets.map((s) => s.name);
    expect(names).toContain('Security');
  });

  it('includes an "API" sheet', () => {
    const names = workbook.worksheets.map((s) => s.name);
    expect(names).toContain('API');
  });

  it('sets the workbook creator', () => {
    expect(workbook.creator).toBe('SemkiEst Platform');
  });

  it('uses a custom creator when provided via options', () => {
    const wb = buildRunReportWorkbook(baseReport, { creator: 'Acme Corp' });
    expect(wb.creator).toBe('Acme Corp');
  });

  it('writes the run name into the Summary title cell', () => {
    const summarySheet = workbook.getWorksheet('Summary');
    expect(summarySheet).toBeDefined();
    const titleCell = summarySheet!.getCell('A1');
    expect(String(titleCell.value)).toContain(baseReport.runName);
  });

  it('Summary sheet has more than 10 rows for a typical report', () => {
    const summarySheet = workbook.getWorksheet('Summary');
    expect(summarySheet!.lastRow?.number).toBeGreaterThan(10);
  });

  it('handles an empty results array without throwing', () => {
    const emptyReport: TestRunReport = { ...baseReport, results: [], totalTests: 0, passedTests: 0, failedTests: 0, skippedTests: 0 };
    expect(() => buildRunReportWorkbook(emptyReport)).not.toThrow();
  });

  it('enables print layout when includePrintLayout is true', () => {
    const wb = buildRunReportWorkbook(baseReport, { includePrintLayout: true });
    const summarySheet = wb.getWorksheet('Summary');
    // With print layout, pageSetup is defined
    expect(summarySheet?.pageSetup).toBeDefined();
  });
});
