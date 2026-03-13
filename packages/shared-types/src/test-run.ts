import { TestStatus, Severity } from './enums.js';

/** A single step within a test execution */
export interface TestStep {
  id: string;
  name: string;
  status: TestStatus;
  durationMs?: number;
  error?: string;
  screenshot?: string;
}

/** Result of a single test case */
export interface TestResult {
  id: string;
  testRunId: string;
  name: string;
  status: TestStatus;
  severity: Severity;
  durationMs: number;
  steps: TestStep[];
  error?: string;
  errorStack?: string;
  retries: number;
  createdAt: Date;
  updatedAt: Date;
}

/** A collection of test executions triggered together */
export interface TestRun {
  id: string;
  projectId: string;
  profileId: string;
  agentId?: string;
  status: TestStatus;
  results: TestResult[];
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs?: number;
  triggeredBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Payload for creating a new test run */
export type CreateTestRunInput = Pick<TestRun, 'projectId' | 'profileId' | 'triggeredBy'> & {
  agentId?: string;
};
