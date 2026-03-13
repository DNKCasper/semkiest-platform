'use client';

import * as React from 'react';
import { AlertCircle, ChevronRight, Filter } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { cn } from '../../lib/utils';
import { formatDateTime } from '../../lib/utils';
import type { TestRun, RunStatus } from '../../types/run';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_VARIANTS: Record<
  RunStatus,
  'default' | 'secondary' | 'success' | 'destructive' | 'warning' | 'outline'
> = {
  pending: 'secondary',
  initializing: 'warning',
  running: 'default',
  completed: 'success',
  failed: 'destructive',
  cancelled: 'secondary',
};

const STATUS_LABELS: Record<RunStatus, string> = {
  pending: 'Pending',
  initializing: 'Initializing',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function formatDuration(seconds: number | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function passRate(run: TestRun): string {
  if (run.totalTests === 0) return '—';
  return `${Math.round((run.passedTests / run.totalTests) * 100)}%`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusFilter = RunStatus | 'all';

export interface RunListProps {
  runs: TestRun[];
  projectId: string;
  totalCount: number;
  page: number;
  pageSize: number;
  isLoading?: boolean;
  error?: string | null;
  onPageChange: (page: number) => void;
  onFilterChange: (filters: { status?: RunStatus; profileId?: string }) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Paginated table of test runs for a project.
 * Includes filters by status and profile, and links to detail pages.
 */
export function RunList({
  runs,
  projectId,
  totalCount,
  page,
  pageSize,
  isLoading = false,
  error,
  onPageChange,
  onFilterChange,
  className,
}: RunListProps) {
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [profileSearch, setProfileSearch] = React.useState('');

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const handleStatusChange = (value: StatusFilter) => {
    setStatusFilter(value);
    onFilterChange({ status: value === 'all' ? undefined : value });
  };

  const handleProfileSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfileSearch(e.target.value);
  };

  const filteredRuns = runs.filter((run) => {
    if (!profileSearch) return true;
    const q = profileSearch.toLowerCase();
    return (
      run.profile?.name.toLowerCase().includes(q) ||
      run.profileId.toLowerCase().includes(q)
    );
  });

  return (
    <div className={cn('space-y-4', className)}>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />

        <Select value={statusFilter} onValueChange={(v) => handleStatusChange(v as StatusFilter)}>
          <SelectTrigger className="h-8 w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(STATUS_LABELS) as RunStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Search by profile…"
          value={profileSearch}
          onChange={handleProfileSearch}
          className="h-8 w-48 text-sm"
        />

        <span className="ml-auto text-xs text-muted-foreground">
          {totalCount} run{totalCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run ID</TableHead>
              <TableHead>Profile</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pass Rate</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : filteredRuns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No runs found.
                </TableCell>
              </TableRow>
            ) : (
              filteredRuns.map((run) => (
                <TableRow key={run.id} className="group">
                  <TableCell className="font-mono text-xs">
                    {run.id.slice(0, 8)}…
                  </TableCell>
                  <TableCell>{run.profile?.name ?? run.profileId}</TableCell>
                  <TableCell>
                    {run.startedAt ? formatDateTime(run.startedAt) : '—'}
                  </TableCell>
                  <TableCell>{formatDuration(run.duration)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[run.status]}>
                      {STATUS_LABELS[run.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{passRate(run)}</TableCell>
                  <TableCell>
                    <Link
                      href={`/projects/${projectId}/runs/${run.id}`}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
