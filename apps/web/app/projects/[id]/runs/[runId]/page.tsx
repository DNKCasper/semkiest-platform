'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  User,
  Calendar,
  Loader2,
} from 'lucide-react';
import { runsApi } from '../../../../../lib/runs-api-client';
import { useRunWebSocket } from '../../../../../hooks/use-run-websocket';
import { SummaryStats } from '../../../../../components/run-detail/summary-stats';
import { CategorySection } from '../../../../../components/run-detail/category-section';
import { Button } from '../../../../../components/ui/button';
import { Badge } from '../../../../../components/ui/badge';
import type { TestRun, CategoryResults, TestCategory } from '../../../../../types/run';

/** Canonical category order for display. */
const CATEGORY_ORDER: TestCategory[] = [
  'ui',
  'visual',
  'performance',
  'accessibility',
  'security',
  'api',
];

const TRIGGER_LABEL: Record<string, string> = {
  manual: 'Manual',
  scheduled: 'Scheduled',
  ci: 'CI/CD',
};

/** Sorts categories by CATEGORY_ORDER, placing unknown ones at the end. */
function sortCategories(categories: CategoryResults[]): CategoryResults[] {
  return [...categories].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category);
    const bi = CATEGORY_ORDER.indexOf(b.category);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

export default function RunDetailPage() {
  const params = useParams<{ id: string; runId: string }>();
  const router = useRouter();
  const { id: projectId, runId } = params;

  const [run, setRun] = React.useState<TestRun | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const { isConnected, runStatus, runSummary } = useRunWebSocket(runId);

  const fetchRun = React.useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const data = await runsApi.get(projectId, runId);
      setRun(data);
    } catch (err) {
      // Only set error on initial load — silently ignore polling errors
      if (showLoading) {
        setError(err instanceof Error ? err.message : 'Failed to load test run.');
      }
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [projectId, runId]);

  React.useEffect(() => {
    void fetchRun(true); // Initial load shows loading state
  }, [fetchRun]);

  // Polling fallback: refetch every 5s when run is still active and WS is not connected
  const displayStatus = runStatus ?? run?.status ?? 'queued';
  const isRunActive = ['queued', 'pending', 'initializing', 'running'].includes(displayStatus);

  React.useEffect(() => {
    if (!isRunActive) return;
    // If WebSocket is connected, no need to poll
    if (isConnected) return;

    const interval = setInterval(() => {
      void fetchRun();
    }, 5000);

    return () => clearInterval(interval);
  }, [isRunActive, isConnected, fetchRun]);

  // Derive display data: prefer WebSocket live values when available
  const displaySummary = runSummary ?? run?.summary ?? null;
  const isLive = displayStatus === 'running';

  const categories = React.useMemo(() => {
    if (!run) return [];
    return sortCategories(run.categories ?? []);
  }, [run]);

  // ─── Loading state ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading test run…</p>
        </div>
      </div>
    );
  }

  // ─── Error state ─────────────────────────────────────────────────────────────
  if (error || !run) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md w-full rounded-lg border border-red-200 bg-red-50 p-6 space-y-4">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <h2 className="font-semibold">Failed to load test run</h2>
          </div>
          <p className="text-sm text-red-600">{error ?? 'Run not found.'}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Go back
            </Button>
            <Button size="sm" onClick={() => void fetchRun(false)}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main view ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Page header */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="-ml-2"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-semibold text-sm truncate">
                Run{' '}
                <span className="font-mono text-muted-foreground text-xs">
                  {run.id.slice(0, 8)}
                </span>
              </h1>
              <Badge variant="outline" className="text-xs">
                {TRIGGER_LABEL[run.triggerType] ?? run.triggerType}
              </Badge>
              <Badge
                variant={
                  displayStatus === 'passed' || displayStatus === 'completed' ? 'default' :
                  displayStatus === 'failed' ? 'destructive' :
                  displayStatus === 'running' ? 'default' :
                  'secondary'
                }
                className={`text-xs ${
                  displayStatus === 'passed' || displayStatus === 'completed' ? 'bg-green-600' :
                  displayStatus === 'running' ? 'bg-blue-600' :
                  ''
                }`}
              >
                {isRunActive && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
              </Badge>
            </div>
            <div className="flex items-center gap-4 mt-0.5 text-xs text-muted-foreground flex-wrap">
              {run.triggeredBy && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {run.triggeredBy}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(run.triggeredAt).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {isConnected && (
                <span className="flex items-center gap-1 text-blue-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
                  Live
                </span>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchRun(false)}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Summary statistics */}
        {displaySummary && (
          <section aria-label="Run summary">
            <SummaryStats
              summary={displaySummary}
              status={displayStatus}
              triggeredAt={run.triggeredAt}
              completedAt={run.completedAt}
              isLive={isLive}
            />
          </section>
        )}

        {/* Category sections */}
        <section aria-label="Test results by category">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Results by Category
          </h2>
          {categories.length === 0 ? (
            <div className="rounded-lg border bg-muted/20 p-8 text-center">
              {isRunActive ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {displayStatus === 'queued' || displayStatus === 'pending'
                      ? 'Test run is queued… waiting for a worker to pick it up.'
                      : displayStatus === 'initializing'
                        ? 'Test run is initializing… setting up the test environment.'
                        : 'Tests are running… results will appear here as they complete.'}
                  </p>
                  {!isConnected && (
                    <p className="text-xs text-muted-foreground">
                      Polling for updates every 5 seconds.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No test results available for this run.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {categories.map((cat) => (
                <CategorySection
                  key={cat.category}
                  category={cat}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
