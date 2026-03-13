/**
 * Mock data for dashboard components.
 * Replace these functions/constants with real API calls when the backend is ready.
 *
 * TODO: Replace with API integration — each export maps 1:1 to an API endpoint.
 */

import type {
  ActivityEvent,
  ActivityEventType,
  AgentCreditUsage,
  CreditSummary,
  LeaderboardEntry,
  QualityMetrics,
} from '@/types/dashboard';

// ---------------------------------------------------------------------------
// Quality Metrics
// ---------------------------------------------------------------------------

/** @see GET /api/metrics/overview */
export const mockQualityMetrics: QualityMetrics = {
  totalProjects: 24,
  activeTestRuns: 7,
  overallPassRate: 87.4,
  flakyTestCount: 13,
  avgExecutionTimeSeconds: 42,
  totalCoveragePercent: 73.8,
};

// ---------------------------------------------------------------------------
// Activity Feed
// ---------------------------------------------------------------------------

const activityEvents: Array<{
  type: ActivityEventType;
  title: string;
  description: string;
  user?: string;
  projectName?: string;
  offsetMinutes: number;
}> = [
  {
    type: 'test_run_completed',
    title: 'Test run completed',
    description: '312 tests passed, 4 failed.',
    user: 'alice@semkiest.io',
    projectName: 'Checkout Flow',
    offsetMinutes: 3,
  },
  {
    type: 'issue_discovered',
    title: 'New issue discovered',
    description: 'Timeout on /api/payments/confirm under high load.',
    user: 'bot@semkiest.io',
    projectName: 'Payments API',
    offsetMinutes: 11,
  },
  {
    type: 'test_run_failed',
    title: 'Test run failed',
    description: '18 critical tests failed. Blocking deployment.',
    user: 'ci@semkiest.io',
    projectName: 'User Auth Service',
    offsetMinutes: 27,
  },
  {
    type: 'tests_triggered',
    title: 'Tests triggered',
    description: 'Full regression suite started on staging.',
    user: 'bob@semkiest.io',
    projectName: 'Admin Portal',
    offsetMinutes: 45,
  },
  {
    type: 'test_run_started',
    title: 'Test run started',
    description: 'Smoke tests running against v2.4.1 build.',
    user: 'ci@semkiest.io',
    projectName: 'Mobile API Gateway',
    offsetMinutes: 62,
  },
  {
    type: 'project_created',
    title: 'Project created',
    description: 'New project "Notifications Service" added to the platform.',
    user: 'carol@semkiest.io',
    offsetMinutes: 95,
  },
  {
    type: 'test_run_completed',
    title: 'Test run completed',
    description: '89 tests passed, 0 failed. 100% pass rate!',
    user: 'ci@semkiest.io',
    projectName: 'Search Service',
    offsetMinutes: 140,
  },
  {
    type: 'issue_discovered',
    title: 'New issue discovered',
    description: 'Memory leak in background job worker detected.',
    user: 'bot@semkiest.io',
    projectName: 'Data Pipeline',
    offsetMinutes: 210,
  },
  {
    type: 'test_run_completed',
    title: 'Test run completed',
    description: '201 tests passed, 2 flaky tests detected.',
    user: 'dave@semkiest.io',
    projectName: 'Reporting Dashboard',
    offsetMinutes: 280,
  },
  {
    type: 'tests_triggered',
    title: 'Tests triggered',
    description: 'Nightly regression suite kicked off.',
    user: 'ci@semkiest.io',
    projectName: 'Core Platform',
    offsetMinutes: 360,
  },
];

/** @see GET /api/activity?limit=10&page=1 */
export function getMockActivityFeed(limit = 10): ActivityEvent[] {
  const now = new Date();
  return activityEvents.slice(0, limit).map((event, index) => ({
    id: `activity-${index + 1}`,
    type: event.type,
    title: event.title,
    description: event.description,
    user: event.user,
    projectName: event.projectName,
    timestamp: new Date(now.getTime() - event.offsetMinutes * 60 * 1000),
  }));
}

// ---------------------------------------------------------------------------
// Credit Summary
// ---------------------------------------------------------------------------

const agentBreakdown: AgentCreditUsage[] = [
  { agentType: 'Explorer', creditsUsed: 1840 },
  { agentType: 'Spec Reader', creditsUsed: 1120 },
  { agentType: 'Test Generator', creditsUsed: 780 },
  { agentType: 'Issue Analyzer', creditsUsed: 420 },
  { agentType: 'Coverage Scout', creditsUsed: 290 },
];

/** @see GET /api/credits/summary */
export const mockCreditSummary: CreditSummary = {
  totalCredits: 10000,
  usedCredits: 4450,
  periodLabel: 'March 2026',
  burnRatePerDay: 405,
  // At current burn rate, remaining credits last ~13.7 days from March 12
  estimatedDepletionDate: new Date('2026-03-26'),
  byAgentType: agentBreakdown,
};

// ---------------------------------------------------------------------------
// Project Leaderboard
// ---------------------------------------------------------------------------

const leaderboardData: Array<Omit<LeaderboardEntry, 'lastRunAt'> & { hoursAgo: number }> = [
  {
    id: 'proj-001',
    name: 'Search Service',
    passRate: 99.1,
    totalTests: 892,
    recentRuns: 47,
    healthScore: 98,
    hoursAgo: 2,
  },
  {
    id: 'proj-002',
    name: 'Core Platform',
    passRate: 96.7,
    totalTests: 2341,
    recentRuns: 62,
    healthScore: 94,
    hoursAgo: 6,
  },
  {
    id: 'proj-003',
    name: 'Checkout Flow',
    passRate: 93.8,
    totalTests: 1105,
    recentRuns: 38,
    healthScore: 91,
    hoursAgo: 0.05, // ~3 minutes ago
  },
  {
    id: 'proj-004',
    name: 'Reporting Dashboard',
    passRate: 91.3,
    totalTests: 678,
    recentRuns: 29,
    healthScore: 88,
    hoursAgo: 4.7,
  },
  {
    id: 'proj-005',
    name: 'Mobile API Gateway',
    passRate: 88.5,
    totalTests: 1450,
    recentRuns: 55,
    healthScore: 84,
    hoursAgo: 1.05,
  },
  {
    id: 'proj-006',
    name: 'Admin Portal',
    passRate: 85.2,
    totalTests: 520,
    recentRuns: 21,
    healthScore: 80,
    hoursAgo: 0.75,
  },
  {
    id: 'proj-007',
    name: 'Data Pipeline',
    passRate: 79.6,
    totalTests: 987,
    recentRuns: 33,
    healthScore: 72,
    hoursAgo: 3.5,
  },
  {
    id: 'proj-008',
    name: 'Payments API',
    passRate: 74.1,
    totalTests: 760,
    recentRuns: 41,
    healthScore: 65,
    hoursAgo: 0.18,
  },
  {
    id: 'proj-009',
    name: 'User Auth Service',
    passRate: 56.3,
    totalTests: 1230,
    recentRuns: 58,
    healthScore: 48,
    hoursAgo: 0.45,
  },
  {
    id: 'proj-010',
    name: 'Notifications Service',
    passRate: 100,
    totalTests: 45,
    recentRuns: 3,
    healthScore: 95,
    hoursAgo: 12,
  },
];

/** @see GET /api/projects/leaderboard */
export function getMockLeaderboard(): LeaderboardEntry[] {
  const now = new Date();
  return leaderboardData.map((entry) => ({
    id: entry.id,
    name: entry.name,
    passRate: entry.passRate,
    totalTests: entry.totalTests,
    recentRuns: entry.recentRuns,
    healthScore: entry.healthScore,
    lastRunAt: new Date(now.getTime() - entry.hoursAgo * 60 * 60 * 1000),
  }));
}
