import ExcelJS from 'exceljs';
import { buildProjectReportWorkbook } from './project-report';
import type { ProjectSummaryReport } from '../../types/reports';

const baseReport: ProjectSummaryReport = {
  projectId: 'proj-001',
  projectName: 'Acme Web',
  period: {
    from: new Date('2024-02-01T00:00:00Z'),
    to: new Date('2024-03-01T00:00:00Z'),
  },
  metrics: {
    projectId: 'proj-001',
    projectName: 'Acme Web',
    totalRuns: 10,
    avgPassRate: 0.85,
    totalTests: 200,
    passedTests: 170,
    failedTests: 30,
    avgDuration: 90000,
    lastRunAt: new Date('2024-02-28T12:00:00Z'),
    trend: 'improving',
  },
  runs: [
    {
      id: 'run-1',
      name: 'Run 1',
      startedAt: new Date('2024-02-05T10:00:00Z'),
      passRate: 0.8,
      totalTests: 20,
      environment: 'staging',
    },
    {
      id: 'run-2',
      name: 'Run 2',
      startedAt: new Date('2024-02-12T10:00:00Z'),
      passRate: 0.9,
      totalTests: 20,
      environment: 'production',
    },
  ],
  categoryBreakdown: {
    ui: { total: 40, passed: 36, failed: 4, skipped: 0 },
    functional: { total: 40, passed: 35, failed: 5, skipped: 0 },
    visual: { total: 20, passed: 18, failed: 2, skipped: 0 },
    performance: { total: 30, passed: 25, failed: 5, skipped: 0 },
    accessibility: { total: 30, passed: 28, failed: 2, skipped: 0 },
    security: { total: 20, passed: 18, failed: 2, skipped: 0 },
    api: { total: 20, passed: 10, failed: 10, skipped: 0 },
  },
  severityBreakdown: {
    critical: 2,
    high: 5,
    medium: 8,
    low: 10,
    info: 5,
  },
};

describe('buildProjectReportWorkbook', () => {
  let workbook: ExcelJS.Workbook;

  beforeEach(() => {
    workbook = buildProjectReportWorkbook(baseReport);
  });

  it('returns an ExcelJS Workbook instance', () => {
    expect(workbook).toBeInstanceOf(ExcelJS.Workbook);
  });

  it('creates exactly 4 worksheets', () => {
    expect(workbook.worksheets).toHaveLength(4);
  });

  it('names the worksheets correctly', () => {
    const names = workbook.worksheets.map((s) => s.name);
    expect(names).toEqual(['Summary', 'Run History', 'Category Breakdown', 'Severity Breakdown']);
  });

  it('sets the workbook creator', () => {
    expect(workbook.creator).toBe('SemkiEst Platform');
  });

  it('uses a custom creator when provided via options', () => {
    const wb = buildProjectReportWorkbook(baseReport, { creator: 'CI Bot' });
    expect(wb.creator).toBe('CI Bot');
  });

  it('writes the project name into the Summary title cell', () => {
    const sheet = workbook.getWorksheet('Summary');
    expect(sheet).toBeDefined();
    const titleCell = sheet!.getCell('A1');
    expect(String(titleCell.value)).toContain(baseReport.projectName);
  });

  it('Run History sheet contains one data row per run', () => {
    const sheet = workbook.getWorksheet('Run History');
    expect(sheet).toBeDefined();
    // 1 header row + 2 runs
    expect(sheet!.rowCount).toBe(1 + baseReport.runs.length);
  });

  it('Category Breakdown sheet contains a row for each category', () => {
    const sheet = workbook.getWorksheet('Category Breakdown');
    expect(sheet).toBeDefined();
    // 1 header row + 7 categories
    expect(sheet!.rowCount).toBe(1 + 7);
  });

  it('Severity Breakdown sheet contains a row for each severity plus a totals row', () => {
    const sheet = workbook.getWorksheet('Severity Breakdown');
    expect(sheet).toBeDefined();
    // 1 header + 5 severities + 1 totals row
    expect(sheet!.rowCount).toBe(1 + 5 + 1);
  });

  it('handles a report with no runs without throwing', () => {
    const emptyRunsReport: ProjectSummaryReport = { ...baseReport, runs: [] };
    expect(() => buildProjectReportWorkbook(emptyRunsReport)).not.toThrow();
  });

  it('enables print layout when includePrintLayout is true', () => {
    const wb = buildProjectReportWorkbook(baseReport, { includePrintLayout: true });
    const sheet = wb.getWorksheet('Summary');
    expect(sheet?.pageSetup).toBeDefined();
  });
});
