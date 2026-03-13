import { BaseAgent } from '@semkiest/agent-base';
import { BaselineManager } from './baseline-manager.js';
import { ScreenshotCapture } from './screenshot-capture.js';
import type {
  Baseline,
  BaselineKey,
  CaptureResult,
  S3Config,
  Sitemap,
  SitemapPage,
  VisualRegressionInput,
  VisualRegressionOutput,
} from './types.js';
import { VIEWPORTS } from './types.js';

/**
 * Configuration for VisualRegressionAgent.
 */
export interface VisualRegressionAgentConfig {
  /** S3/MinIO storage configuration for baseline images. */
  s3: S3Config;
  /** Log level. Defaults to 'info'. */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Visual Regression Agent.
 *
 * Captures full-page and element-level screenshots using Playwright and
 * manages baseline images in S3/MinIO for regression testing.
 *
 * Supported operations:
 * - `capture` — Take screenshots and return raw results without persisting baselines.
 * - `create-baselines` — Create new baseline entries (fails if they already exist).
 * - `update-baselines` — Upsert baselines (create or overwrite, sets status to 'pending').
 *
 * Viewport support: mobile (375px), tablet (768px), desktop (1440px), XL (1920px).
 *
 * @example
 * ```ts
 * const agent = new VisualRegressionAgent({ s3: s3Config });
 * const result = await agent.run({
 *   project: 'semkiest',
 *   pages: [{ url: 'https://app.semkiest.com/dashboard', name: 'dashboard' }],
 *   operation: 'create-baselines',
 * });
 * ```
 */
export class VisualRegressionAgent extends BaseAgent<VisualRegressionInput, VisualRegressionOutput> {
  private readonly capture: ScreenshotCapture;
  private readonly baselineManager: BaselineManager;

  constructor(config: VisualRegressionAgentConfig) {
    super({ name: 'VisualRegressionAgent', logLevel: config.logLevel });
    this.capture = new ScreenshotCapture();
    this.baselineManager = new BaselineManager(config.s3);
  }

  /**
   * Executes the visual regression workflow.
   *
   * Resolves the page list (from sitemap or explicit pages), captures screenshots
   * across all configured viewports, and optionally manages baselines in S3.
   */
  async execute(input: VisualRegressionInput): Promise<VisualRegressionOutput> {
    const pages = this.resolvePages(input);
    if (pages.length === 0) {
      this.logger.warn('No pages to capture — provide sitemap or pages in input');
      return { project: input.project, capturedPages: 0, baselines: [], errors: [] };
    }

    const operation = input.operation ?? 'capture';
    const captureOptions = input.captureOptions ?? {};
    const viewports = captureOptions.viewports ?? Object.values(VIEWPORTS);

    this.logger.info(`Starting ${operation} for ${pages.length} page(s) across ${viewports.length} viewport(s)`, {
      project: input.project,
      pages: pages.map((p) => p.name),
      viewports: viewports.map((v) => v.name),
    });

    const captureResults = await this.capture.capturePages(pages, {
      ...captureOptions,
      viewports,
    });

    this.logger.info(`Captured ${captureResults.length} screenshot(s)`, {
      project: input.project,
    });

    if (operation === 'capture') {
      return {
        project: input.project,
        capturedPages: pages.length,
        baselines: [],
        errors: [],
      };
    }

    const { baselines, errors } = await this.processBaselines(
      input.project,
      captureResults,
      operation,
    );

    this.logger.info(`Processed ${baselines.length} baseline(s) with ${errors.length} error(s)`, {
      project: input.project,
    });

    return {
      project: input.project,
      capturedPages: pages.length,
      baselines,
      errors,
    };
  }

  /**
   * Captures screenshots for the given pages and returns raw results without
   * persisting anything. Useful for ad-hoc comparisons.
   *
   * @param sitemap - Sitemap describing the pages to capture.
   * @param viewports - Viewports to capture. Defaults to all built-in viewports.
   * @returns Flat list of capture results.
   */
  async captureFromSitemap(
    sitemap: Sitemap,
    viewports = Object.values(VIEWPORTS),
  ): Promise<CaptureResult[]> {
    this.logger.info(`Capturing ${sitemap.pages.length} page(s) from sitemap`, {
      project: sitemap.project,
      baseUrl: sitemap.baseUrl,
    });
    return this.capture.capturePages(sitemap.pages, { viewports });
  }

  /**
   * Captures screenshots for a single page across all configured viewports.
   *
   * @param page - Sitemap page entry.
   * @param viewports - Viewports to capture. Defaults to all built-in viewports.
   * @returns Capture results for each viewport.
   */
  async capturePage(
    page: SitemapPage,
    viewports = Object.values(VIEWPORTS),
  ): Promise<CaptureResult[]> {
    return this.capture.capturePages([page], { viewports });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  protected async initialize(): Promise<void> {
    await super.initialize();
    await this.capture.init();
    this.logger.debug('Browser initialized');
  }

  protected async cleanup(): Promise<void> {
    await this.capture.close();
    this.logger.debug('Browser closed');
    await super.cleanup();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private resolvePages(input: VisualRegressionInput): SitemapPage[] {
    if (input.sitemap !== undefined) {
      return input.sitemap.pages;
    }
    if (input.pages !== undefined) {
      return input.pages;
    }
    return [];
  }

  private async processBaselines(
    project: string,
    captureResults: CaptureResult[],
    operation: 'create-baselines' | 'update-baselines',
  ): Promise<{ baselines: Baseline[]; errors: string[] }> {
    const baselines: Baseline[] = [];
    const errors: string[] = [];

    for (const result of captureResults) {
      const key: BaselineKey = {
        project,
        page: result.page,
        viewport: result.viewport.name,
        element: result.element,
      };

      try {
        let baseline: Baseline;
        if (operation === 'create-baselines') {
          baseline = await this.baselineManager.createBaseline(key, result.screenshot);
        } else {
          baseline = await this.baselineManager.updateBaseline(key, result.screenshot);
        }
        baselines.push(baseline);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to process baseline for ${key.project}/${key.page}/${key.viewport}: ${message}`);
        this.logger.warn('Baseline processing failed', { key, error: message });
      }
    }

    return { baselines, errors };
  }
}
