'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Settings2, History, CalendarClock, Share2, Mail, Copy, Check } from 'lucide-react';
import { reportsApi } from '../../../../lib/api-client';
import type {
  Report,
  ReportType,
  ReportCustomization,
  ReportCategory,
  ScheduleConfig,
} from '../../../../types/report';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { ExportButton } from '../../../../components/reports/export-button';
import { ReportPreview } from '../../../../components/reports/report-preview';
import { ReportHistory } from '../../../../components/reports/report-history';
import { ScheduleConfigPanel } from '../../../../components/reports/schedule-config';

interface ReportsPageProps {
  params: { id: string };
}

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  executive_summary: 'Executive Summary',
  technical_details: 'Technical Details',
  trends_analysis: 'Trends Analysis',
  test_run: 'Test Run Report',
  project_summary: 'Project Summary',
  organization: 'Organization',
};

const CATEGORIES: { value: ReportCategory; label: string }[] = [
  { value: 'quality', label: 'Quality' },
  { value: 'performance', label: 'Performance' },
  { value: 'coverage', label: 'Coverage' },
  { value: 'trends', label: 'Trends' },
];

const TIME_PERIODS: {
  value: ReportCustomization['timePeriod'];
  label: string;
}[] = [
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'last_90_days', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom range' },
];

/** Project reports dashboard page. */
export default function ProjectReportsPage({ params }: ReportsPageProps) {
  const projectId = params.id;

  // Report customization
  const [reportType, setReportType] = useState<ReportType>('executive_summary');
  const [timePeriod, setTimePeriod] =
    useState<ReportCustomization['timePeriod']>('last_30_days');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedCategories, setSelectedCategories] =
    useState<ReportCategory[]>(['quality', 'performance']);

  // Report list
  const [reports, setReports] = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);

  // Schedules
  const [schedules, setSchedules] = useState<ScheduleConfig[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);

  // Preview
  const [previewReport, setPreviewReport] = useState<Report | null>(null);

  // Share link copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Loaders
  // ---------------------------------------------------------------------------

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const res = await reportsApi.list(projectId);
      setReports(res.data);
    } catch {
      // Reports may not exist yet — treat as empty
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  }, [projectId]);

  const loadSchedules = useCallback(async () => {
    setSchedulesLoading(true);
    try {
      const res = await reportsApi.listSchedules(projectId);
      setSchedules(res);
    } catch {
      setSchedules([]);
    } finally {
      setSchedulesLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadReports();
    void loadSchedules();
  }, [loadReports, loadSchedules]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  function buildCustomization(): ReportCustomization {
    return {
      categories: selectedCategories,
      timePeriod,
      dateFrom: timePeriod === 'custom' ? dateFrom : undefined,
      dateTo: timePeriod === 'custom' ? dateTo : undefined,
      metrics: ['passRate', 'failRate', 'totalRuns', 'totalTests'],
    };
  }

  async function handleViewDashboard(
    pid: string,
    type: ReportType,
    customization: ReportCustomization,
  ) {
    setError(null);
    try {
      const report = await reportsApi.generate({ projectId: pid, type, format: 'dashboard', customization });
      setReports((prev) => [report, ...prev]);
      setPreviewReport(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    }
  }

  async function handleDownloadExcel(
    pid: string,
    type: ReportType,
    customization: ReportCustomization,
  ) {
    setError(null);
    try {
      const report = await reportsApi.generate({ projectId: pid, type, format: 'excel', customization });
      setReports((prev) => [report, ...prev]);
      if (report.downloadUrl) {
        window.open(report.downloadUrl, '_blank');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate Excel report');
    }
  }

  async function handleDownloadExisting(report: Report) {
    if (report.downloadUrl) {
      window.open(report.downloadUrl, '_blank');
    }
  }

  async function handleDeleteReport(reportId: string) {
    await reportsApi.delete(reportId);
    setReports((prev) => prev.filter((r) => r.id !== reportId));
  }

  function handleCopyLink(report: Report) {
    if (report.shareUrl) {
      void navigator.clipboard.writeText(report.shareUrl);
      setCopiedId(report.id);
      setTimeout(() => setCopiedId((prev) => (prev === report.id ? null : prev)), 2000);
    }
  }

  async function handleSaveSchedule(values: {
    frequency: 'weekly' | 'monthly';
    dayOfPeriod: number;
    recipients: string[];
    reportType: ReportType;
  }) {
    const schedule = await reportsApi.createSchedule({
      projectId,
      ...values,
      format: 'excel',
    });
    setSchedules((prev) => [...prev, schedule]);
  }

  async function handleDeleteSchedule(scheduleId: string) {
    await reportsApi.deleteSchedule(scheduleId);
    setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
  }

  function toggleCategory(cat: ReportCategory) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {previewReport && (
        <ReportPreview
          report={previewReport}
          onClose={() => setPreviewReport(null)}
        />
      )}

      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-6 w-6" />
              Reports
            </h1>
            <p className="text-muted-foreground mt-1">
              Generate, download, and schedule report delivery.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Tabs defaultValue="generate">
          <TabsList>
            <TabsTrigger value="generate">
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="mr-1.5 h-3.5 w-3.5" />
              History
              {reports.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs">
                  {reports.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="schedule">
              <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
              Schedule
              {schedules.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs">
                  {schedules.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="share">
              <Share2 className="mr-1.5 h-3.5 w-3.5" />
              Share
            </TabsTrigger>
          </TabsList>

          {/* ---------------------------------------------------------------- */}
          {/* Generate tab                                                      */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="generate" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Report Configuration</CardTitle>
                <CardDescription>
                  Customize what data to include in the report.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Template / type */}
                <div className="space-y-1.5">
                  <Label htmlFor="reportType">Report Template</Label>
                  <Select
                    value={reportType}
                    onValueChange={(v) => setReportType(v as ReportType)}
                  >
                    <SelectTrigger id="reportType" className="max-w-xs">
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Time period */}
                <div className="space-y-1.5">
                  <Label htmlFor="timePeriod">Time Period</Label>
                  <Select
                    value={timePeriod}
                    onValueChange={(v) =>
                      setTimePeriod(v as ReportCustomization['timePeriod'])
                    }
                  >
                    <SelectTrigger id="timePeriod" className="max-w-xs">
                      <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_PERIODS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {timePeriod === 'custom' && (
                  <div className="grid grid-cols-2 gap-4 max-w-xs">
                    <div className="space-y-1.5">
                      <Label htmlFor="dateFrom">From</Label>
                      <Input
                        id="dateFrom"
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="dateTo">To</Label>
                      <Input
                        id="dateTo"
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* Categories */}
                <div className="space-y-2">
                  <Label>Categories</Label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((cat) => {
                      const active = selectedCategories.includes(cat.value);
                      return (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => toggleCategory(cat.value)}
                          className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                            active
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                          }`}
                        >
                          {cat.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Generate actions */}
                <div className="pt-2">
                  <ExportButton
                    projectId={projectId}
                    reportType={reportType}
                    customization={buildCustomization()}
                    onViewDashboard={handleViewDashboard}
                    onDownloadExcel={handleDownloadExcel}
                    disabled={selectedCategories.length === 0}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* History tab                                                       */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="history" className="mt-4">
            <ReportHistory
              reports={reports}
              onPreview={setPreviewReport}
              onDownload={handleDownloadExisting}
              onDelete={handleDeleteReport}
              onCopyLink={handleCopyLink}
              loading={reportsLoading}
            />
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* Schedule tab                                                      */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="schedule" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" />
                  Scheduled Deliveries
                </CardTitle>
                <CardDescription>
                  Automatically generate and email reports on a recurring schedule.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {schedulesLoading ? (
                  <p className="text-sm text-muted-foreground">Loading schedules...</p>
                ) : (
                  <ScheduleConfigPanel
                    projectId={projectId}
                    existingSchedules={schedules}
                    onSave={handleSaveSchedule}
                    onDelete={handleDeleteSchedule}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* Share tab                                                         */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="share" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Share2 className="h-4 w-4" />
                  Share Reports
                </CardTitle>
                <CardDescription>
                  Copy links to share or email reports to stakeholders.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {reports.filter((r) => r.shareUrl).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Generate a report first to get a shareable link.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {reports
                      .filter((r) => r.shareUrl && r.status === 'ready')
                      .slice(0, 10)
                      .map((report) => (
                        <li
                          key={report.id}
                          className="flex items-center gap-3 rounded-md border border-border px-4 py-3 bg-card"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{report.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {report.shareUrl}
                            </p>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopyLink(report)}
                            >
                              {copiedId === report.id ? (
                                <>
                                  <Check className="mr-1 h-3.5 w-3.5 text-green-600" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="mr-1 h-3.5 w-3.5" />
                                  Copy Link
                                </>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const subject = encodeURIComponent(`Report: ${report.title}`);
                                const body = encodeURIComponent(
                                  `View this report: ${report.shareUrl ?? ''}`,
                                );
                                window.open(`mailto:?subject=${subject}&body=${body}`);
                              }}
                            >
                              <Mail className="mr-1 h-3.5 w-3.5" />
                              Email
                            </Button>
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
