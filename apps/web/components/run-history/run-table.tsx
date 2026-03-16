'use client';

import * as React from 'react';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  GitCompare,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import type { TestRun, RunSortField, SortDirection } from '../../types/run';
import { formatDateTime, formatPassRate } from '../../lib/utils';

export interface RunTableProps {
  runs: TestRun[];
  total: number;
  page: number;
  pageSize: number;
  sort: RunSortField;
  sortDir: SortDirection;
  selectedRunIds: string[];
  onPageChange: (page: number) => void;
  onSortChange: (field: RunSortField, dir: SortDirection) => void;
  onSelectRun: (id: string) => void;
  onCompare: (ids: [string, string]) => void;
}

const STATUS_BADGE_VARIANTS = {
  passed: 'success',
  failed: 'destructive',
  mixed: 'warning',
  running: 'secondary',
  cancelled: 'outline',
} as const;

const TRIGGER_LABELS: Record<TestRun['triggerType'], string> = {
  manual: 'Manual',
  ci: 'CI',
  scheduled: 'Scheduled',
};

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds)) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

interface SortableHeadProps {
  field: RunSortField;
  currentSort: RunSortField;
  currentDir: SortDirection;
  onSort: (field: RunSortField, dir: SortDirection) => void;
  children: React.ReactNode;
}

function SortableHead({
  field,
  currentSort,
  currentDir,
  onSort,
  children,
}: SortableHeadProps) {
  const isActive = currentSort === field;

  function handleClick() {
    if (isActive) {
      onSort(field, currentDir === 'asc' ? 'desc' : 'asc');
    } else {
      onSort(field, 'desc');
    }
  }

  return (
    <TableHead>
      <button
        onClick={handleClick}
        className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {children}
        {isActive ? (
          currentDir === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

/**
 * RunTable renders the paginated list of test runs with sortable columns.
 * Up to two runs can be selected for side-by-side comparison.
 */
export function RunTable({
  runs,
  total,
  page,
  pageSize,
  sort,
  sortDir,
  selectedRunIds,
  onPageChange,
  onSortChange,
  onSelectRun,
  onCompare,
}: RunTableProps) {
  const totalPages = Math.ceil(total / pageSize);
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  function handleRowSelect(id: string) {
    // Allow toggling if already selected, or allow adding if < 2 selected
    if (selectedRunIds.includes(id) || selectedRunIds.length < 2) {
      onSelectRun(id);
    }
  }

  return (
    <div className="space-y-4">
      {/* Comparison action bar */}
      {selectedRunIds.length === 2 && (
        <div className="flex items-center justify-between rounded-md bg-muted px-4 py-2">
          <span className="text-sm text-muted-foreground">
            2 runs selected for comparison
          </span>
          <Button
            size="sm"
            onClick={() =>
              onCompare(selectedRunIds as [string, string])
            }
            className="flex items-center gap-2"
          >
            <GitCompare className="h-4 w-4" />
            Compare runs
          </Button>
        </div>
      )}

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <SortableHead
              field="startedAt"
              currentSort={sort}
              currentDir={sortDir}
              onSort={onSortChange}
            >
              Date
            </SortableHead>
            <TableHead>Status</TableHead>
            <SortableHead
              field="totalTests"
              currentSort={sort}
              currentDir={sortDir}
              onSort={onSortChange}
            >
              Tests
            </SortableHead>
            <SortableHead
              field="passRate"
              currentSort={sort}
              currentDir={sortDir}
              onSort={onSortChange}
            >
              Pass rate
            </SortableHead>
            <SortableHead
              field="duration"
              currentSort={sort}
              currentDir={sortDir}
              onSort={onSortChange}
            >
              Duration
            </SortableHead>
            <TableHead>Trigger</TableHead>
            <TableHead>Branch</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={8}
                className="text-center text-muted-foreground py-10"
              >
                No test runs found matching the current filters.
              </TableCell>
            </TableRow>
          ) : (
            runs.map((run) => {
              const isSelected = selectedRunIds.includes(run.id);
              const isDisabled =
                !isSelected && selectedRunIds.length >= 2;

              return (
                <TableRow
                  key={run.id}
                  data-state={isSelected ? 'selected' : undefined}
                  className={isDisabled ? 'opacity-50' : undefined}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => handleRowSelect(run.id)}
                      className="h-4 w-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
                      aria-label={`Select run ${run.id}`}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(run.startedAt)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        STATUS_BADGE_VARIANTS[run.status?.toLowerCase() as keyof typeof STATUS_BADGE_VARIANTS] ?? 'outline'
                      }
                    >
                      {run.status
                        ? run.status.charAt(0).toUpperCase() +
                          run.status.slice(1).toLowerCase()
                        : '—'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {run.totalTests}
                      <span className="ml-1 text-muted-foreground text-xs">
                        ({run.passedTests}↑ {run.failedTests}↓
                        {run.skippedTests > 0
                          ? ` ${run.skippedTests}–`
                          : ''}
                        )
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        run.passRate >= 0.9
                          ? 'text-green-600 font-medium'
                          : run.passRate >= 0.7
                            ? 'text-yellow-600 font-medium'
                            : 'text-red-600 font-medium'
                      }
                    >
                      {formatPassRate(run.passRate)}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDuration(run.duration)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {TRIGGER_LABELS[run.triggerType] ?? 'Manual'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-32 truncate">
                    {run.branch ?? '—'}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {startItem}–{endItem} of {total} runs
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="flex items-center gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
