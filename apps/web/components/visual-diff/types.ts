/** Approval status for a visual test result */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

/** Viewer layout modes */
export type ViewMode = 'side-by-side' | 'swipe' | 'overlay';

/** Diff visualization modes */
export type DiffMode = 'highlight' | 'diff-only' | 'opacity';

/** A rectangular region of change detected in a visual diff */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A single visual regression test result */
export interface VisualTestResult {
  /** Unique identifier */
  id: string;
  /** Human-readable test name */
  testName: string;
  /** URL to the baseline screenshot */
  baselineUrl: string | null;
  /** URL to the actual (new) screenshot */
  actualUrl: string | null;
  /** URL to a pre-computed diff image, if available */
  diffUrl: string | null;
  /** Current approval status */
  status: ApprovalStatus;
  /** Bounding boxes of detected changed regions */
  changedRegions?: BoundingBox[];
  /** Percentage of pixels that changed (0–100) */
  diffPercentage?: number;
  /** ISO 8601 timestamp */
  createdAt?: string;
  /** ISO 8601 timestamp */
  updatedAt?: string;
}

/** Natural dimensions of a loaded image */
export interface ImageDimensions {
  width: number;
  height: number;
}
