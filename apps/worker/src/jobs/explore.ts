import type { BaseJobPayload } from './types';

/** Payload for exploration agent jobs */
export interface ExploreJobPayload extends BaseJobPayload {
  /** Target URL or file path to explore */
  targetUrl: string;
  /** Maximum link/directory depth to traverse (default: 3) */
  maxDepth?: number;
  /** Specific areas, routes, or selectors to focus on */
  focusAreas?: string[];
}

/** BullMQ queue name for explore jobs */
export const EXPLORE_QUEUE = 'explore' as const;
