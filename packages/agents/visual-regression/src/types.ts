/**
 * Shared types for the Visual Regression Testing Agent.
 *
 * These types represent the data structures used across the approval workflow,
 * API routes, and UI components for visual regression testing.
 */

// ─── Enumerations ────────────────────────────────────────────────────────────

/** Visual display mode for the diff viewer. */
export type DiffViewMode = 'side-by-side' | 'overlay' | 'diff-highlight' | 'slider';

/** Lifecycle state of a visual baseline comparison. */
export type BaselineStatus = 'pending' | 'approved' | 'rejected' | 'auto-approved';

/** The type of action recorded in the approval history. */
export type ApprovalAction = 'approved' | 'rejected' | 'auto-approved';

// ─── Screenshot & Diff Data ───────────────────────────────────────────────────

/** Metadata for a single captured screenshot. */
export interface ScreenshotData {
  /** Storage URL (e.g. S3 presigned URL or CDN path). */
  url: string;
  width: number;
  height: number;
  capturedAt: string; // ISO 8601
}

/** Pixel-level comparison result produced by the diff engine (SEM-71). */
export interface DiffResult {
  /** Number of pixels that differ between baseline and actual. */
  diffPixels: number;
  /** Total number of pixels in the comparison area. */
  totalPixels: number;
  /** Percentage of differing pixels (0–100). */
  diffPercentage: number;
  /** Optional URL to the generated diff-highlight image. */
  diffImageUrl?: string;
}

// ─── Baseline Record ──────────────────────────────────────────────────────────

/** A visual baseline record as returned from the database. */
export interface VisualBaseline {
  id: string;
  projectId: string;
  componentName: string;
  viewport: string;
  version: string;

  baseline: ScreenshotData;
  actual?: ScreenshotData;
  diff?: DiffResult;

  status: BaselineStatus;
  /** Maximum diff percentage for auto-approval (0–100). Null disables auto-approval. */
  autoApproveThreshold: number | null;

  createdAt: string;
  updatedAt: string;
}

// ─── Diff Viewer Data ─────────────────────────────────────────────────────────

/**
 * Complete data structure for the diff viewer UI.
 * Supports side-by-side, overlay, diff-highlight, and slider view modes.
 */
export interface DiffViewerData {
  baselineId: string;
  componentName: string;
  viewport: string;
  version: string;

  baseline: ScreenshotData;
  actual: ScreenshotData;
  /** Pre-generated diff overlay image, when available. */
  diffOverlay?: ScreenshotData;
  diffResult: DiffResult;

  status: BaselineStatus;
  /** Supported view modes for this comparison. */
  availableViewModes: DiffViewMode[];
}

// ─── Approval History ─────────────────────────────────────────────────────────

/** An immutable record of a single approval or rejection action. */
export interface ApprovalRecord {
  id: string;
  baselineId: string;

  action: ApprovalAction;

  /** User ID, or "system" for automated approvals. */
  userId: string;
  userName?: string;

  /** Human-readable comment or rejection reason. */
  comment?: string;

  previousStatus: BaselineStatus;
  newStatus: BaselineStatus;

  /** Baseline version at the time of the action. */
  version: string;

  createdAt: string;
}

// ─── Input Payloads ───────────────────────────────────────────────────────────

/** Input for approving a single baseline. */
export interface ApproveBaselineInput {
  userId: string;
  userName?: string;
  comment?: string;
}

/** Input for rejecting a single baseline. */
export interface RejectBaselineInput {
  userId: string;
  userName?: string;
  /** Mandatory reason for rejection. */
  reason: string;
}

/** Input for batch approve or reject operations. */
export interface BatchApprovalInput {
  baselineIds: string[];
  action: 'approve' | 'reject';
  userId: string;
  userName?: string;
  /** Optional comment/reason applied to all items in the batch. */
  comment?: string;
}

/** Result of a single item within a batch operation. */
export interface BatchApprovalItemResult {
  baselineId: string;
  success: boolean;
  status?: BaselineStatus;
  error?: string;
}

/** Aggregated result of a batch approve/reject operation. */
export interface BatchApprovalResult {
  results: BatchApprovalItemResult[];
  successCount: number;
  failureCount: number;
}

// ─── Auto-Approval Configuration ─────────────────────────────────────────────

/** Project-level or global configuration for the auto-approval feature. */
export interface AutoApproveConfig {
  enabled: boolean;
  /** Max diff percentage (0–100) below which diffs are automatically approved. */
  threshold: number;
  /** When set, applies only to this project; otherwise applies globally. */
  projectId?: string;
}

// ─── Repository Interface (for dependency injection / testing) ────────────────

/** Database access interface used by the ApprovalWorkflow. */
export interface BaselineRepository {
  findById(id: string): Promise<VisualBaseline | null>;
  findMany(query: BaselineQuery): Promise<VisualBaseline[]>;
  update(id: string, data: BaselineUpdateData): Promise<VisualBaseline>;
  createApprovalRecord(data: CreateApprovalRecordData): Promise<ApprovalRecord>;
  findApprovalHistory(baselineId: string): Promise<ApprovalRecord[]>;
}

/** Query parameters for listing baselines. */
export interface BaselineQuery {
  projectId?: string;
  status?: BaselineStatus;
  componentName?: string;
  viewport?: string;
  page?: number;
  pageSize?: number;
}

/** Mutable fields allowed when updating a baseline record. */
export interface BaselineUpdateData {
  status?: BaselineStatus;
  autoApproveThreshold?: number | null;
  version?: string;
}

/** Data required to create a new approval history record. */
export interface CreateApprovalRecordData {
  baselineId: string;
  action: ApprovalAction;
  userId: string;
  userName?: string;
  comment?: string;
  previousStatus: BaselineStatus;
  newStatus: BaselineStatus;
  version: string;
}
