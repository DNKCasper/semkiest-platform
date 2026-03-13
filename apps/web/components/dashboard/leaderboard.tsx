'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpDown, ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LeaderboardEntry, LeaderboardSortKey, SortDirection } from '@/types/dashboard';

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getPassRateBadge(passRate: number): { variant: 'success' | 'warning' | 'destructive'; label: string } {
  if (passRate >= 90) return { variant: 'success', label: `${passRate.toFixed(1)}%` };
  if (passRate >= 70) return { variant: 'warning', label: `${passRate.toFixed(1)}%` };
  return { variant: 'destructive', label: `${passRate.toFixed(1)}%` };
}

function getRankIcon(rank: number): React.ReactNode {
  if (rank === 1) return <Trophy className="h-4 w-4 text-yellow-500" />;
  if (rank === 2) return <Trophy className="h-4 w-4 text-slate-400" />;
  if (rank === 3) return <Trophy className="h-4 w-4 text-amber-600" />;
  return <span className="inline-flex h-4 w-4 items-center justify-center text-xs font-medium text-muted-foreground">{rank}</span>;
}

interface SortButtonProps {
  column: LeaderboardSortKey;
  label: string;
  currentSort: LeaderboardSortKey;
  direction: SortDirection;
  onSort: (column: LeaderboardSortKey) => void;
}

function SortButton({ column, label, currentSort, direction, onSort }: SortButtonProps) {
  const isActive = currentSort === column;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 font-medium"
      onClick={() => onSort(column)}
    >
      {label}
      {isActive ? (
        direction === 'desc' ? (
          <ChevronDown className="ml-1 h-3.5 w-3.5" />
        ) : (
          <ChevronUp className="ml-1 h-3.5 w-3.5" />
        )
      ) : (
        <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />
      )}
    </Button>
  );
}

interface LeaderboardProps {
  entries: LeaderboardEntry[];
}

/**
 * Sortable project quality leaderboard table.
 * Clicking a project row navigates to the project detail page.
 * Top 3 performers are highlighted with trophy icons.
 */
export function Leaderboard({ entries }: LeaderboardProps) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<LeaderboardSortKey>('passRate');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  function handleSort(column: LeaderboardSortKey) {
    if (column === sortKey) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(column);
      setSortDir('desc');
    }
  }

  const sorted = [...entries].sort((a, b) => {
    const aVal = sortKey === 'lastRunAt' ? a.lastRunAt.getTime() : a[sortKey];
    const bVal = sortKey === 'lastRunAt' ? b.lastRunAt.getTime() : b[sortKey];
    const cmp = (aVal as number) < (bVal as number) ? -1 : (aVal as number) > (bVal as number) ? 1 : 0;
    return sortDir === 'desc' ? -cmp : cmp;
  });

  function handleRowClick(entry: LeaderboardEntry) {
    router.push(`/projects/${entry.id}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Project Leaderboard</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-10 px-4 py-3 text-left font-medium text-muted-foreground">#</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Project</th>
                <th className="px-4 py-3 text-left">
                  <SortButton
                    column="passRate"
                    label="Pass Rate"
                    currentSort={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-4 py-3 text-left">
                  <SortButton
                    column="totalTests"
                    label="Total Tests"
                    currentSort={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-4 py-3 text-left">
                  <SortButton
                    column="recentRuns"
                    label="Recent Runs"
                    currentSort={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-4 py-3 text-left">
                  <SortButton
                    column="lastRunAt"
                    label="Last Run"
                    currentSort={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry, index) => {
                const rank = index + 1;
                const passRateBadge = getPassRateBadge(entry.passRate);
                const isTopThree = rank <= 3;

                return (
                  <tr
                    key={entry.id}
                    onClick={() => handleRowClick(entry)}
                    className={`cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/50 ${
                      isTopThree ? 'bg-muted/20' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center">{getRankIcon(rank)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${isTopThree ? 'text-foreground' : 'text-foreground/80'}`}>
                        {entry.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={passRateBadge.variant}>{passRateBadge.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {entry.totalTests.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{entry.recentRuns}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatRelativeTime(entry.lastRunAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
