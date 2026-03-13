/**
 * Report domain types for the SemkiEst platform.
 */

export type ReportType =
  | 'executive_summary'
  | 'technical_details'
  | 'trends_analysis'
  | 'test_run'
  | 'project_summary'
  | 'organization';

export type ReportFormat = 'dashboard' | 'excel' | 'pdf';

export type ReportStatus = 'pending' | 'generating' | 'ready' | 'failed';

export type ScheduleFrequency = 'weekly' | 'monthly';

export type ReportCategory = 'quality' | 'performance' | 'coverage' | 'trends';

export interface ReportMetrics {
  totalRuns: number;
  passRate: number;
  failRate: number;
  totalTests: number;
  avgDuration?: number;
}

export interface ReportCustomization {
  /** Categories to include in the report */
  categories: ReportCategory[];
  /** Time period for the report */
  timePeriod: 'last_7_days' | 'last_30_days' | 'last_90_days' | 'custom';
  /** Custom date range start (ISO string) */
  dateFrom?: string;
  /** Custom date range end (ISO string) */
  dateTo?: string;
  /** Metrics to include */
  metrics: string[];
}

export interface ScheduleConfig {
  id: string;
  projectId: string;
  frequency: ScheduleFrequency;
  /** Day of week (0-6, 0=Sunday) for weekly; day of month (1-28) for monthly */
  dayOfPeriod: number;
  recipients: string[];
  format: ReportFormat;
  reportType: ReportType;
  isActive: boolean;
  lastSentAt?: string;
  nextSendAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Report {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  type: ReportType;
  format: ReportFormat;
  status: ReportStatus;
  customization: ReportCustomization;
  metrics?: ReportMetrics;
  downloadUrl?: string;
  shareUrl?: string;
  generatedAt?: string;
  createdAt: string;
  createdBy?: string;
}

export interface ReportListResponse {
  data: Report[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GenerateReportInput {
  projectId: string;
  type: ReportType;
  format: ReportFormat;
  customization: ReportCustomization;
}

export interface CreateScheduleInput {
  projectId: string;
  frequency: ScheduleFrequency;
  dayOfPeriod: number;
  recipients: string[];
  format: ReportFormat;
  reportType: ReportType;
}

export interface UpdateScheduleInput {
  frequency?: ScheduleFrequency;
  dayOfPeriod?: number;
  recipients?: string[];
  format?: ReportFormat;
  reportType?: ReportType;
  isActive?: boolean;
}

/** Organization-wide report data for admin view */
export interface OrgReport {
  projectId: string;
  projectName: string;
  environment: string;
  totalRuns: number;
  passRate: number;
  totalTests: number;
  lastRunAt?: string;
  trend: 'up' | 'down' | 'stable';
}

export interface OrgReportResponse {
  generatedAt: string;
  totalProjects: number;
  projects: OrgReport[];
  summary: {
    avgPassRate: number;
    totalRuns: number;
    totalTests: number;
  };
}
