'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type { RunFilters, RunSortField, SortDirection } from '../../types/run';

export interface FilterBarProps {
  filters: RunFilters;
  sort: RunSortField;
  sortDir: SortDirection;
  onFiltersChange: (filters: RunFilters) => void;
  onSortChange: (sort: RunSortField, dir: SortDirection) => void;
}

const RUN_STATUSES = [
  { value: 'all', label: 'All statuses' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'running', label: 'Running' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

const TRIGGER_TYPES = [
  { value: 'all', label: 'All triggers' },
  { value: 'manual', label: 'Manual' },
  { value: 'ci', label: 'CI' },
  { value: 'scheduled', label: 'Scheduled' },
] as const;

const SORT_FIELDS = [
  { value: 'startedAt', label: 'Date' },
  { value: 'duration', label: 'Duration' },
  { value: 'passRate', label: 'Pass rate' },
  { value: 'totalTests', label: 'Total tests' },
] as const;

/**
 * FilterBar provides controls for filtering and sorting the run history table.
 * Emits updated filter/sort values to the parent without managing its own state.
 */
export function FilterBar({
  filters,
  sort,
  sortDir,
  onFiltersChange,
  onSortChange,
}: FilterBarProps) {
  const hasActiveFilters =
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo) ||
    (filters.status && filters.status !== 'all') ||
    (filters.triggerType && filters.triggerType !== 'all') ||
    Boolean(filters.category);

  function handleClearFilters() {
    onFiltersChange({ status: 'all', triggerType: 'all' });
  }

  function handleStatusChange(value: string) {
    onFiltersChange({ ...filters, status: value as RunFilters['status'] });
  }

  function handleTriggerChange(value: string) {
    onFiltersChange({
      ...filters,
      triggerType: value as RunFilters['triggerType'],
    });
  }

  function handleSortFieldChange(value: string) {
    onSortChange(value as RunSortField, sortDir);
  }

  function handleSortDirChange(value: string) {
    onSortChange(sort, value as SortDirection);
  }

  return (
    <div className="space-y-4">
      {/* Date range + category row */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date-from" className="text-xs">
            From
          </Label>
          <Input
            id="date-from"
            type="date"
            className="w-40"
            value={filters.dateFrom ?? ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                dateFrom: e.target.value || undefined,
              })
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date-to" className="text-xs">
            To
          </Label>
          <Input
            id="date-to"
            type="date"
            className="w-40"
            value={filters.dateTo ?? ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                dateTo: e.target.value || undefined,
              })
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category" className="text-xs">
            Category
          </Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="category"
              placeholder="Filter by category"
              className="w-48 pl-8"
              value={filters.category ?? ''}
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  category: e.target.value || undefined,
                })
              }
            />
          </div>
        </div>
      </div>

      {/* Status + trigger + sort row */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Status</Label>
          <Select
            value={filters.status ?? 'all'}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RUN_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Trigger</Label>
          <Select
            value={filters.triggerType ?? 'all'}
            onValueChange={handleTriggerChange}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRIGGER_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Sort by</Label>
          <Select value={sort} onValueChange={handleSortFieldChange}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_FIELDS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Order</Label>
          <Select value={sortDir} onValueChange={handleSortDirChange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Newest first</SelectItem>
              <SelectItem value="asc">Oldest first</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="flex items-center gap-1.5 h-10"
          >
            <X className="h-4 w-4" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
