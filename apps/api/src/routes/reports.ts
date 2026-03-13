import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  getOrGenerateReport,
  toSummaryOnly,
  ReportNotFoundError,
  ReportGenerationError,
} from '../services/report-generator';
import { reportQuerySchema } from '../types/report';

/** Data version for cache/consumer compatibility signalling. */
const REPORT_DATA_VERSION = '1.0.0';

const router = Router();

/**
 * GET /api/v1/runs/:id/report
 *
 * Returns a structured report for the specified test run.
 *
 * Query parameters:
 *   - level     'summary' | 'detailed'  (default: 'summary')
 *   - category  TestCategory            (optional filter)
 *   - testType  string                  (optional filter)
 *   - severity  Severity                (optional filter)
 *
 * Response shape: ReportResponse
 *
 * Errors:
 *   - 400 Invalid query parameters
 *   - 404 Run not found
 *   - 500 Report generation failure
 */
router.get(
  '/:id/report',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { id: runId } = req.params;

    // Validate query parameters via Zod.
    const queryResult = reportQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json({
        error: 'Invalid query parameters',
        details: queryResult.error.flatten().fieldErrors,
      });
      return;
    }

    const { level, category, testType, severity } = queryResult.data;

    const filters = {
      ...(category !== undefined ? { category } : {}),
      ...(testType !== undefined ? { testType } : {}),
      ...(severity !== undefined ? { severity } : {}),
    };

    try {
      const { report, fromCache } = await getOrGenerateReport(runId, {
        detailLevel: level,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
      });

      const data =
        level === 'summary' ? toSummaryOnly(report) : report;

      res.status(200).json({
        data,
        meta: {
          generatedAt: new Date().toISOString(),
          dataVersion: REPORT_DATA_VERSION,
          detailLevel: level,
          fromCache,
          filters,
        },
      });
    } catch (err) {
      if (err instanceof ReportNotFoundError) {
        res.status(404).json({
          error: 'Not Found',
          message: `Test run '${runId}' does not exist or has not been indexed yet.`,
        });
        return;
      }

      if (err instanceof ReportGenerationError) {
        res.status(500).json({
          error: 'Report Generation Failed',
          message: `Unable to generate report for run '${runId}'. Please try again later.`,
        });
        return;
      }

      next(err);
    }
  },
);

export default router;
