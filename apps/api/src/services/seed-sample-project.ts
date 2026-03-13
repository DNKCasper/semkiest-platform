/**
 * Seed service: creates a pre-configured demo project with sample test data.
 *
 * This service is intentionally decoupled from any ORM so it can be wired up
 * once a Prisma client is available, or used in tests with a mock store.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SampleProjectInput {
  organizationId: string;
  createdByUserId: string;
}

export interface SampleTestProfile {
  id: string;
  name: string;
  browser: 'chromium' | 'firefox' | 'webkit';
  viewport: string;
  headless: boolean;
}

export interface SampleTestRun {
  id: string;
  profileId: string;
  status: 'passed' | 'failed' | 'running';
  totalTests: number;
  passedTests: number;
  failedTests: number;
  durationMs: number;
  startedAt: Date;
  completedAt: Date;
}

export interface SampleTestResult {
  id: string;
  runId: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  errorMessage?: string;
}

export interface SampleProject {
  id: string;
  name: string;
  url: string;
  environment: 'staging';
  description: string;
  isDemo: boolean;
  organizationId: string;
  createdByUserId: string;
  createdAt: Date;
  testProfiles: SampleTestProfile[];
  testRuns: SampleTestRun[];
  testResults: SampleTestResult[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEMO_PROJECT_NAME = 'Demo Project (Sample)';
const DEMO_PROJECT_URL = 'https://demo.semkiest.example';
const DEMO_PROJECT_DESCRIPTION =
  'A pre-configured demo project with sample test data. Explore test runs, results, and profiles to get familiar with the platform.';

const SAMPLE_TESTS: Omit<SampleTestResult, 'id' | 'runId'>[] = [
  {
    name: 'Home page loads with 200 status',
    status: 'passed',
    durationMs: 812,
  },
  {
    name: 'Navigation links are present and visible',
    status: 'passed',
    durationMs: 340,
  },
  {
    name: 'Page title matches brand name',
    status: 'passed',
    durationMs: 128,
  },
  {
    name: 'No console errors on initial load',
    status: 'passed',
    durationMs: 260,
  },
  {
    name: 'Accessibility: page has landmark regions',
    status: 'passed',
    durationMs: 195,
  },
  {
    name: 'Images have alt attributes',
    status: 'passed',
    durationMs: 110,
  },
  {
    name: 'Contact form renders correctly',
    status: 'passed',
    durationMs: 445,
  },
  {
    name: 'Footer links are not broken',
    status: 'failed',
    durationMs: 632,
    errorMessage: 'Element with selector ".footer-link" not found within 5000ms',
  },
];

// ─── Factory helpers ──────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildSampleProfiles(): SampleTestProfile[] {
  return [
    {
      id: generateId(),
      name: 'Desktop Chrome',
      browser: 'chromium',
      viewport: '1280x720',
      headless: true,
    },
    {
      id: generateId(),
      name: 'Mobile Safari',
      browser: 'webkit',
      viewport: '375x812',
      headless: true,
    },
  ];
}

function buildSampleRuns(profiles: SampleTestProfile[]): {
  runs: SampleTestRun[];
  results: SampleTestResult[];
} {
  const runs: SampleTestRun[] = [];
  const results: SampleTestResult[] = [];

  for (const profile of profiles) {
    const startedAt = new Date(Date.now() - 1000 * 60 * 30); // 30 min ago
    const runResults = SAMPLE_TESTS.map((t) => ({
      id: generateId(),
      runId: '', // filled below
      ...t,
    }));

    const passedCount = runResults.filter((r) => r.status === 'passed').length;
    const failedCount = runResults.filter((r) => r.status === 'failed').length;
    const totalDuration = runResults.reduce((s, r) => s + r.durationMs, 0);

    const run: SampleTestRun = {
      id: generateId(),
      profileId: profile.id,
      status: failedCount > 0 ? 'failed' : 'passed',
      totalTests: runResults.length,
      passedTests: passedCount,
      failedTests: failedCount,
      durationMs: totalDuration,
      startedAt,
      completedAt: new Date(startedAt.getTime() + totalDuration),
    };

    // back-fill runId
    runResults.forEach((r) => {
      r.runId = run.id;
    });

    runs.push(run);
    results.push(...runResults);
  }

  return { runs, results };
}

// ─── Main service function ────────────────────────────────────────────────────

/**
 * Builds a fully hydrated sample project in-memory.
 *
 * Callers are responsible for persisting the returned object to the database.
 * The data structure mirrors what the Prisma schema will expect once the
 * database package is fully wired up.
 */
export function buildSampleProject(input: SampleProjectInput): SampleProject {
  const projectId = generateId();
  const testProfiles = buildSampleProfiles();
  const { runs: testRuns, results: testResults } = buildSampleRuns(testProfiles);

  return {
    id: projectId,
    name: DEMO_PROJECT_NAME,
    url: DEMO_PROJECT_URL,
    environment: 'staging',
    description: DEMO_PROJECT_DESCRIPTION,
    isDemo: true,
    organizationId: input.organizationId,
    createdByUserId: input.createdByUserId,
    createdAt: new Date(),
    testProfiles,
    testRuns,
    testResults,
  };
}

/**
 * Returns summary statistics for a sample project.
 * Useful for seeding dashboard metrics without a real database.
 */
export function getSampleProjectStats(project: SampleProject): {
  totalRuns: number;
  passRate: number;
  avgDurationMs: number;
  lastRunAt: Date;
} {
  const totalRuns = project.testRuns.length;
  if (totalRuns === 0) {
    return { totalRuns: 0, passRate: 0, avgDurationMs: 0, lastRunAt: new Date() };
  }

  const passedRuns = project.testRuns.filter((r) => r.status === 'passed').length;
  const passRate = Math.round((passedRuns / totalRuns) * 100);
  const avgDurationMs = Math.round(
    project.testRuns.reduce((s, r) => s + r.durationMs, 0) / totalRuns,
  );
  const lastRunAt = project.testRuns.reduce((latest, run) =>
    run.completedAt > latest.completedAt ? run : latest,
  ).completedAt;

  return { totalRuns, passRate, avgDurationMs, lastRunAt };
}
