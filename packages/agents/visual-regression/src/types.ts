/**
 * Viewport dimensions and identifier for screenshot capture.
 */
export interface Viewport {
  /** Viewport width in pixels. */
  width: number;
  /** Viewport height in pixels. */
  height: number;
  /** Human-readable name used in storage keys and reports. */
  name: string;
}

/**
 * Built-in responsive breakpoints supported by the visual regression agent.
 */
export const VIEWPORTS: Readonly<Record<string, Viewport>> = {
  mobile: { width: 375, height: 812, name: 'mobile' },
  tablet: { width: 768, height: 1024, name: 'tablet' },
  desktop: { width: 1440, height: 900, name: 'desktop' },
  xl: { width: 1920, height: 1080, name: 'xl' },
} as const;

/**
 * Unique composite key that identifies a baseline image in S3.
 * Storage path: {project}/{page}/{viewport}[/{element}].png
 */
export interface BaselineKey {
  /** Project/tenant slug (e.g. "semkiest"). */
  project: string;
  /** Page slug derived from the URL path (e.g. "dashboard"). */
  page: string;
  /** Viewport name from VIEWPORTS (e.g. "desktop"). */
  viewport: string;
  /** Optional CSS selector for element-level baselines. */
  element?: string;
}

/**
 * Review status of a stored baseline image.
 */
export type BaselineStatus = 'pending' | 'approved' | 'rejected';

/**
 * A stored baseline image and its metadata.
 */
export interface Baseline {
  key: BaselineKey;
  /** Full S3 object key for the current approved image. */
  s3Key: string;
  /** S3 bucket where the image resides. */
  s3Bucket: string;
  status: BaselineStatus;
  /** Monotonically increasing version counter. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
  /** MD5/SHA-256 hex checksum of the image bytes. */
  checksum: string;
}

/**
 * One entry in the baseline version history log.
 */
export interface BaselineVersion {
  version: number;
  /** S3 object key for this historical snapshot. */
  s3Key: string;
  createdAt: Date;
  checksum: string;
}

/**
 * Options controlling how a single screenshot is taken.
 */
export interface ScreenshotOptions {
  /** Fully qualified URL to open in the browser. */
  url: string;
  /** Viewport to apply before capturing. */
  viewport: Viewport;
  /** Capture the entire scrollable page height. Defaults to true. */
  fullPage?: boolean;
  /** CSS selector to screenshot a specific element instead of the page. */
  selector?: string;
  /** Wait for this selector to appear before capturing. */
  waitForSelector?: string;
  /** Additional wait in ms after page load before capturing. */
  waitForTimeout?: number;
}

/**
 * A single page entry from an Explorer Agent sitemap.
 */
export interface SitemapPage {
  /** Fully qualified URL. */
  url: string;
  /** Human-readable page name used as the baseline key page segment. */
  name: string;
  /** CSS selectors for element-level captures on this page. */
  selectors?: string[];
}

/**
 * Sitemap output from Explorer Agent (SEM-55).
 */
export interface Sitemap {
  /** Project slug. */
  project: string;
  /** Base URL of the site under test. */
  baseUrl: string;
  pages: SitemapPage[];
}

/**
 * Per-page capture options for bulk operations.
 */
export interface CaptureOptions {
  /** Viewports to capture. Defaults to all VIEWPORTS. */
  viewports?: Viewport[];
  /** Whether to capture full page height. Defaults to true. */
  fullPage?: boolean;
  /** Additional CSS selectors for element-level capture. */
  selectors?: string[];
  /** Selector to wait for before capturing. */
  waitForSelector?: string;
  /** Extra delay in ms before capturing. */
  waitForTimeout?: number;
}

/**
 * Screenshot taken during a capture pass.
 */
export interface CaptureResult {
  url: string;
  /** Page name (used as the baseline key page segment). */
  page: string;
  viewport: Viewport;
  /** Raw PNG image bytes. */
  screenshot: Buffer;
  /** Set when this is an element-level capture. */
  element?: string;
  capturedAt: Date;
}

/**
 * Input payload for VisualRegressionAgent.execute().
 */
export interface VisualRegressionInput {
  /** Project slug. */
  project: string;
  /**
   * Sitemap from Explorer Agent.
   * If omitted, `pages` must be provided.
   */
  sitemap?: Sitemap;
  /**
   * Explicit page list.
   * Used when sitemap integration is not available.
   */
  pages?: SitemapPage[];
  captureOptions?: CaptureOptions;
  /**
   * - `capture`: Take screenshots without modifying baselines.
   * - `create-baselines`: Create new baseline entries (fail if already exist).
   * - `update-baselines`: Upsert baselines (create or overwrite with pending status).
   */
  operation?: 'capture' | 'create-baselines' | 'update-baselines';
}

/**
 * Result produced by VisualRegressionAgent.execute().
 */
export interface VisualRegressionOutput {
  project: string;
  capturedPages: number;
  baselines: Baseline[];
  errors: string[];
}

/**
 * S3/MinIO connection configuration for BaselineManager.
 */
export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Custom endpoint for MinIO or other S3-compatible services. */
  endpoint?: string;
  /** Required for MinIO; use path-style URLs. */
  forcePathStyle?: boolean;
  /** Optional CDN base URL for public asset serving. */
  publicUrl?: string;
}
