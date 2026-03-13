'use client';

import * as React from 'react';
import { Check, X, CheckSquare, Square, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { approvalApi } from '../../lib/approval-api-client';
import type { VisualTestResult, ApprovalStatus } from './types';

export interface BatchApprovalProps {
  /** List of visual test results to display */
  results: VisualTestResult[];
  /** Called after any batch status change with the updated result IDs and new status */
  onBatchStatusChange?: (ids: string[], status: ApprovalStatus) => void;
  /** Called when an API error occurs */
  onError?: (message: string) => void;
  /** Called when a row thumbnail is clicked */
  onResultSelect?: (result: VisualTestResult) => void;
  /** Additional CSS classes */
  className?: string;
}

type BatchActionState = 'idle' | 'approving' | 'rejecting';

const STATUS_BADGE: Record<ApprovalStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

/**
 * BatchApproval renders a list of visual test results with checkboxes,
 * allowing the user to select multiple results and approve or reject them
 * in a single API call.
 */
export function BatchApproval({
  results,
  onBatchStatusChange,
  onError,
  onResultSelect,
  className,
}: BatchApprovalProps) {
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [actionState, setActionState] = React.useState<BatchActionState>('idle');
  const [localStatuses, setLocalStatuses] = React.useState<Map<string, ApprovalStatus>>(
    new Map(results.map((r) => [r.id, r.status])),
  );
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Keep localStatuses in sync when results prop changes
  React.useEffect(() => {
    setLocalStatuses(new Map(results.map((r) => [r.id, r.status])));
  }, [results]);

  const isLoading = actionState !== 'idle';
  const allSelected = results.length > 0 && selectedIds.size === results.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map((r) => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const executeBatch = async (status: 'approved' | 'rejected') => {
    if (selectedIds.size === 0 || isLoading) return;
    setErrorMessage(null);
    setActionState(status === 'approved' ? 'approving' : 'rejecting');

    const ids = Array.from(selectedIds);

    try {
      await approvalApi.batchUpdate({ ids, status });

      // Update local status map optimistically
      setLocalStatuses((prev) => {
        const next = new Map(prev);
        ids.forEach((id) => next.set(id, status));
        return next;
      });
      setSelectedIds(new Set());
      onBatchStatusChange?.(ids, status);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to ${status} selected items`;
      setErrorMessage(message);
      onError?.(message);
    } finally {
      setActionState('idle');
    }
  };

  const pendingCount = results.filter((r) => localStatuses.get(r.id) === 'pending').length;
  const approvedCount = results.filter((r) => localStatuses.get(r.id) === 'approved').length;
  const rejectedCount = results.filter((r) => localStatuses.get(r.id) === 'rejected').length;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Summary bar */}
      <div className="flex items-center justify-between rounded-lg border bg-card p-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </span>
          <span className="text-yellow-600 dark:text-yellow-400">
            {pendingCount} pending
          </span>
          <span className="text-green-600 dark:text-green-400">
            {approvedCount} approved
          </span>
          <span className="text-red-600 dark:text-red-400">
            {rejectedCount} rejected
          </span>
        </div>

        {/* Batch action buttons */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} selected
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => executeBatch('approved')}
              disabled={isLoading}
              aria-label={`Approve ${selectedIds.size} selected results`}
              className="border-green-600 text-green-700 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-900/20"
            >
              {actionState === 'approving' ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-3.5 w-3.5" />
              )}
              Approve selected
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => executeBatch('rejected')}
              disabled={isLoading}
              aria-label={`Reject ${selectedIds.size} selected results`}
              className="border-red-600 text-red-700 hover:bg-red-50 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              {actionState === 'rejecting' ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="mr-1.5 h-3.5 w-3.5" />
              )}
              Reject selected
            </Button>
          </div>
        )}
      </div>

      {/* Error message */}
      {errorMessage && (
        <div
          className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Results table */}
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="w-10 px-3 py-2 text-left">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  aria-label={allSelected ? 'Deselect all' : 'Select all'}
                  className="flex items-center text-muted-foreground hover:text-foreground"
                >
                  {allSelected ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : someSelected ? (
                    <CheckSquare className="h-4 w-4 opacity-50" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Screenshot
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Test name
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Diff %
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {results.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No visual test results found.
                </td>
              </tr>
            )}
            {results.map((result) => {
              const status = localStatuses.get(result.id) ?? result.status;
              const isSelected = selectedIds.has(result.id);

              return (
                <tr
                  key={result.id}
                  className={cn(
                    'transition-colors',
                    isSelected && 'bg-accent/50',
                    !isSelected && 'hover:bg-muted/50',
                  )}
                >
                  {/* Checkbox */}
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleSelect(result.id)}
                      aria-label={`${isSelected ? 'Deselect' : 'Select'} ${result.testName}`}
                      aria-checked={isSelected}
                      role="checkbox"
                      className="flex items-center text-muted-foreground hover:text-foreground"
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </td>

                  {/* Thumbnail */}
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onResultSelect?.(result)}
                      disabled={!onResultSelect}
                      className={cn(
                        'block h-12 w-20 overflow-hidden rounded border bg-muted',
                        onResultSelect && 'cursor-pointer hover:opacity-80',
                      )}
                      aria-label={`View ${result.testName}`}
                    >
                      {result.actualUrl ? (
                        <img
                          src={result.actualUrl}
                          alt={result.testName}
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center text-xs text-muted-foreground">
                          N/A
                        </span>
                      )}
                    </button>
                  </td>

                  {/* Test name */}
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onResultSelect?.(result)}
                      disabled={!onResultSelect}
                      className={cn(
                        'max-w-xs truncate text-left font-medium',
                        onResultSelect && 'cursor-pointer hover:underline',
                      )}
                      title={result.testName}
                    >
                      {result.testName}
                    </button>
                  </td>

                  {/* Diff percentage */}
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {result.diffPercentage !== undefined
                      ? `${result.diffPercentage.toFixed(2)}%`
                      : '—'}
                  </td>

                  {/* Status badge */}
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs font-semibold capitalize',
                        STATUS_BADGE[status],
                      )}
                    >
                      {status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

BatchApproval.displayName = 'BatchApproval';
