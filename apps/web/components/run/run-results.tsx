'use client';

import * as React from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  FileDown,
  AlertCircle,
  Image,
  Video,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { cn } from '../../lib/utils';
import { formatDateTime } from '../../lib/utils';
import type {
  RunDetail,
  TestResult,
  TestResultsByCategory,
  RunTimelineEvent,
} from '../../types/run';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatDuration(seconds: number | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------

function SummaryCards({ run }: { run: RunDetail }) {
  const passRate =
    run.totalTests > 0
      ? Math.round((run.passedTests / run.totalTests) * 100)
      : 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card>
        <CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold tabular-nums">{run.totalTests}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Total Tests</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-green-600">
            {run.passedTests}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Passed</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 text-center">
          <div
            className={cn(
              'text-2xl font-bold tabular-nums',
              run.failedTests > 0 ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {run.failedTests}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Failed</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 text-center">
          <div
            className={cn(
              'text-2xl font-bold tabular-nums',
              passRate >= 90
                ? 'text-green-600'
                : passRate >= 70
                  ? 'text-yellow-600'
                  : 'text-destructive',
            )}
          >
            {passRate}%
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Pass Rate</div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual test result row
// ---------------------------------------------------------------------------

function TestResultRow({ result }: { result: TestResult }) {
  const [expanded, setExpanded] = React.useState(false);
  const hasFailed = result.status === 'failed';
  const hasDetails = hasFailed && Boolean(result.error ?? result.screenshot ?? result.videoClip);

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm',
          hasDetails && 'cursor-pointer hover:bg-muted/50',
        )}
        onClick={() => hasDetails && setExpanded((v) => !v)}
      >
        {result.status === 'passed' ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
        ) : result.status === 'failed' ? (
          <XCircle className="h-4 w-4 shrink-0 text-destructive" />
        ) : (
          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        <span className="flex-1 font-medium">{result.testName}</span>
        <span className="text-xs text-muted-foreground">{formatMs(result.duration)}</span>

        {hasDetails && (
          <span className="text-muted-foreground">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
        )}
      </button>

      {expanded && hasDetails && (
        <div className="border-t bg-muted/30 px-4 py-3 space-y-3 text-sm">
          {result.error && (
            <div className="flex items-start gap-2 text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <pre className="whitespace-pre-wrap font-mono text-xs">{result.error}</pre>
            </div>
          )}
          {result.screenshot && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Image className="h-4 w-4" />
              <a
                href={result.screenshot}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground text-xs"
              >
                View screenshot
              </a>
            </div>
          )}
          {result.videoClip && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Video className="h-4 w-4" />
              <a
                href={result.videoClip}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground text-xs"
              >
                View video clip
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results by category tab
// ---------------------------------------------------------------------------

function CategoryResults({ category }: { category: TestResultsByCategory }) {
  const passRate =
    category.total > 0
      ? Math.round((category.passed / category.total) * 100)
      : 0;

  return (
    <div className="space-y-3">
      {/* Category header */}
      <div className="flex items-center gap-3">
        <h4 className="font-medium capitalize">{category.category}</h4>
        <Badge variant={category.failed > 0 ? 'destructive' : 'success'}>
          {passRate}% pass
        </Badge>
        <span className="text-xs text-muted-foreground">
          {category.passed}/{category.total} passed
        </span>
      </div>

      {/* Test rows */}
      <div className="space-y-1.5">
        {category.results.map((result) => (
          <TestResultRow key={result.id} result={result} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline tab
// ---------------------------------------------------------------------------

function Timeline({ events }: { events: RunTimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">No timeline events.</p>
    );
  }

  return (
    <ol className="relative border-l border-border ml-3 space-y-4">
      {events.map((ev) => (
        <li key={ev.id} className="pl-6">
          <span className="absolute -left-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background" />
          <time className="text-xs text-muted-foreground">
            {formatDateTime(ev.timestamp)}
          </time>
          <p className="text-sm font-medium mt-0.5">{ev.event}</p>
          {ev.agentName && (
            <p className="text-xs text-muted-foreground">Agent: {ev.agentName}</p>
          )}
          {ev.details && (
            <p className="text-xs text-muted-foreground mt-0.5">{ev.details}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

function exportAsHtml(run: RunDetail): void {
  const passRate =
    run.totalTests > 0
      ? Math.round((run.passedTests / run.totalTests) * 100)
      : 0;

  const rows = run.resultsByCategory
    .flatMap((c) => c.results)
    .map(
      (r) =>
        `<tr><td>${r.testName}</td><td>${r.category}</td><td>${r.status}</td><td>${formatMs(r.duration)}</td><td>${r.error ?? ''}</td></tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Run Report ${run.id}</title></head><body>
<h1>Test Run Report</h1>
<p>Run ID: ${run.id}</p>
<p>Status: ${run.status}</p>
<p>Pass Rate: ${passRate}%</p>
<p>Total: ${run.totalTests} | Passed: ${run.passedTests} | Failed: ${run.failedTests}</p>
<table border="1" cellpadding="6" cellspacing="0">
<thead><tr><th>Test</th><th>Category</th><th>Status</th><th>Duration</th><th>Error</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `run-report-${run.id.slice(0, 8)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface RunResultsProps {
  run: RunDetail;
  className?: string;
}

/**
 * Detailed run results view with:
 * - Summary stat cards
 * - Results by category (expandable test rows)
 * - Timeline of execution events
 * - Agent execution summary
 * - Export as HTML
 */
export function RunResults({ run, className }: RunResultsProps) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Summary */}
      <SummaryCards run={run} />

      {/* Meta info */}
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        {run.profile && (
          <span>
            Profile:{' '}
            <span className="font-medium text-foreground">{run.profile.name}</span>
          </span>
        )}
        {run.startedAt && (
          <span>
            Started:{' '}
            <span className="font-medium text-foreground">
              {formatDateTime(run.startedAt)}
            </span>
          </span>
        )}
        {run.completedAt && (
          <span>
            Completed:{' '}
            <span className="font-medium text-foreground">
              {formatDateTime(run.completedAt)}
            </span>
          </span>
        )}
        {run.duration != null && (
          <span>
            Duration:{' '}
            <span className="font-medium text-foreground">
              {formatDuration(run.duration)}
            </span>
          </span>
        )}

        {/* Export button */}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-7 gap-1 text-xs"
          onClick={() => exportAsHtml(run)}
        >
          <FileDown className="h-3.5 w-3.5" />
          Export HTML
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="results">
        <TabsList>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
        </TabsList>

        {/* Results by category */}
        <TabsContent value="results" className="space-y-6 pt-4">
          {run.resultsByCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No test results available.
            </p>
          ) : (
            run.resultsByCategory.map((cat) => (
              <CategoryResults key={cat.category} category={cat} />
            ))
          )}
        </TabsContent>

        {/* Timeline */}
        <TabsContent value="timeline" className="pt-4">
          <Timeline events={run.timeline} />
        </TabsContent>

        {/* Agent summary */}
        <TabsContent value="agents" className="pt-4">
          <div className="space-y-3">
            {run.agents.map((agent) => (
              <Card key={agent.name}>
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{agent.label}</CardTitle>
                    <Badge
                      variant={
                        agent.status === 'completed'
                          ? 'success'
                          : agent.status === 'failed'
                            ? 'destructive'
                            : agent.status === 'running'
                              ? 'default'
                              : 'secondary'
                      }
                    >
                      {agent.status}
                    </Badge>
                  </div>
                </CardHeader>
                {(agent.message ?? agent.error ?? agent.progress != null) && (
                  <CardContent className="pt-0 pb-3 px-4 text-sm text-muted-foreground space-y-1">
                    {agent.progress != null && agent.total != null && (
                      <p>
                        {agent.progress}/{agent.total} processed
                      </p>
                    )}
                    {agent.message && <p>{agent.message}</p>}
                    {agent.error && (
                      <p className="text-destructive">{agent.error}</p>
                    )}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
