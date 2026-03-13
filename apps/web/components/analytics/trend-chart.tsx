'use client';

import React, { useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  type TooltipProps,
} from 'recharts';
import { Download, ChevronDown, ChevronUp, Table2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '../ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { cn } from '../../lib/utils';
import { toCsv, downloadCsv } from '../../lib/analytics-api';
import type { QualityTrend, QualityTrendPoint } from '../../types/analytics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrendChartProps {
  /** All project quality trends to display. */
  trends: QualityTrend[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function QualityTooltip({
  active,
  payload,
  label,
}: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}:{' '}
          <span className="font-semibold">
            {typeof entry.value === 'number'
              ? `${(entry.value * 100).toFixed(1)}%`
              : entry.value}
          </span>
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Colour palette for multiple projects
// ---------------------------------------------------------------------------

const COLOURS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#ec4899', // pink-500
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Quality Trend Chart component.
 *
 * Renders line charts showing pass-rate over time for each project,
 * along with their 7-day rolling averages. Supports project filtering,
 * drill-down data table, and CSV export.
 */
export function TrendChart({ trends, className }: TrendChartProps) {
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [showDataTable, setShowDataTable] = useState(false);

  const filteredTrends =
    selectedProject === 'all'
      ? trends
      : trends.filter((t) => t.projectId === selectedProject);

  // Merge all trend data into one unified date-keyed dataset for the chart.
  const allDates = Array.from(
    new Set(filteredTrends.flatMap((t) => t.data.map((d) => d.date))),
  ).sort();

  const chartData = allDates.map((date) => {
    const point: Record<string, string | number> = { date };
    for (const trend of filteredTrends) {
      const dp = trend.data.find((d) => d.date === date);
      if (dp) {
        point[`${trend.projectId}_passRate`] = dp.passRate;
        point[`${trend.projectId}_rollingAvg`] = dp.rollingAvg;
      }
    }
    return point;
  });

  const handleExportCsv = useCallback(() => {
    const rows = filteredTrends.flatMap((t) =>
      t.data.map((d: QualityTrendPoint) => ({
        project: t.projectName,
        date: d.date,
        passRate: (d.passRate * 100).toFixed(2),
        rollingAvg7d: (d.rollingAvg * 100).toFixed(2),
        totalTests: d.totalTests,
        failedTests: d.failedTests,
      })),
    );
    downloadCsv(toCsv(rows), 'quality-trends.csv');
  }, [filteredTrends]);

  // For the drill-down table only show the selected or first project
  const drillTrend =
    filteredTrends.find((t) => t.projectId === selectedProject) ??
    filteredTrends[0];

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Quality Trends</CardTitle>
          <CardDescription>
            Pass rate over time with 7-day rolling average
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {trends.map((t) => (
                <SelectItem key={t.projectId} value={t.projectId}>
                  {t.projectName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            onClick={() => setShowDataTable((v) => !v)}
            className="flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-accent transition-colors"
            title="Toggle data table"
          >
            <Table2 className="h-4 w-4" />
            {showDataTable ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
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

      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart
            data={chartData}
            margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: string) => {
                const d = new Date(v);
                return `${d.getMonth() + 1}/${d.getDate()}`;
              }}
              minTickGap={20}
            />
            <YAxis
              tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              domain={[0, 1]}
              tick={{ fontSize: 11 }}
              width={40}
            />
            <Tooltip content={<QualityTooltip />} />
            <Legend
              formatter={(value: string) => {
                const parts = value.split('_');
                const projectId = parts.slice(0, -1).join('_');
                const metric = parts.at(-1);
                const project = trends.find((t) => t.projectId === projectId);
                const label = project?.projectName ?? projectId;
                return metric === 'rollingAvg' ? `${label} (avg)` : label;
              }}
            />
            {filteredTrends.flatMap((trend, idx) => {
              const colour = COLOURS[idx % COLOURS.length];
              return [
                <Line
                  key={`${trend.projectId}_passRate`}
                  type="monotone"
                  dataKey={`${trend.projectId}_passRate`}
                  stroke={colour}
                  strokeWidth={2}
                  dot={false}
                  name={`${trend.projectId}_passRate`}
                  connectNulls
                />,
                <Line
                  key={`${trend.projectId}_rollingAvg`}
                  type="monotone"
                  dataKey={`${trend.projectId}_rollingAvg`}
                  stroke={colour}
                  strokeWidth={1}
                  strokeDasharray="5 3"
                  dot={false}
                  name={`${trend.projectId}_rollingAvg`}
                  connectNulls
                />,
              ];
            })}
          </LineChart>
        </ResponsiveContainer>

        {/* Drill-down data table */}
        {showDataTable && drillTrend && (
          <div className="mt-4 border rounded-md overflow-auto max-h-64">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Pass Rate
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    7-day Avg
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">Failed</th>
                </tr>
              </thead>
              <tbody>
                {drillTrend.data.map((d) => (
                  <tr key={d.date} className="border-t hover:bg-muted/40">
                    <td className="px-3 py-1.5">{d.date}</td>
                    <td className="px-3 py-1.5 text-right">
                      {(d.passRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {(d.rollingAvg * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-1.5 text-right">{d.totalTests}</td>
                    <td className="px-3 py-1.5 text-right text-destructive">
                      {d.failedTests}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
