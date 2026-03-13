import type { BaseJobPayload } from './types';

/** Supported specification formats */
export type SpecFormat = 'openapi' | 'swagger' | 'graphql' | 'json-schema';

/** Payload for specification-reading agent jobs */
export interface SpecReadJobPayload extends BaseJobPayload {
  /** Absolute path or URL to the specification file */
  specPath: string;
  /** Format of the specification (auto-detected when omitted) */
  format?: SpecFormat;
  /** Specific endpoint paths, type names, or JSON-Schema refs to extract */
  selectors?: string[];
}

/** BullMQ queue name for spec-read jobs */
export const SPEC_READ_QUEUE = 'spec-read' as const;
