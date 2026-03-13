export * from './types';
export * from './explore';
export * from './spec-read';
export * from './ui-test';
export * from './visual-test';

export { EXPLORE_QUEUE } from './explore';
export { SPEC_READ_QUEUE } from './spec-read';
export { UI_TEST_QUEUE } from './ui-test';
export { VISUAL_TEST_QUEUE } from './visual-test';

import { EXPLORE_QUEUE } from './explore';
import { SPEC_READ_QUEUE } from './spec-read';
import { UI_TEST_QUEUE } from './ui-test';
import { VISUAL_TEST_QUEUE } from './visual-test';

/** All agent queue names, in priority-ascending order */
export const AGENT_QUEUES = [
  EXPLORE_QUEUE,
  SPEC_READ_QUEUE,
  UI_TEST_QUEUE,
  VISUAL_TEST_QUEUE,
] as const;

/** Union type of all agent queue names */
export type AgentQueueName = (typeof AGENT_QUEUES)[number];

/** Name used for the dead letter queue */
export const DEAD_LETTER_QUEUE = 'dead-letter' as const;
