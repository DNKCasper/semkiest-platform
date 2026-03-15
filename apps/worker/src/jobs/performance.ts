import type { BaseJobPayload } from './types';

/** Payload for performance agent jobs */
export interface PerformanceJobPayload extends BaseJobPayload {
  /** URLs to audit for performance */
  urls: string[];
  /** Device emulation mode */
  device?: 'mobile' | 'desktop';
  /** Throttling mode for network/CPU simulation */
  throttling?: 'simulated' | 'devtools' | 'none';
  /** Number of iterations per URL (default: 1) */
  iterations?: number;
  /** Performance score thresholds */
  thresholds?: {
    performance?: number;
    lcp?: number;
    cls?: number;
    fcp?: number;
  };
}

/** BullMQ queue name for performance jobs */
export const PERFORMANCE_QUEUE = 'performance' as const;
