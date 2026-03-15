import type { BaseJobPayload } from './types';

/** Payload for coordinator agent jobs (orchestrates a full test run) */
export interface CoordinateJobPayload extends BaseJobPayload {
  /** Base URL of the application under test */
  baseUrl: string;
  /** Test profile ID to use for configuration */
  profileId: string;
  /** Which agent types to include (defaults to all enabled in profile) */
  agents?: string[];
  /** Failure strategy for the test run */
  failureStrategy?: 'fail-fast' | 'continue-on-error' | 'retry-then-continue';
  /** Global timeout for the entire test run in milliseconds */
  globalTimeout?: number;
}

/** BullMQ queue name for coordinate jobs */
export const COORDINATE_QUEUE = 'coordinate' as const;
