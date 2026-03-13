/**
 * Shared quality metric types used across API, worker, and web packages.
 */

export type TrendWindow = 7 | 30 | 90;

export interface TrendDataPoint {
  date: string;
  passRate: number;
  bugCount: number;
  criticalBugs: number;
  highBugs: number;
  mediumBugs: number;
  lowBugs: number;
  coverage: number | null;
  runCount: number;
  totalTests: number;
}

export interface RollingAverage {
  windowDays: TrendWindow;
  avgPassRate: number;
  avgBugCount: number;
  avgCriticalBugs: number;
  avgCoverage: number | null;
  trend: 'improving' | 'degrading' | 'stable';
}

export interface QualityTrendReport {
  projectId: string;
  startDate: string;
  endDate: string;
  timezone: string;
  dataPoints: TrendDataPoint[];
  rollingAverages: {
    sevenDay: RollingAverage | null;
    thirtyDay: RollingAverage | null;
    ninetyDay: RollingAverage | null;
  };
  summary: {
    latestPassRate: number | null;
    latestBugCount: number | null;
    totalRunsInPeriod: number;
    averagePassRate: number | null;
    peakPassRate: number | null;
    lowestPassRate: number | null;
  };
}
