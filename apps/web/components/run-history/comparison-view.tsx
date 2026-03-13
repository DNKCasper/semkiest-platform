'use client';

import * as React from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import type { TestRun } from '../../types/run';
import { runsApi, RunsApiClientError } from '../../lib/runs-api-client';
import { formatDateTime, formatPassRate } from '../../lib/utils';

export interface ComparisonViewProps {
  projectId: string;
  runIds: [string, string];
  onClose: () => void;
}

interface MetricRowProps {
  label: string;
  valueA: string | number;
  valueB: string | number;
  /** Higher value is better (used for diff colouring). Defaults to true. */
  higherIsBetter?: boolean;
}

function MetricRow({
  label,
  valueA,
  valueB,
  higherIsBetter = true,
}: MetricRowProps) {
  const numA = typeof valueA === 'number' ? valueA : parseFloat(String(valueA));
  const numB = typeof valueB === 'number' ? valueB : parseFloat(String(valueB));
  const hasNumericDiff = !isNaN(numA) && !isNaN(numB);

  let diffClass = '';
  if (hasNumericDiff && numA !== numB) {
    const aIsBetter = higherIsBetter ? numA > numB : numA < numB;
    diffClass = aIsBetter ? 'text-green-600 font-medium' : 'text-red-600 font-medium';
  }

  let diffClassB = '';
  if (hasNumericDiff && numA !== numB) {
    const bIsBetter = higherIsBetter ? numB > numA : numB < numA;
    diffClassB = bIsBetter ? 'text-green-600 font-medium' : 'text-red-600 font-medium';
  }

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-4 py-2 border-b last:border-0 items-center">
      <span className={diffClass}>{String(valueA)}</span>
      <span className="text-xs text-muted-foreground text-center whitespace-nowrap px-2">
        {label}
      </span>
      <span className={`text-right ${diffClassB}`}>{String(valueB)}</span>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/**
 * ComparisonView fetches two runs and displays them side-by-side,
 * highlighting metric differences to aid diagnosis.
 */
export function ComparisonView({
  projectId,
  runIds,
  onClose,
}: ComparisonViewProps) {
  const [runA, setRunA] = React.useState<TestRun | null>(null);
  const [runB, setRunB] = React.useState<TestRun | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchRuns() {
      setLoading(true);
      setError(null);
      try {
        const [a, b] = await Promise.all([
          runsApi.get(projectId, runIds[0]),
          runsApi.get(projectId, runIds[1]),
        ]);
        if (!cancelled) {
          setRunA(a);
          setRunB(b);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof RunsApiClientError
              ? err.error.message
              : 'Failed to load runs for comparison.';
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchRuns();
    return () => {
      cancelled = true;
    };
  }, [projectId, runIds]);

  return (
    <Card className="border-2">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-base">Run Comparison</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
          <span className="sr-only">Close comparison</span>
        </Button>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading runs…</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 py-6 text-destructive">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {!loading && !error && runA && runB && (
          <div className="space-y-4">
            {/* Run headers */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
              <RunHeader run={runA} label="Run A" />
              <span className="text-xs font-medium text-muted-foreground px-2">
                vs
              </span>
              <RunHeader run={runB} label="Run B" align="right" />
            </div>

            <hr />

            {/* Metric comparisons */}
            <div className="text-sm">
              <MetricRow
                label="Total tests"
                valueA={runA.totalTests}
                valueB={runB.totalTests}
              />
              <MetricRow
                label="Passed"
                valueA={runA.passedTests}
                valueB={runB.passedTests}
              />
              <MetricRow
                label="Failed"
                valueA={runA.failedTests}
                valueB={runB.failedTests}
                higherIsBetter={false}
              />
              <MetricRow
                label="Skipped"
                valueA={runA.skippedTests}
                valueB={runB.skippedTests}
                higherIsBetter={false}
              />
              <MetricRow
                label="Pass rate"
                valueA={formatPassRate(runA.passRate)}
                valueB={formatPassRate(runB.passRate)}
              />
              <MetricRow
                label="Duration"
                valueA={formatDuration(runA.duration)}
                valueB={formatDuration(runB.duration)}
                higherIsBetter={false}
              />
              <MetricRow
                label="Trigger"
                valueA={runA.triggerType}
                valueB={runB.triggerType}
              />
              {(runA.branch ?? runB.branch) && (
                <MetricRow
                  label="Branch"
                  valueA={runA.branch ?? '—'}
                  valueB={runB.branch ?? '—'}
                />
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface RunHeaderProps {
  run: TestRun;
  label: string;
  align?: 'left' | 'right';
}

function RunHeader({ run, label, align = 'left' }: RunHeaderProps) {
  const alignClass = align === 'right' ? 'text-right' : 'text-left';
  const STATUS_BADGE_VARIANTS = {
    passed: 'success',
    failed: 'destructive',
    mixed: 'warning',
    running: 'secondary',
    cancelled: 'outline',
  } as const;

  return (
    <div className={`space-y-1 ${alignClass}`}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <Badge variant={STATUS_BADGE_VARIANTS[run.status] ?? 'outline'}>
        {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
      </Badge>
      <p className="text-xs text-muted-foreground">
        {formatDateTime(run.startedAt)}
      </p>
    </div>
  );
}
