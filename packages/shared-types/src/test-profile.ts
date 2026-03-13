import { TestCategory } from './enums.js';

/** Retry configuration for a test profile */
export interface RetryConfig {
  maxRetries: number;
  backoffMultiplier: number;
  initialDelayMs: number;
}

/** Notification settings for a test profile */
export interface NotificationConfig {
  onFailure: boolean;
  onSuccess: boolean;
  channels: string[];
}

/** A named configuration for running tests */
export interface TestProfile {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  category: TestCategory;
  tags: string[];
  testPaths: string[];
  retryConfig: RetryConfig;
  timeoutMs: number;
  notifications: NotificationConfig;
  createdAt: Date;
  updatedAt: Date;
}

/** Payload for creating a test profile */
export type CreateTestProfileInput = Pick<
  TestProfile,
  'projectId' | 'name' | 'category' | 'testPaths'
> & {
  description?: string;
  tags?: string[];
  retryConfig?: Partial<RetryConfig>;
  timeoutMs?: number;
  notifications?: Partial<NotificationConfig>;
};

/** Payload for updating a test profile */
export type UpdateTestProfileInput = Partial<
  Pick<TestProfile, 'name' | 'description' | 'tags' | 'testPaths' | 'retryConfig' | 'timeoutMs' | 'notifications'>
>;
