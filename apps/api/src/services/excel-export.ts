/**
 * Core Excel export service.
 *
 * Orchestrates workbook creation and delegates sheet population to the
 * template modules.  Supports streaming so large files never fully
 * materialise in memory before being sent to the client.
 */
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import type {
  TestRunReport,
  ProjectSummaryReport,
  OrganizationReport,
  ExcelExportOptions,
} from '../types/reports';
import { buildRunReportWorkbook } from './templates/run-report';
import { buildProjectReportWorkbook } from './templates/project-report';

/** MIME type for Excel 2007+ files. */
export const EXCEL_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Build the Content-Disposition header value for a file download.
 *
 * @param filename - The suggested file name (without extension).
 * @returns A `Content-Disposition` header value string.
 */
export function buildContentDisposition(filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
  return `attachment; filename="${safe}.xlsx"`;
}

/**
 * Format an ISO timestamp suffix suitable for file names.
 *
 * @param date - The date to format (defaults to now).
 * @returns A string like `20240315_143022`.
 */
export function buildTimestampSuffix(date: Date = new Date()): string {
  return date
    .toISOString()
    .replace(/[-:T]/g, (m) => (m === 'T' ? '_' : ''))
    .slice(0, 15);
}

/**
 * Stream a completed workbook directly to an Express response.
 *
 * Sets the correct `Content-Type` and `Content-Disposition` headers, then
 * pipes the workbook bytes through the response stream so the file never
 * accumulates entirely in heap memory.
 *
 * @param workbook  - The ExcelJS workbook to stream.
 * @param filename  - Base file name (without `.xlsx`).
 * @param res       - The Express response object.
 */
export async function streamWorkbookToResponse(
  workbook: ExcelJS.Workbook,
  filename: string,
  res: Response,
): Promise<void> {
  res.setHeader('Content-Type', EXCEL_MIME_TYPE);
  res.setHeader('Content-Disposition', buildContentDisposition(filename));
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  await workbook.xlsx.write(res);
  res.end();
}

/**
 * Generate and stream an Excel report for a single test run.
 *
 * File name pattern: `run-report_<runId>_<timestamp>.xlsx`
 *
 * @param report  - The test run report data.
 * @param res     - The Express response object.
 * @param options - Optional formatting / metadata overrides.
 */
export async function exportRunReport(
  report: TestRunReport,
  res: Response,
  options: ExcelExportOptions = {},
): Promise<void> {
  const workbook = buildRunReportWorkbook(report, options);
  const timestamp = buildTimestampSuffix(report.startedAt);
  const filename = `run-report_${report.id}_${timestamp}`;
  await streamWorkbookToResponse(workbook, filename, res);
}

/**
 * Generate and stream an Excel report for a project summary.
 *
 * File name pattern: `project-report_<projectId>_<timestamp>.xlsx`
 *
 * @param report  - The project summary report data.
 * @param res     - The Express response object.
 * @param options - Optional formatting / metadata overrides.
 */
export async function exportProjectReport(
  report: ProjectSummaryReport,
  res: Response,
  options: ExcelExportOptions = {},
): Promise<void> {
  const workbook = buildProjectReportWorkbook(report, options);
  const timestamp = buildTimestampSuffix(report.period.from);
  const filename = `project-report_${report.projectId}_${timestamp}`;
  await streamWorkbookToResponse(workbook, filename, res);
}

/**
 * Generate and stream an organisation-wide comparison Excel report.
 *
 * Reuses `buildProjectReportWorkbook` with an adapter that wraps the
 * organisation data into a project-compatible structure for each project,
 * then adds a cross-project comparison sheet.
 *
 * File name pattern: `org-report_<orgId>_<timestamp>.xlsx`
 *
 * @param report  - The organisation report data.
 * @param res     - The Express response object.
 * @param options - Optional formatting / metadata overrides.
 */
export async function exportOrganizationReport(
  report: OrganizationReport,
  res: Response,
  options: ExcelExportOptions = {},
): Promise<void> {
  const workbook = buildOrganizationWorkbook(report, options);
  const timestamp = buildTimestampSuffix(report.period.from);
  const filename = `org-report_${report.organizationId}_${timestamp}`;
  await streamWorkbookToResponse(workbook, filename, res);
}

/**
 * Build the workbook for an organisation-wide report.
 *
 * Creates a single cross-project comparison sheet with summary metrics for
 * every project in the organisation.
 */
function buildOrganizationWorkbook(
  report: OrganizationReport,
  options: ExcelExportOptions,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = options.creator ?? 'SemkiEst Platform';
  workbook.created = new Date();
  workbook.modified = new Date();

  addOrganizationSummarySheet(workbook, report, options);
  addProjectComparisonSheet(workbook, report);

  return workbook;
}

/** Palette used across organisation-level sheets. */
const ORG_COLORS = {
  titleBg: 'FF1F3864',
  titleFg: 'FFFFFFFF',
  headerBg: 'FF4472C4',
  headerFg: 'FFFFFFFF',
  subheaderBg: 'FFD6E4F7',
  altRowBg: 'FFF2F7FD',
  passed: 'FF70AD47',
  failed: 'FFED7D31',
  border: 'FFBDD7EE',
  improving: 'FF70AD47',
  stable: 'FFFFC000',
  degrading: 'FFED7D31',
} as const;

function addOrganizationSummarySheet(
  workbook: ExcelJS.Workbook,
  report: OrganizationReport,
  options: ExcelExportOptions,
): void {
  const sheet = workbook.addWorksheet('Summary', {
    pageSetup: options.includePrintLayout
      ? { fitToPage: true, fitToWidth: 1, orientation: 'landscape' }
      : undefined,
  });

  sheet.columns = [
    { width: 28 },
    { width: 22 },
    { width: 18 },
  ];

  // Title
  sheet.mergeCells('A1:C1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `Organisation Report — ${report.organizationName}`;
  titleCell.font = { bold: true, size: 16, color: { argb: ORG_COLORS.titleFg } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORG_COLORS.titleBg } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 32;

  // Period subtitle
  sheet.mergeCells('A2:C2');
  const periodCell = sheet.getCell('A2');
  periodCell.value = `Period: ${report.period.from.toLocaleDateString()} – ${report.period.to.toLocaleDateString()}`;
  periodCell.font = { italic: true, size: 11, color: { argb: '88000000' } };
  periodCell.alignment = { horizontal: 'center' };

  sheet.addRow([]);

  // KPI row headers
  const kpiHeaders = ['Metric', 'Value'];
  const headerRow = sheet.addRow(kpiHeaders);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: ORG_COLORS.headerFg } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORG_COLORS.headerBg } };
    cell.alignment = { horizontal: 'center' };
    setBorder(cell);
  });

  const kpis: [string, string | number][] = [
    ['Total Projects', report.totalProjects],
    ['Total Runs', report.totalRuns],
    ['Total Tests', report.totalTests],
    ['Overall Pass Rate', formatPercent(report.overallPassRate)],
  ];

  kpis.forEach(([label, value], i) => {
    const row = sheet.addRow([label, value]);
    row.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : ORG_COLORS.altRowBg },
      };
      setBorder(cell);
    });
  });
}

function addProjectComparisonSheet(
  workbook: ExcelJS.Workbook,
  report: OrganizationReport,
): void {
  const sheet = workbook.addWorksheet('Project Comparison');

  sheet.columns = [
    { header: 'Project', width: 28 },
    { header: 'Total Runs', width: 14 },
    { header: 'Total Tests', width: 14 },
    { header: 'Pass Rate', width: 14 },
    { header: 'Avg Duration (s)', width: 18 },
    { header: 'Trend', width: 14 },
    { header: 'Last Run', width: 20 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: ORG_COLORS.headerFg } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORG_COLORS.headerBg } };
    cell.alignment = { horizontal: 'center' };
    setBorder(cell);
  });

  report.projects.forEach((project, i) => {
    const row = sheet.addRow([
      project.projectName,
      project.totalRuns,
      project.totalTests,
      formatPercent(project.avgPassRate),
      (project.avgDuration / 1000).toFixed(1),
      project.trend.charAt(0).toUpperCase() + project.trend.slice(1),
      project.lastRunAt?.toLocaleDateString() ?? 'N/A',
    ]);

    const bgColor = i % 2 === 0 ? 'FFFFFFFF' : ORG_COLORS.altRowBg;
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      setBorder(cell);
    });

    // Colour the Trend cell
    const trendCell = row.getCell(6);
    const trendColor =
      project.trend === 'improving'
        ? ORG_COLORS.improving
        : project.trend === 'degrading'
          ? ORG_COLORS.degrading
          : ORG_COLORS.stable;
    trendCell.font = { bold: true, color: { argb: trendColor } };

    // Colour the Pass Rate cell based on value
    const passRateCell = row.getCell(4);
    passRateCell.font = {
      color: { argb: project.avgPassRate >= 0.8 ? ORG_COLORS.passed : ORG_COLORS.failed },
    };
  });

  // Auto-filter
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Apply a thin border to all four sides of a cell. */
export function setBorder(cell: ExcelJS.Cell): void {
  const thin: ExcelJS.Border = { style: 'thin', color: { argb: 'FFBDD7EE' } };
  cell.border = { top: thin, left: thin, bottom: thin, right: thin };
}

/** Format a decimal (0–1) as a percentage string, e.g. `"87.5%"`. */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
