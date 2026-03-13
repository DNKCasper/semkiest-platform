'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { StatusBadge } from './ApprovalActions';
import type { BaselineSummary, BatchApprovalItemResult } from './types';

// ─── Selection Checkbox Row ───────────────────────────────────────────────────

interface BaselineRowProps {
  baseline: BaselineSummary;
  selected: boolean;
  onToggle: (id: string) => void;
}

function BaselineRow({ baseline, selected, onToggle }: BaselineRowProps) {
  const diffPct = baseline.diffPercentage;

  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 transition-colors',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:bg-muted/50',
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(baseline.id)}
        className="h-4 w-4 rounded border-border accent-primary"
        aria-label={`Select ${baseline.componentName} (${baseline.viewport})`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-foreground">
            {baseline.componentName}
          </span>
          <Badge variant="outline" className="font-mono text-xs">
            {baseline.viewport}
          </Badge>
          <Badge variant="outline" className="font-mono text-xs">
            v{baseline.version}
          </Badge>
        </div>
        {diffPct !== undefined && (
          <span
            className={cn(
              'mt-0.5 block text-xs',
              diffPct === 0 && 'text-green-600 dark:text-green-400',
              diffPct > 0 && diffPct <= 1 && 'text-yellow-600 dark:text-yellow-400',
              diffPct > 1 && 'text-red-600 dark:text-red-400',
            )}
          >
            {diffPct.toFixed(3)}% diff
          </span>
        )}
      </div>
      <StatusBadge status={baseline.status} />
    </label>
  );
}

// ─── Batch Result Summary ─────────────────────────────────────────────────────

interface BatchResultSummaryProps {
  results: BatchApprovalItemResult[];
  action: 'approve' | 'reject';
  baselines: BaselineSummary[];
}

function BatchResultSummary({
  results,
  action,
  baselines,
}: BatchResultSummaryProps) {
  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);
  const actionLabel = action === 'approve' ? 'approved' : 'rejected';

  return (
    <div className="rounded-md border border-border bg-muted/30 p-4">
      <p className="mb-2 font-medium">
        {successes.length} baseline{successes.length !== 1 ? 's' : ''}{' '}
        {actionLabel} successfully.
        {failures.length > 0 && (
          <span className="ml-1 text-destructive">
            {failures.length} failed.
          </span>
        )}
      </p>
      {failures.length > 0 && (
        <ul className="space-y-1 text-sm text-destructive">
          {failures.map((f) => {
            const b = baselines.find((bl) => bl.id === f.baselineId);
            return (
              <li key={f.baselineId}>
                {b ? `${b.componentName} (${b.viewport})` : f.baselineId}:{' '}
                {f.error}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── BatchApproval ────────────────────────────────────────────────────────────

export interface BatchApprovalProps {
  /** List of baselines available for batch selection. */
  baselines: BaselineSummary[];
  /** Called when the user submits a batch approve. Returns item results. */
  onBatchApprove: (
    ids: string[],
  ) => Promise<{ results: BatchApprovalItemResult[] }>;
  /** Called when the user submits a batch reject. Returns item results. */
  onBatchReject: (
    ids: string[],
  ) => Promise<{ results: BatchApprovalItemResult[] }>;
  className?: string;
}

/**
 * Batch approval / rejection component.
 *
 * Renders a selectable list of baselines and Approve All / Reject All buttons.
 * Supports select-all / deselect-all and shows per-item result feedback.
 *
 * @example
 * ```tsx
 * <BatchApproval
 *   baselines={pendingBaselines}
 *   onBatchApprove={handleBatchApprove}
 *   onBatchReject={handleBatchReject}
 * />
 * ```
 */
export function BatchApproval({
  baselines,
  onBatchApprove,
  onBatchReject,
  className,
}: BatchApprovalProps) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = React.useState<
    'approve' | 'reject' | null
  >(null);
  const [lastResults, setLastResults] = React.useState<{
    results: BatchApprovalItemResult[];
    action: 'approve' | 'reject';
  } | null>(null);

  const allSelected =
    baselines.length > 0 && selected.size === baselines.length;
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(baselines.map((b) => b.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleBatch(action: 'approve' | 'reject') {
    if (!someSelected || isProcessing) return;
    setIsProcessing(action);
    setLastResults(null);
    try {
      const ids = Array.from(selected);
      const response =
        action === 'approve'
          ? await onBatchApprove(ids)
          : await onBatchReject(ids);
      setLastResults({ results: response.results, action });
      // Remove successfully processed items from selection
      const failedIds = new Set(
        response.results.filter((r) => !r.success).map((r) => r.baselineId),
      );
      setSelected(failedIds);
    } finally {
      setIsProcessing(null);
    }
  }

  if (baselines.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
        No baselines available for batch review.
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="h-4 w-4 rounded border-border accent-primary"
            aria-label={allSelected ? 'Deselect all' : 'Select all'}
          />
          <span className="text-muted-foreground">
            {someSelected
              ? `${selected.size} of ${baselines.length} selected`
              : 'Select all'}
          </span>
        </label>

        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
            disabled={!someSelected || isProcessing !== null}
            onClick={() => handleBatch('reject')}
          >
            {isProcessing === 'reject'
              ? `Rejecting ${selected.size}...`
              : `Reject ${someSelected ? selected.size : ''} Selected`}
          </Button>
          <Button
            disabled={!someSelected || isProcessing !== null}
            onClick={() => handleBatch('approve')}
          >
            {isProcessing === 'approve'
              ? `Approving ${selected.size}...`
              : `Approve ${someSelected ? selected.size : ''} Selected`}
          </Button>
        </div>
      </div>

      {/* Baseline list */}
      <div className="flex flex-col gap-2">
        {baselines.map((baseline) => (
          <BaselineRow
            key={baseline.id}
            baseline={baseline}
            selected={selected.has(baseline.id)}
            onToggle={toggleOne}
          />
        ))}
      </div>

      {/* Result summary */}
      {lastResults && (
        <BatchResultSummary
          results={lastResults.results}
          action={lastResults.action}
          baselines={baselines}
        />
      )}
    </div>
  );
}
