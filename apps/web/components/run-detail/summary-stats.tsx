'use client';

import * as React from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
  Clock,
  Activity,
  Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';
import type { RunSummary, RunStatus } from '../../types/run';

/** Formats milliseconds as a human-readable duration string. */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
}

const STATUS_CONFIG: Record<
  RunStatus,
  { label: string; className: string; variant: 'success' | 'destructive' | 'warning' | 'secondary' | 'default' }
> = {
  queued: { label: 'Queued', className: 'text-muted-foreground', variant: 'secondary' },
  running: { label: 'Running', className: 'text-blue-600', variant: 'default' },
  passed: { label: 'Passed', className: 'text-green-600', variant: 'success' },
  failed: { label: 'Failed', className: 'text-red-600', variant: 'destructive' },
  cancelled: { label: 'Cancelled', className: 'text-muted-foreground', variant: 'secondary' },
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  className?: string;
}

function StatCard({ icon, label, value, className }: StatCardProps) {
  return (
    <div className={cn('flex flex-col gap-1 rounded-lg border bg-card p-4', className)}>
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

interface SummaryStatsProps {
  summary: RunSummary;
  status: RunStatus;
  triggeredAt: string;
  completedAt?: string;
  /** When true, shows an animated pulse to indicate ongoing run */
  isLive?: boolean;
}

/**
 * Displays the overall statistics for a test run: total, passed, failed,
 * warnings, skipped counts, duration, and current run status.
 */
export function SummaryStats({
  summary,
  status,
  triggeredAt,
  completedAt,
  isLive = false,
}: SummaryStatsProps) {
  const statusConfig = STATUS_CONFIG[status];
  const passRate = summary.total > 0 ? Math.round((summary.passed / summary.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Badge variant={statusConfig.variant}>
            {status === 'running' && (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            )}
            {statusConfig.label}
          </Badge>
          {isLive && status === 'running' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-blue-600">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            Triggered:{' '}
            <time dateTime={triggeredAt}>
              {new Date(triggeredAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </span>
          {completedAt && (
            <span>
              Completed:{' '}
              <time dateTime={completedAt}>
                {new Date(completedAt).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </span>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Total"
          value={summary.total}
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
          label="Passed"
          value={summary.passed}
          className="border-green-100"
        />
        <StatCard
          icon={<XCircle className="h-4 w-4 text-red-500" />}
          label="Failed"
          value={summary.failed}
          className={cn(summary.failed > 0 && 'border-red-100')}
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4 text-yellow-500" />}
          label="Warnings"
          value={summary.warnings}
          className={cn(summary.warnings > 0 && 'border-yellow-100')}
        />
        <StatCard
          icon={<MinusCircle className="h-4 w-4 text-muted-foreground" />}
          label="Skipped"
          value={summary.skipped}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Duration"
          value={formatDuration(summary.duration)}
        />
      </div>

      {/* Pass rate bar */}
      {summary.total > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pass rate</span>
            <span className="font-medium">{passRate}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                passRate === 100
                  ? 'bg-green-500'
                  : passRate >= 80
                    ? 'bg-yellow-500'
                    : 'bg-red-500',
              )}
              style={{ width: `${passRate}%` }}
              role="progressbar"
              aria-valuenow={passRate}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      )}
    </div>
  );
}
