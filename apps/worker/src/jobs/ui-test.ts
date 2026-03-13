import type { BaseJobPayload } from './types';

/** Supported browsers for UI test execution */
export type UiTestBrowser = 'chromium' | 'firefox' | 'webkit';

/** Payload for UI testing agent jobs */
export interface UiTestJobPayload extends BaseJobPayload {
  /** URL of the page or component to test */
  targetUrl: string;
  /** Human-readable description of the test scenario */
  scenario: string;
  /** Viewport dimensions (default: 1280×720) */
  viewport?: { width: number; height: number };
  /** Browser engine to use (default: chromium) */
  browser?: UiTestBrowser;
  /** CSS selectors or component names to interact with */
  components?: string[];
}

/** BullMQ queue name for ui-test jobs */
export const UI_TEST_QUEUE = 'ui-test' as const;
