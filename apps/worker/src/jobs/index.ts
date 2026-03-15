export * from './types';
export * from './explore';
export * from './spec-read';
export * from './ui-test';
export * from './visual-test';
export * from './performance';
export * from './api-test';
export * from './coordinate';

export { EXPLORE_QUEUE } from './explore';
export { SPEC_READ_QUEUE } from './spec-read';
export { UI_TEST_QUEUE } from './ui-test';
export { VISUAL_TEST_QUEUE } from './visual-test';
export { PERFORMANCE_QUEUE } from './performance';
export { API_TEST_QUEUE } from './api-test';
export { COORDINATE_QUEUE } from './coordinate';

import { EXPLORE_QUEUE } from './explore';
import { SPEC_READ_QUEUE } from './spec-read';
import { UI_TEST_QUEUE } from './ui-test';
import { VISUAL_TEST_QUEUE } from './visual-test';
import { PERFORMANCE_QUEUE } from './performance';
import { API_TEST_QUEUE } from './api-test';
import { COORDINATE_QUEUE } from './coordinate';

/** All agent queue names, in priority-ascending order */
export const AGENT_QUEUES = [
  COORDINATE_QUEUE,
  EXPLORE_QUEUE,
  SPEC_READ_QUEUE,
  UI_TEST_QUEUE,
  VISUAL_TEST_QUEUE,
  PERFORMANCE_QUEUE,
  API_TEST_QUEUE,
] as const;

/** Union type of all agent queue names */
export type AgentQueueName = (typeof AGENT_QUEUES)[number];

/** Name used for the dead letter queue */
export const DEAD_LETTER_QUEUE = 'dead-letter' as const;
