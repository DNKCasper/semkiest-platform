'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Download,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
} from 'lucide-react';
import { reportsApi } from '../../../lib/api-client';
import type { OrgReport, OrgReportResponse } from '../../../types/report';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { formatDateTime, formatPassRate } from '../../../lib/utils';

const TREND_CONFIG = {
  up: { icon: TrendingUp, label: 'Improving', color: 'text-green-600' },
  down: { icon: TrendingDown, label: 'Declining', color: 'text-red-600' },
  stable: { icon: Minus, label: 'Stable', color: 'text-muted-foreground' },
} satisfies Record<OrgReport['trend'], { icon: React.ComponentType<{ className?: string }>; label: string; color: string }>;

/**
 * Organization-wide reports page (admin only).
 * Shows cross-project comparison and leaderboard.
 */
export default function AdminReportsPage() {
  const [data, setData] = useState<OrgReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<keyof OrgReport>('passRate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await reportsApi.getOrgReport();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load organization report');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function toggleSort(field: keyof OrgReport) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function handleExport() {
    if (!data) return;
    // Build CSV
    const rows = [
      ['Project', 'Environment', 'Total Runs', 'Pass Rate', 'Total Tests', 'Last Run', 'Trend'],
      ...data.projects.map((p) => [
        p.projectName,
        p.environment,
        String(p.totalRuns),
        formatPassRate(p.passRate),
        String(p.totalTests),
        p.lastRunAt ?? '',
        p.trend,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `org-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = (data?.projects ?? [])
    .filter(
      (p) =>
        search === '' ||
        p.projectName.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      const av = a[sortField] ?? '';
      const bv = b[sortField] ?? '';
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

  // Leaderboard (top 3 by pass rate)
  const leaderboard = [...(data?.projects ?? [])]
    .sort((a, b) => b.passRate - a.passRate)
    .slice(0, 3);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading organization report...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Organization Reports
          </h1>
          {data && (
            <p className="text-sm text-muted-foreground mt-1">
              Generated {formatDateTime(data.generatedAt)} · {data.totalProjects} projects
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" />
            )}
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!data}>
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Summary cards */}
      {data && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-1">
              <CardDescription>Total Projects</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{data.totalProjects}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardDescription>Avg Pass Rate</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">
                {formatPassRate(data.summary.avgPassRate)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardDescription>Total Test Runs</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{data.summary.totalRuns.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Projects by Pass Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {leaderboard.map((project, idx) => {
                const trend = TREND_CONFIG[project.trend];
                const TrendIcon = trend.icon;
                return (
                  <li key={project.projectId} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{project.projectName}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {project.environment}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendIcon className={`h-4 w-4 ${trend.color}`} />
                      <span className="font-semibold text-green-600">
                        {formatPassRate(project.passRate)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Full project table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base">All Projects</CardTitle>
            <Input
              placeholder="Filter projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs h-8 text-sm"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-b-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    field="projectName"
                    current={sortField}
                    dir={sortDir}
                    onClick={toggleSort}
                  >
                    Project
                  </SortableHead>
                  <TableHead>Environment</TableHead>
                  <SortableHead
                    field="totalRuns"
                    current={sortField}
                    dir={sortDir}
                    onClick={toggleSort}
                  >
                    Runs
                  </SortableHead>
                  <SortableHead
                    field="passRate"
                    current={sortField}
                    dir={sortDir}
                    onClick={toggleSort}
                  >
                    Pass Rate
                  </SortableHead>
                  <SortableHead
                    field="totalTests"
                    current={sortField}
                    dir={sortDir}
                    onClick={toggleSort}
                  >
                    Tests
                  </SortableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-8 text-muted-foreground text-sm"
                    >
                      No projects match your filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((project) => {
                    const trend = TREND_CONFIG[project.trend];
                    const TrendIcon = trend.icon;
                    return (
                      <TableRow key={project.projectId}>
                        <TableCell className="font-medium">
                          {project.projectName}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {project.environment}
                          </Badge>
                        </TableCell>
                        <TableCell>{project.totalRuns.toLocaleString()}</TableCell>
                        <TableCell>
                          <PassRateCell rate={project.passRate} />
                        </TableCell>
                        <TableCell>{project.totalTests.toLocaleString()}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {project.lastRunAt
                            ? new Date(project.lastRunAt).toLocaleDateString()
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <div className={`flex items-center gap-1 text-sm ${trend.color}`}>
                            <TrendIcon className="h-3.5 w-3.5" />
                            {trend.label}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface SortableHeadProps {
  field: keyof OrgReport;
  current: keyof OrgReport;
  dir: 'asc' | 'desc';
  onClick: (field: keyof OrgReport) => void;
  children: React.ReactNode;
}

function SortableHead({ field, current, dir, onClick, children }: SortableHeadProps) {
  const active = current === field;
  return (
    <TableHead
      className="cursor-pointer select-none hover:text-foreground"
      onClick={() => onClick(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        {active && (
          <span className="text-xs text-muted-foreground">
            {dir === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </span>
    </TableHead>
  );
}

function PassRateCell({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const color =
    pct >= 90 ? 'text-green-600' : pct >= 70 ? 'text-yellow-600' : 'text-red-600';
  return <span className={`font-medium ${color}`}>{pct}%</span>;
}
