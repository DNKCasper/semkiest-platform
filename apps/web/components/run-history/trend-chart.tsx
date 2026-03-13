'use client';

import * as React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { RunTrendPoint } from '../../types/run';
import { formatDate } from '../../lib/utils';

export interface TrendChartProps {
  /** Pass-rate data points ordered by date (oldest → newest). */
  data: RunTrendPoint[];
}

interface ChartDataPoint {
  date: string;
  passRate: number;
  runId: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0]?.value;
  if (value === undefined) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-sm">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold">{Math.round(value * 100)}%</p>
    </div>
  );
}

/**
 * TrendChart renders a pass-rate trend line for the last N test runs.
 * Uses recharts LineChart inside a ResponsiveContainer.
 */
export function TrendChart({ data }: TrendChartProps) {
  const chartData: ChartDataPoint[] = data.map((point) => ({
    date: formatDate(point.startedAt),
    passRate: point.passRate,
    runId: point.runId,
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No trend data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart
        data={chartData}
        margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[0, 1]}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="passRate"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ r: 3, fill: 'hsl(var(--primary))' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
