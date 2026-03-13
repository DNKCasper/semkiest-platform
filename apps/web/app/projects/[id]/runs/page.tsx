'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import { FilterBar } from '../../../../components/run-history/filter-bar';
import { RunTable } from '../../../../components/run-history/run-table';
import { ComparisonView } from '../../../../components/run-history/comparison-view';
import { runsApi, RunsApiClientError } from '../../../../lib/runs-api-client';
import type {
  TestRun,
  RunFilters,
  RunSortField,
  SortDirection,
  RunTrendPoint,
} from '../../../../types/run';

/** Recharts requires browser APIs — import the chart only on the client. */
const TrendChart = dynamic(
  () =>
    import('../../../../components/run-history/trend-chart').then(
      (m) => m.TrendChart,
    ),
  { ssr: false, loading: () => <div className="h-40 animate-pulse bg-muted rounded" /> },
);

const PAGE_SIZE = 20;

const DEFAULT_FILTERS: RunFilters = {
  status: 'all',
  triggerType: 'all',
};

export default function RunHistoryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  // Filter / sort / page state
  const [filters, setFilters] = React.useState<RunFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = React.useState<RunSortField>('startedAt');
  const [sortDir, setSortDir] = React.useState<SortDirection>('desc');
  const [page, setPage] = React.useState(1);

  // Runs data
  const [runs, setRuns] = React.useState<TestRun[]>([]);
  const [total, setTotal] = React.useState(0);
  const [runsLoading, setRunsLoading] = React.useState(true);
  const [runsError, setRunsError] = React.useState<string | null>(null);

  // Trend data
  const [trendData, setTrendData] = React.useState<RunTrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = React.useState(true);

  // Comparison
  const [selectedRunIds, setSelectedRunIds] = React.useState<string[]>([]);
  const [comparisonIds, setComparisonIds] = React.useState<
    [string, string] | null
  >(null);

  // Fetch runs whenever filters, sort, or page changes
  React.useEffect(() => {
    let cancelled = false;
    setRunsLoading(true);
    setRunsError(null);

    runsApi
      .list(projectId, {
        ...filters,
        sort,
        sortDir,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((res) => {
        if (!cancelled) {
          setRuns(res.data);
          setTotal(res.total);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message =
            err instanceof RunsApiClientError
              ? err.error.message
              : 'Failed to load test runs.';
          setRunsError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setRunsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, filters, sort, sortDir, page]);

  // Fetch trend data once on mount
  React.useEffect(() => {
    let cancelled = false;
    setTrendLoading(true);

    runsApi
      .trend(projectId)
      .then((res) => {
        if (!cancelled) setTrendData(res.data);
      })
      .catch(() => {
        // Trend is non-critical; silently ignore errors
      })
      .finally(() => {
        if (!cancelled) setTrendLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function handleFiltersChange(next: RunFilters) {
    setFilters(next);
    setPage(1); // Reset to first page on filter change
    setSelectedRunIds([]);
  }

  function handleSortChange(nextSort: RunSortField, nextDir: SortDirection) {
    setSort(nextSort);
    setSortDir(nextDir);
    setPage(1);
    setSelectedRunIds([]);
  }

  function handleSelectRun(id: string) {
    setSelectedRunIds((prev) => {
      if (prev.includes(id)) return prev.filter((r) => r !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  }

  function handleCompare(ids: [string, string]) {
    setComparisonIds(ids);
  }

  function handleCloseComparison() {
    setComparisonIds(null);
    setSelectedRunIds([]);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back navigation */}
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/projects/${projectId}`)}
            className="flex items-center gap-2 -ml-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to project
          </Button>
        </div>

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Test Run History</h1>
          <p className="mt-1 text-muted-foreground">
            View, filter, and compare all test runs for this project.
          </p>
        </div>

        {/* Trend chart */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pass Rate Trend</CardTitle>
            <CardDescription>Last 10 runs</CardDescription>
          </CardHeader>
          <CardContent>
            {trendLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <TrendChart data={trendData} />
            )}
          </CardContent>
        </Card>

        {/* Comparison view */}
        {comparisonIds && (
          <div className="mb-6">
            <ComparisonView
              projectId={projectId}
              runIds={comparisonIds}
              onClose={handleCloseComparison}
            />
          </div>
        )}

        {/* Filters */}
        <Card className="mb-4">
          <CardContent className="pt-6">
            <FilterBar
              filters={filters}
              sort={sort}
              sortDir={sortDir}
              onFiltersChange={handleFiltersChange}
              onSortChange={handleSortChange}
            />
          </CardContent>
        </Card>

        {/* Runs table */}
        <Card>
          <CardContent className="pt-6">
            {runsLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading test runs…</span>
              </div>
            ) : runsError ? (
              <div className="flex items-center gap-2 py-10 text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">{runsError}</span>
              </div>
            ) : (
              <RunTable
                runs={runs}
                total={total}
                page={page}
                pageSize={PAGE_SIZE}
                sort={sort}
                sortDir={sortDir}
                selectedRunIds={selectedRunIds}
                onPageChange={setPage}
                onSortChange={handleSortChange}
                onSelectRun={handleSelectRun}
                onCompare={handleCompare}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
