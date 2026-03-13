import {
  buildContentDisposition,
  buildTimestampSuffix,
  formatPercent,
  setBorder,
  EXCEL_MIME_TYPE,
  streamWorkbookToResponse,
  exportRunReport,
  exportProjectReport,
} from './excel-export';
import ExcelJS from 'exceljs';
import type { TestRunReport, ProjectSummaryReport } from '../types/reports';
import type { Response } from 'express';

// ---------------------------------------------------------------------------
// buildContentDisposition
// ---------------------------------------------------------------------------
describe('buildContentDisposition', () => {
  it('wraps the filename with .xlsx extension', () => {
    expect(buildContentDisposition('my-report')).toBe(
      'attachment; filename="my-report.xlsx"',
    );
  });

  it('sanitises special characters', () => {
    const result = buildContentDisposition('report<>:"/\\|?*');
    expect(result).not.toMatch(/[<>:"/\\|?*]/);
    expect(result).toContain('attachment; filename=');
  });

  it('preserves alphanumeric characters and hyphens', () => {
    expect(buildContentDisposition('run-report_abc-123')).toBe(
      'attachment; filename="run-report_abc-123.xlsx"',
    );
  });
});

// ---------------------------------------------------------------------------
// buildTimestampSuffix
// ---------------------------------------------------------------------------
describe('buildTimestampSuffix', () => {
  it('returns a 15-character string in YYYYMMDD_HHmmss format', () => {
    const suffix = buildTimestampSuffix(new Date('2024-03-15T14:30:22.000Z'));
    expect(suffix).toHaveLength(15);
    expect(suffix).toMatch(/^\d{8}_\d{6}$/);
  });

  it('defaults to the current date when no date is provided', () => {
    const before = Date.now();
    const suffix = buildTimestampSuffix();
    const after = Date.now();
    // Rough check: year matches
    const year = new Date(before).getUTCFullYear().toString();
    expect(suffix.startsWith(year)).toBe(true);
    void after;
  });
});

// ---------------------------------------------------------------------------
// formatPercent
// ---------------------------------------------------------------------------
describe('formatPercent', () => {
  it('formats 0 as 0.0%', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('formats 1 as 100.0%', () => {
    expect(formatPercent(1)).toBe('100.0%');
  });

  it('formats 0.875 as 87.5%', () => {
    expect(formatPercent(0.875)).toBe('87.5%');
  });

  it('formats 0.333 with one decimal place', () => {
    expect(formatPercent(1 / 3)).toBe('33.3%');
  });
});

// ---------------------------------------------------------------------------
// setBorder
// ---------------------------------------------------------------------------
describe('setBorder', () => {
  it('applies thin borders to all four sides of a cell', () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Test');
    const cell = sheet.getCell('A1');
    setBorder(cell);
    expect(cell.border?.top?.style).toBe('thin');
    expect(cell.border?.left?.style).toBe('thin');
    expect(cell.border?.bottom?.style).toBe('thin');
    expect(cell.border?.right?.style).toBe('thin');
  });
});

// ---------------------------------------------------------------------------
// EXCEL_MIME_TYPE constant
// ---------------------------------------------------------------------------
describe('EXCEL_MIME_TYPE', () => {
  it('has the correct OOXML MIME type', () => {
    expect(EXCEL_MIME_TYPE).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });
});

// ---------------------------------------------------------------------------
// streamWorkbookToResponse
// ---------------------------------------------------------------------------
describe('streamWorkbookToResponse', () => {
  it('sets Content-Type, Content-Disposition headers and calls res.end()', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Sheet1');

    const headers: Record<string, string> = {};
    const res = {
      setHeader: jest.fn((key: string, value: string) => {
        headers[key] = value;
      }),
      end: jest.fn(),
      write: jest.fn(),
      // Minimal PassThrough-compatible interface for ExcelJS
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      writable: true,
    } as unknown as Response;

    // ExcelJS.xlsx.write actually writes bytes — mock it to avoid full write
    jest.spyOn(workbook.xlsx, 'write').mockResolvedValueOnce(undefined);

    await streamWorkbookToResponse(workbook, 'test-file', res);

    expect(headers['Content-Type']).toBe(EXCEL_MIME_TYPE);
    expect(headers['Content-Disposition']).toContain('test-file.xlsx');
    expect(res.end).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// exportRunReport (integration-level — workbook is built and streamed)
// ---------------------------------------------------------------------------
describe('exportRunReport', () => {
  const baseReport: TestRunReport = {
    id: 'run-001',
    projectId: 'proj-001',
    projectName: 'Test Project',
    runName: 'CI Run #42',
    environment: 'staging',
    startedAt: new Date('2024-03-15T10:00:00Z'),
    completedAt: new Date('2024-03-15T10:02:30Z'),
    totalTests: 3,
    passedTests: 2,
    failedTests: 1,
    skippedTests: 0,
    results: [
      {
        id: 'r1',
        name: 'Login page loads',
        category: 'ui',
        status: 'passed',
        duration: 450,
      },
      {
        id: 'r2',
        name: 'API health endpoint',
        category: 'api',
        status: 'failed',
        duration: 120,
        error: 'Timeout',
        severity: 'high',
      },
      {
        id: 'r3',
        name: 'Page contrast ratio',
        category: 'accessibility',
        status: 'passed',
        duration: 300,
        severity: 'low',
      },
    ],
  };

  it('sets correct response headers and ends the stream', async () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: jest.fn((k: string, v: string) => {
        headers[k] = v;
      }),
      end: jest.fn(),
    } as unknown as Response;

    // Intercept the actual xlsx write
    const mockWrite = jest.fn().mockResolvedValue(undefined);
    jest
      .spyOn(ExcelJS.Workbook.prototype.xlsx, 'write')
      .mockImplementationOnce(mockWrite);

    await exportRunReport(baseReport, res);

    expect(headers['Content-Type']).toBe(EXCEL_MIME_TYPE);
    expect(headers['Content-Disposition']).toContain('run-report_run-001_');
    expect(headers['Content-Disposition']).toContain('.xlsx');
    expect(mockWrite).toHaveBeenCalledWith(res);
    expect(res.end).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// exportProjectReport (integration-level)
// ---------------------------------------------------------------------------
describe('exportProjectReport', () => {
  const baseReport: ProjectSummaryReport = {
    projectId: 'proj-001',
    projectName: 'Test Project',
    period: {
      from: new Date('2024-02-01T00:00:00Z'),
      to: new Date('2024-03-01T00:00:00Z'),
    },
    metrics: {
      projectId: 'proj-001',
      projectName: 'Test Project',
      totalRuns: 5,
      avgPassRate: 0.9,
      totalTests: 100,
      passedTests: 90,
      failedTests: 10,
      avgDuration: 120000,
      lastRunAt: new Date('2024-03-01T00:00:00Z'),
      trend: 'improving',
    },
    runs: [
      {
        id: 'run-1',
        name: 'Run 1',
        startedAt: new Date('2024-02-10T10:00:00Z'),
        passRate: 0.88,
        totalTests: 20,
        environment: 'staging',
      },
    ],
    categoryBreakdown: {
      ui: { total: 20, passed: 18, failed: 2, skipped: 0 },
      functional: { total: 20, passed: 19, failed: 1, skipped: 0 },
      visual: { total: 10, passed: 9, failed: 1, skipped: 0 },
      performance: { total: 15, passed: 12, failed: 3, skipped: 0 },
      accessibility: { total: 15, passed: 14, failed: 1, skipped: 0 },
      security: { total: 10, passed: 10, failed: 0, skipped: 0 },
      api: { total: 10, passed: 8, failed: 2, skipped: 0 },
    },
    severityBreakdown: {
      critical: 1,
      high: 3,
      medium: 4,
      low: 2,
      info: 0,
    },
  };

  it('sets correct response headers and ends the stream', async () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: jest.fn((k: string, v: string) => {
        headers[k] = v;
      }),
      end: jest.fn(),
    } as unknown as Response;

    const mockWrite = jest.fn().mockResolvedValue(undefined);
    jest
      .spyOn(ExcelJS.Workbook.prototype.xlsx, 'write')
      .mockImplementationOnce(mockWrite);

    await exportProjectReport(baseReport, res);

    expect(headers['Content-Type']).toBe(EXCEL_MIME_TYPE);
    expect(headers['Content-Disposition']).toContain('project-report_proj-001_');
    expect(headers['Content-Disposition']).toContain('.xlsx');
    expect(mockWrite).toHaveBeenCalledWith(res);
    expect(res.end).toHaveBeenCalled();
  });
});
