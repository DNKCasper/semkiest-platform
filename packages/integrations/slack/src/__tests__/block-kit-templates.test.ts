import {
  buildTestRunBlocks,
  buildCriticalBugBlocks,
  buildQualityScoreChangeBlocks,
  buildDigestBlocks,
} from '../block-kit-templates';
import type {
  TestRunResult,
  CriticalBug,
  QualityScoreChange,
  DigestSummary,
} from '../types';

const baseTestRun: TestRunResult = {
  id: 'run-1',
  projectId: 'proj-1',
  projectName: 'SemkiEst API',
  timestamp: new Date('2024-03-15T10:30:00Z'),
  totalTests: 200,
  passedTests: 190,
  failedTests: 10,
  skippedTests: 0,
  duration: 90000,
  qualityScore: 82,
  dashboardUrl: 'https://app.semkiest.com/projects/proj-1/runs/run-1',
};

const baseBug: CriticalBug = {
  id: 'bug-1',
  projectId: 'proj-1',
  projectName: 'SemkiEst API',
  title: 'Null pointer exception in auth middleware',
  severity: 'critical',
  description: 'Auth middleware throws NPE when token is malformed.',
  testRunId: 'run-1',
  discoveredAt: new Date('2024-03-15T10:31:00Z'),
  dashboardUrl: 'https://app.semkiest.com/projects/proj-1/bugs/bug-1',
};

const baseQualityChange: QualityScoreChange = {
  projectId: 'proj-1',
  projectName: 'SemkiEst API',
  previousScore: 75,
  currentScore: 82,
  changeAmount: 7,
  changePercent: 9.33,
  timestamp: new Date('2024-03-15T10:32:00Z'),
  dashboardUrl: 'https://app.semkiest.com/projects/proj-1',
};

const baseDigest: DigestSummary = {
  period: 'daily',
  startDate: new Date('2024-03-14T00:00:00Z'),
  endDate: new Date('2024-03-15T00:00:00Z'),
  projects: [
    {
      projectId: 'proj-1',
      projectName: 'SemkiEst API',
      testRuns: 5,
      passedTests: 950,
      failedTests: 50,
      qualityScore: 82,
      qualityScoreTrend: 'up',
      dashboardUrl: 'https://app.semkiest.com/projects/proj-1',
    },
  ],
  totalTestRuns: 5,
  totalPassedTests: 950,
  totalFailedTests: 50,
  overallQualityScore: 82,
  dashboardUrl: 'https://app.semkiest.com/reports/daily',
};

describe('buildTestRunBlocks', () => {
  it('returns an array of blocks', () => {
    const blocks = buildTestRunBlocks(baseTestRun);
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('includes a header block', () => {
    const blocks = buildTestRunBlocks(baseTestRun);
    const header = blocks.find((b) => b.type === 'header');
    expect(header).toBeDefined();
  });

  it('includes an actions block with a button linking to dashboardUrl', () => {
    const blocks = buildTestRunBlocks(baseTestRun);
    const actionsBlock = blocks.find((b) => b.type === 'actions');
    expect(actionsBlock).toBeDefined();
    // The button URL should contain the dashboardUrl
    const blockJson = JSON.stringify(actionsBlock);
    expect(blockJson).toContain(baseTestRun.dashboardUrl);
  });

  it('shows the project name in the header', () => {
    const blocks = buildTestRunBlocks(baseTestRun);
    const header = blocks.find((b) => b.type === 'header');
    const headerJson = JSON.stringify(header);
    expect(headerJson).toContain(baseTestRun.projectName);
  });

  it('marks the button as danger when there are failures', () => {
    const blocks = buildTestRunBlocks(baseTestRun);
    const actionsBlock = blocks.find((b) => b.type === 'actions');
    expect(JSON.stringify(actionsBlock)).toContain('danger');
  });

  it('marks the button as primary when all tests pass', () => {
    const allPassRun: TestRunResult = {
      ...baseTestRun,
      failedTests: 0,
      passedTests: 200,
    };
    const blocks = buildTestRunBlocks(allPassRun);
    const actionsBlock = blocks.find((b) => b.type === 'actions');
    expect(JSON.stringify(actionsBlock)).toContain('primary');
  });
});

describe('buildCriticalBugBlocks', () => {
  it('returns an array of blocks', () => {
    const blocks = buildCriticalBugBlocks(baseBug);
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('includes a header block', () => {
    const blocks = buildCriticalBugBlocks(baseBug);
    const header = blocks.find((b) => b.type === 'header');
    expect(header).toBeDefined();
  });

  it('includes the bug title in a section', () => {
    const blocks = buildCriticalBugBlocks(baseBug);
    const blocksJson = JSON.stringify(blocks);
    expect(blocksJson).toContain(baseBug.title);
  });

  it('includes an actions block linking to dashboardUrl', () => {
    const blocks = buildCriticalBugBlocks(baseBug);
    const actionsBlock = blocks.find((b) => b.type === 'actions');
    expect(JSON.stringify(actionsBlock)).toContain(baseBug.dashboardUrl);
  });

  it('uses danger style for action button', () => {
    const blocks = buildCriticalBugBlocks(baseBug);
    const actionsBlock = blocks.find((b) => b.type === 'actions');
    expect(JSON.stringify(actionsBlock)).toContain('danger');
  });
});

describe('buildQualityScoreChangeBlocks', () => {
  it('returns an array of blocks', () => {
    const blocks = buildQualityScoreChangeBlocks(baseQualityChange);
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('includes a header block', () => {
    const blocks = buildQualityScoreChangeBlocks(baseQualityChange);
    const header = blocks.find((b) => b.type === 'header');
    expect(header).toBeDefined();
  });

  it('includes current and previous scores', () => {
    const blocks = buildQualityScoreChangeBlocks(baseQualityChange);
    const blocksJson = JSON.stringify(blocks);
    expect(blocksJson).toContain(
      String(baseQualityChange.currentScore),
    );
    expect(blocksJson).toContain(
      String(baseQualityChange.previousScore),
    );
  });

  it('uses primary style button when score improves', () => {
    const blocks = buildQualityScoreChangeBlocks(baseQualityChange);
    const actionsBlock = blocks.find((b) => b.type === 'actions');
    expect(JSON.stringify(actionsBlock)).toContain('primary');
  });

  it('uses danger style button when score declines', () => {
    const decline: QualityScoreChange = {
      ...baseQualityChange,
      changeAmount: -10,
      changePercent: -13.3,
      previousScore: 82,
      currentScore: 72,
    };
    const blocks = buildQualityScoreChangeBlocks(decline);
    const actionsBlock = blocks.find((b) => b.type === 'actions');
    expect(JSON.stringify(actionsBlock)).toContain('danger');
  });
});

describe('buildDigestBlocks', () => {
  it('returns an array of blocks', () => {
    const blocks = buildDigestBlocks(baseDigest);
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('includes a header block', () => {
    const blocks = buildDigestBlocks(baseDigest);
    const header = blocks.find((b) => b.type === 'header');
    expect(header).toBeDefined();
  });

  it('includes overall quality score', () => {
    const blocks = buildDigestBlocks(baseDigest);
    const blocksJson = JSON.stringify(blocks);
    expect(blocksJson).toContain(String(baseDigest.overallQualityScore));
  });

  it('includes project name in breakdown', () => {
    const blocks = buildDigestBlocks(baseDigest);
    const blocksJson = JSON.stringify(blocks);
    expect(blocksJson).toContain('SemkiEst API');
  });

  it('handles empty projects list gracefully', () => {
    const emptyDigest: DigestSummary = {
      ...baseDigest,
      projects: [],
      totalTestRuns: 0,
      totalPassedTests: 0,
      totalFailedTests: 0,
    };
    const blocks = buildDigestBlocks(emptyDigest);
    const blocksJson = JSON.stringify(blocks);
    expect(blocksJson).toContain('No projects');
  });

  it('uses "Weekly" label for weekly period', () => {
    const weeklyDigest: DigestSummary = {
      ...baseDigest,
      period: 'weekly',
    };
    const blocks = buildDigestBlocks(weeklyDigest);
    const header = blocks.find((b) => b.type === 'header');
    expect(JSON.stringify(header)).toContain('Weekly');
  });

  it('includes a link to the dashboardUrl', () => {
    const blocks = buildDigestBlocks(baseDigest);
    const blocksJson = JSON.stringify(blocks);
    expect(blocksJson).toContain(baseDigest.dashboardUrl);
  });
});
