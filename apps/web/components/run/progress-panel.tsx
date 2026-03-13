'use client';

import * as React from 'react';
import { AlertCircle, Loader2, CheckCircle2, XCircle, WifiOff } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { cn } from '../../lib/utils';
import type { TestRun, RunStatus } from '../../types/run';
import type { ConnectionState } from '../../lib/websocket-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function estimateSecondsRemaining(run: TestRun): number | null {
  if (!run.startedAt || run.completedTests === 0) return null;
  const elapsed = (Date.now() - new Date(run.startedAt).getTime()) / 1000;
  const rate = run.completedTests / elapsed; // tests per second
  if (rate === 0) return null;
  const remaining = (run.totalTests - run.completedTests) / rate;
  return Math.max(0, Math.round(remaining));
}

function statusDetails(status: RunStatus): {
  label: string;
  variant: 'default' | 'secondary' | 'success' | 'destructive' | 'warning';
  icon: React.ReactNode;
} {
  switch (status) {
    case 'initializing':
      return {
        label: 'Initializing',
        variant: 'warning',
        icon: <Loader2 className="h-4 w-4 animate-spin" />,
      };
    case 'running':
      return {
        label: 'In Progress',
        variant: 'default',
        icon: <Loader2 className="h-4 w-4 animate-spin" />,
      };
    case 'completed':
      return {
        label: 'Completed',
        variant: 'success',
        icon: <CheckCircle2 className="h-4 w-4" />,
      };
    case 'failed':
      return {
        label: 'Failed',
        variant: 'destructive',
        icon: <AlertCircle className="h-4 w-4" />,
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        variant: 'secondary',
        icon: <XCircle className="h-4 w-4" />,
      };
    default:
      return {
        label: 'Pending',
        variant: 'secondary',
        icon: <Loader2 className="h-4 w-4" />,
      };
  }
}

function ConnectionIndicator({ state }: { state: ConnectionState }) {
  if (state === 'connected') return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <WifiOff className="h-3.5 w-3.5" />
      {state === 'connecting' && 'Reconnecting…'}
      {state === 'disconnected' && 'Disconnected'}
      {state === 'failed' && 'Connection failed — data may be stale'}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface ProgressPanelProps {
  run: TestRun;
  connectionState?: ConnectionState;
  onCancel?: () => void;
  className?: string;
}

/**
 * Real-time progress panel for an active test run.
 * Shows overall status, a progress bar, test counts, and estimated time remaining.
 */
export function ProgressPanel({
  run,
  connectionState = 'disconnected',
  onCancel,
  className,
}: ProgressPanelProps) {
  const { label, variant, icon } = statusDetails(run.status);

  const progressPct =
    run.totalTests > 0 ? Math.min(100, Math.round((run.completedTests / run.totalTests) * 100)) : 0;

  const isActive = run.status === 'running' || run.status === 'initializing';
  const estimatedRemaining = isActive ? estimateSecondsRemaining(run) : null;

  const duration =
    run.duration != null
      ? run.duration
      : run.startedAt
        ? (Date.now() - new Date(run.startedAt).getTime()) / 1000
        : null;

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Test Run Progress</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={variant} className="flex items-center gap-1">
              {icon}
              {label}
            </Badge>
            {isActive && onCancel && (
              <Button
                variant="destructive"
                size="sm"
                onClick={onCancel}
                className="h-7 px-2 text-xs"
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
        <ConnectionIndicator state={connectionState} />
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {run.completedTests} / {run.totalTests} tests
            </span>
            <span className="font-medium">{progressPct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-500 rounded-full',
                run.status === 'failed' ? 'bg-destructive' : 'bg-primary',
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total" value={run.totalTests} />
          <StatCard label="Completed" value={run.completedTests} />
          <StatCard label="Passed" value={run.passedTests} highlight="success" />
          <StatCard label="Failed" value={run.failedTests} highlight="error" />
        </div>

        {/* Time info */}
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {duration != null && (
            <span>
              <span className="font-medium text-foreground">{formatDuration(duration)}</span> elapsed
            </span>
          )}
          {estimatedRemaining != null && (
            <span>
              <span className="font-medium text-foreground">
                ~{formatDuration(estimatedRemaining)}
              </span>{' '}
              remaining
            </span>
          )}
          {run.profile && (
            <span>
              Profile:{' '}
              <span className="font-medium text-foreground">{run.profile.name}</span>
            </span>
          )}
        </div>

        {/* Error message */}
        {run.error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {run.error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helper sub-component
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: 'success' | 'error';
}) {
  return (
    <div className="rounded-md border bg-card p-3 text-center">
      <div
        className={cn(
          'text-2xl font-bold tabular-nums',
          highlight === 'success' && value > 0 && 'text-green-600',
          highlight === 'error' && value > 0 && 'text-destructive',
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
