import type { BaseJobPayload } from './types';

/** Payload for visual regression testing agent jobs */
export interface VisualTestJobPayload extends BaseJobPayload {
  /** URL of the page or component to capture */
  targetUrl: string;
  /** Path to the baseline screenshot for comparison (new baseline when omitted) */
  baselinePath?: string;
  /**
   * Maximum allowed visual difference ratio (0–1).
   * A value of 0.01 means at most 1% of pixels may differ.
   * Default: 0.01
   */
  threshold?: number;
  /** Viewport dimensions for the screenshot (default: 1280×720) */
  viewport?: { width: number; height: number };
  /** CSS selector to scope the screenshot to a specific element */
  selector?: string;
}

/** BullMQ queue name for visual-test jobs */
export const VISUAL_TEST_QUEUE = 'visual-test' as const;
