/**
 * Export routes.
 *
 * Exposes two endpoints that stream Excel (.xlsx) files:
 *   GET /api/v1/runs/:id/export/excel    → test run report
 *   GET /api/v1/projects/:id/export/excel → project summary report
 *
 * Because actual database integration (SEM-20.1) is a declared dependency,
 * the data-fetching layer is abstracted behind `fetchRunReport` /
 * `fetchProjectReport` stubs so the service layer can be wired up once the
 * database package is ready without changing the route handlers.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { exportRunReport, exportProjectReport } from '../services/excel-export';
import type { TestRunReport, ProjectSummaryReport } from '../types/reports';

export const exportRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/runs/:id/export/excel
// ---------------------------------------------------------------------------

/**
 * @route   GET /api/v1/runs/:id/export/excel
 * @desc    Stream an Excel report for a single test run.
 * @param   id - The test run ID.
 * @returns An .xlsx file download.
 */
exportRouter.get(
  '/runs/:id/export/excel',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const report = await fetchRunReport(id);
      if (!report) {
        res.status(404).json({ error: 'Run not found', runId: id });
        return;
      }

      await exportRunReport(report, res);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/projects/:id/export/excel
// ---------------------------------------------------------------------------

/**
 * @route   GET /api/v1/projects/:id/export/excel
 * @desc    Stream an Excel project summary report.
 * @param   id   - The project ID.
 * @query   from - ISO date string for the start of the reporting period
 *                 (defaults to 30 days ago).
 * @query   to   - ISO date string for the end of the reporting period
 *                 (defaults to now).
 * @returns An .xlsx file download.
 */
exportRouter.get(
  '/projects/:id/export/excel',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const to = parseDate(req.query['to'] as string | undefined) ?? new Date();
      const from =
        parseDate(req.query['from'] as string | undefined) ??
        new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

      if (from > to) {
        res.status(400).json({ error: "'from' must be before 'to'" });
        return;
      }

      const report = await fetchProjectReport(id, from, to);
      if (!report) {
        res.status(404).json({ error: 'Project not found', projectId: id });
        return;
      }

      await exportProjectReport(report, res);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Data-fetching stubs
// ---------------------------------------------------------------------------
// These will be replaced with real Prisma queries once SEM-20.1 (Test Run
// Report Generation) is merged and the @semkiest/db package exposes the
// necessary models.

/**
 * Fetch a test run report by ID.
 *
 * @param id - The test run ID.
 * @returns The report data, or `null` if not found.
 */
async function fetchRunReport(id: string): Promise<TestRunReport | null> {
  // TODO(SEM-20.1): Replace with `db.testRun.findUnique({ where: { id }, include: { results: true } })`
  void id;
  return null;
}

/**
 * Fetch a project summary report for a given time period.
 *
 * @param projectId - The project ID.
 * @param from      - Period start date.
 * @param to        - Period end date.
 * @returns The report data, or `null` if not found.
 */
async function fetchProjectReport(
  projectId: string,
  from: Date,
  to: Date,
): Promise<ProjectSummaryReport | null> {
  // TODO(SEM-20.1): Replace with aggregation query against `db.testRun`
  void projectId;
  void from;
  void to;
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely parse an ISO date string, returning `undefined` on invalid input.
 */
function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
}
