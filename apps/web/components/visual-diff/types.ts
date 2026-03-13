/**
 * Client-side types for the visual diff viewer and approval workflow UI.
 * These mirror the server-side types from @semkiest/visual-regression but
 * are kept local to avoid a build-time dependency on the Node.js agent package.
 */

export type DiffViewMode = 'side-by-side' | 'overlay' | 'diff-highlight' | 'slider';

export type BaselineStatus = 'pending' | 'approved' | 'rejected' | 'auto-approved';

export type ApprovalAction = 'approved' | 'rejected' | 'auto-approved';

export interface ScreenshotData {
  url: string;
  width: number;
  height: number;
  capturedAt: string;
}

export interface DiffResult {
  diffPixels: number;
  totalPixels: number;
  diffPercentage: number;
  diffImageUrl?: string;
}

/** Complete data payload for the diff viewer. */
export interface DiffViewerData {
  baselineId: string;
  componentName: string;
  viewport: string;
  version: string;
  baseline: ScreenshotData;
  actual: ScreenshotData;
  diffOverlay?: ScreenshotData;
  diffResult: DiffResult;
  status: BaselineStatus;
  availableViewModes: DiffViewMode[];
}

/** An immutable approval or rejection record. */
export interface ApprovalRecord {
  id: string;
  baselineId: string;
  action: ApprovalAction;
  userId: string;
  userName?: string;
  comment?: string;
  previousStatus: BaselineStatus;
  newStatus: BaselineStatus;
  version: string;
  createdAt: string;
}

/** Summary of a single baseline (used in list views). */
export interface BaselineSummary {
  id: string;
  projectId: string;
  componentName: string;
  viewport: string;
  version: string;
  diffPercentage?: number;
  status: BaselineStatus;
  updatedAt: string;
}
