'use client';

import React, { useState, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
  Settings2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '../ui/card';
import { cn } from '../../lib/utils';
import { toCsv, downloadCsv } from '../../lib/analytics-api';
import type { LeaderboardEntry, LeaderboardWeights } from '../../types/analytics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  weights: LeaderboardWeights;
  onWeightsChange: (weights: LeaderboardWeights) => void;
  className?: string;
}

interface DrillEntry {
  entry: LeaderboardEntry | null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TrendIcon({ trend }: { trend: LeaderboardEntry['trend'] }) {
  if (trend === 'up')
    return <TrendingUp className="h-4 w-4 text-emerald-500" />;
  if (trend === 'down')
    return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function ScoreBar({ score }: { score: number }) {
  const colour =
    score >= 80
      ? 'bg-emerald-500'
      : score >= 60
        ? 'bg-amber-500'
        : 'bg-red-500';
  return (
    <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all', colour)}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

function WeightSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-primary"
      />
      <span className="w-4 text-right font-medium">{value}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Cross-project quality leaderboard with configurable scoring weights.
 *
 * Ranks projects by a weighted composite score derived from pass rate,
 * bug count, test coverage, and regression rate. Supports drill-down
 * detail rows and CSV export.
 */
export function Leaderboard({
  entries,
  weights,
  onWeightsChange,
  className,
}: LeaderboardProps) {
  const [showWeightPanel, setShowWeightPanel] = useState(false);
  const [sortField, setSortField] = useState<keyof LeaderboardEntry>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [drill, setDrill] = useState<DrillEntry>({ entry: null });

  const sorted = [...entries].sort((a, b) => {
    const av = a[sortField];
    const bv = b[sortField];
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDir === 'asc' ? av - bv : bv - av;
    }
    return sortDir === 'asc'
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  function toggleSort(field: keyof LeaderboardEntry) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function SortHeader({
    field,
    children,
    align = 'left',
  }: {
    field: keyof LeaderboardEntry;
    children: React.ReactNode;
    align?: 'left' | 'right';
  }) {
    const active = sortField === field;
    return (
      <th
        className={cn(
          'px-3 py-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors',
          align === 'right' ? 'text-right' : 'text-left',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
        onClick={() => toggleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {active &&
            (sortDir === 'asc' ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            ))}
        </span>
      </th>
    );
  }

  const handleExportCsv = useCallback(() => {
    const rows = sorted.map((e) => ({
      rank: e.rank,
      project: e.projectName,
      team: e.team ?? '',
      score: e.score,
      passRate: (e.passRate * 100).toFixed(1),
      bugsPerSprint: e.bugsPerSprint,
      coverage: (e.coverageRate * 100).toFixed(1),
      regressionRate: (e.regressionRate * 100).toFixed(1),
      trend: e.trend,
    }));
    downloadCsv(toCsv(rows), 'quality-leaderboard.csv');
  }, [sorted]);

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Quality Leaderboard</CardTitle>
          <CardDescription>
            Cross-project ranking by weighted quality score
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowWeightPanel((v) => !v)}
            className="flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-accent transition-colors"
            title="Configure scoring weights"
          >
            <Settings2 className="h-4 w-4" />
            Weights
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-accent transition-colors"
            title="Export CSV"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Weight configuration panel */}
        {showWeightPanel && (
          <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
            <p className="text-sm font-medium">Scoring Weights</p>
            <WeightSlider
              label="Pass Rate"
              value={weights.passRate}
              onChange={(v) => onWeightsChange({ ...weights, passRate: v })}
            />
            <WeightSlider
              label="Bug Rate"
              value={weights.bugRate}
              onChange={(v) => onWeightsChange({ ...weights, bugRate: v })}
            />
            <WeightSlider
              label="Coverage"
              value={weights.coverage}
              onChange={(v) => onWeightsChange({ ...weights, coverage: v })}
            />
            <WeightSlider
              label="Regression Rate"
              value={weights.regressionRate}
              onChange={(v) =>
                onWeightsChange({ ...weights, regressionRate: v })
              }
            />
          </div>
        )}

        {/* Leaderboard table */}
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <SortHeader field="rank">#</SortHeader>
                <SortHeader field="projectName">Project</SortHeader>
                <SortHeader field="score" align="right">Score</SortHeader>
                <SortHeader field="passRate" align="right">Pass Rate</SortHeader>
                <SortHeader field="bugsPerSprint" align="right">Bugs/Sprint</SortHeader>
                <SortHeader field="coverageRate" align="right">Coverage</SortHeader>
                <SortHeader field="regressionRate" align="right">Regression</SortHeader>
                <th className="px-3 py-2 text-center text-muted-foreground font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry) => (
                <React.Fragment key={entry.projectId}>
                  <tr
                    className="border-t hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() =>
                      setDrill((d) =>
                        d.entry?.projectId === entry.projectId
                          ? { entry: null }
                          : { entry },
                      )
                    }
                  >
                    <td className="px-3 py-2 font-semibold text-muted-foreground">
                      {entry.rank}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{entry.projectName}</div>
                      {entry.team && (
                        <div className="text-xs text-muted-foreground">
                          {entry.team}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <ScoreBar score={entry.score} />
                        <span className="font-semibold w-8">{entry.score}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {(entry.passRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right">{entry.bugsPerSprint}</td>
                    <td className="px-3 py-2 text-right">
                      {(entry.coverageRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right">
                      {(entry.regressionRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-center">
                      <TrendIcon trend={entry.trend} />
                    </td>
                  </tr>

                  {/* Drill-down row */}
                  {drill.entry?.projectId === entry.projectId && (
                    <tr className="border-t bg-muted/20">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">
                              Composite Score
                            </p>
                            <p className="font-semibold text-lg">
                              {entry.score}
                              <span className="text-muted-foreground text-xs">
                                /100
                              </span>
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">
                              Pass Rate
                            </p>
                            <p className="font-semibold text-lg">
                              {(entry.passRate * 100).toFixed(1)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">
                              Coverage
                            </p>
                            <p className="font-semibold text-lg">
                              {(entry.coverageRate * 100).toFixed(1)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">
                              Bugs / Sprint
                            </p>
                            <p className="font-semibold text-lg">
                              {entry.bugsPerSprint}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
