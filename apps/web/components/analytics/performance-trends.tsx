'use client';

import React, { useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  type TooltipProps,
} from 'recharts';
import { Download, Table2, ChevronDown, ChevronUp } from 'lucide-react';
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
import type {
  PerformanceTrend,
  DevQualityMetrics,
} from '../../types/analytics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PerformanceTrendsProps {
  performanceTrends: PerformanceTrend[];
  devQualityMetrics: DevQualityMetrics[];
  className?: string;
}

type ViewMode = 'cwv' | 'lighthouse' | 'devquality';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Colour buckets for Core Web Vitals thresholds. */
function lcpColour(ms: number) {
  if (ms <= 2500) return '#10b981'; // good
  if (ms <= 4000) return '#f59e0b'; // needs improvement
  return '#ef4444'; // poor
}

function clsColour(cls: number) {
  if (cls <= 0.1) return '#10b981';
  if (cls <= 0.25) return '#f59e0b';
  return '#ef4444';
}

// ---------------------------------------------------------------------------
// Custom tooltips
// ---------------------------------------------------------------------------

function CwvTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-sm min-w-[160px]">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}:{' '}
          <span className="font-semibold">
            {typeof entry.value === 'number'
              ? entry.name?.toString().includes('CLS')
                ? entry.value.toFixed(3)
                : `${entry.value.toLocaleString()} ms`
              : entry.value}
          </span>
        </p>
      ))}
    </div>
  );
}

function ScoreTooltip({
  active,
  payload,
  label,
}: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-sm min-w-[180px]">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}:{' '}
          <span className="font-semibold">
            {typeof entry.value === 'number'
              ? `${entry.value.toFixed(0)}/100`
              : entry.value}
          </span>
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Performance Trends component.
 *
 * Provides three views:
 * - Core Web Vitals (LCP, FID, CLS) over time
 * - Lighthouse scores over time
 * - Development quality metrics (bugs per sprint, regression rate, coverage)
 */
export function PerformanceTrends({
  performanceTrends,
  devQualityMetrics,
  className,
}: PerformanceTrendsProps) {
  const [view, setView] = useState<ViewMode>('cwv');
  const [selectedProject, setSelectedProject] = useState<string>(
    performanceTrends[0]?.projectId ?? '',
  );
  const [showDataTable, setShowDataTable] = useState(false);

  const selectedPerfTrend =
    performanceTrends.find((t) => t.projectId === selectedProject) ??
    performanceTrends[0];
  const selectedDevQuality =
    devQualityMetrics.find((m) => m.projectId === selectedProject) ??
    devQualityMetrics[0];

  const handleExportCsv = useCallback(() => {
    if (view === 'cwv' && selectedPerfTrend) {
      const rows = selectedPerfTrend.data.map((d) => ({
        project: selectedPerfTrend.projectName,
        date: d.date,
        lcp_ms: d.lcp,
        fid_ms: d.fid,
        cls: d.cls,
      }));
      downloadCsv(toCsv(rows), 'core-web-vitals.csv');
    } else if (view === 'lighthouse' && selectedPerfTrend) {
      const rows = selectedPerfTrend.data.map((d) => ({
        project: selectedPerfTrend.projectName,
        date: d.date,
        performance: d.lighthousePerformance,
        accessibility: d.lighthouseAccessibility,
        bestPractices: d.lighthouseBestPractices,
        seo: d.lighthouseSeo,
      }));
      downloadCsv(toCsv(rows), 'lighthouse-scores.csv');
    } else if (view === 'devquality' && selectedDevQuality) {
      const rows = selectedDevQuality.data.map((d) => ({
        project: selectedDevQuality.projectName,
        sprint: d.sprint,
        date: d.date,
        bugs: d.bugs,
        regressions: d.regressions,
        coveragePercent: d.coveragePercent,
      }));
      downloadCsv(toCsv(rows), 'dev-quality-metrics.csv');
    }
  }, [view, selectedPerfTrend, selectedDevQuality]);

  const allProjects = performanceTrends.map((t) => ({
    id: t.projectId,
    name: t.projectName,
  }));

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
        <div>
          <CardTitle>Performance &amp; Dev Quality Trends</CardTitle>
          <CardDescription>
            Core Web Vitals, Lighthouse scores, and development metrics
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View mode tabs */}
          <div className="flex rounded-md border overflow-hidden text-sm">
            {(
              [
                { id: 'cwv', label: 'Web Vitals' },
                { id: 'lighthouse', label: 'Lighthouse' },
                { id: 'devquality', label: 'Dev Quality' },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={cn(
                  'px-3 py-2 transition-colors',
                  view === id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allProjects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
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
        {/* Core Web Vitals view */}
        {view === 'cwv' && selectedPerfTrend && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                {
                  label: 'LCP (latest)',
                  value: `${selectedPerfTrend.data.at(-1)?.lcp.toLocaleString() ?? '—'} ms`,
                  colour: lcpColour(selectedPerfTrend.data.at(-1)?.lcp ?? 0),
                },
                {
                  label: 'FID (latest)',
                  value: `${selectedPerfTrend.data.at(-1)?.fid ?? '—'} ms`,
                  colour: '#3b82f6',
                },
                {
                  label: 'CLS (latest)',
                  value: selectedPerfTrend.data.at(-1)?.cls.toFixed(3) ?? '—',
                  colour: clsColour(selectedPerfTrend.data.at(-1)?.cls ?? 0),
                },
              ].map(({ label, value, colour }) => (
                <div
                  key={label}
                  className="rounded-lg border p-3 text-center"
                  style={{ borderColor: colour }}
                >
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold mt-1" style={{ color: colour }}>
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={selectedPerfTrend.data}
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
                <YAxis tick={{ fontSize: 11 }} width={50} />
                <Tooltip content={<CwvTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="lcp"
                  stroke="#3b82f6"
                  name="LCP (ms)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="fid"
                  stroke="#8b5cf6"
                  name="FID (ms)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}

        {/* Lighthouse view */}
        {view === 'lighthouse' && selectedPerfTrend && (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart
              data={selectedPerfTrend.data}
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
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={30} />
              <Tooltip content={<ScoreTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="lighthousePerformance"
                name="Performance"
                stroke="#3b82f6"
                fill="#3b82f620"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="lighthouseAccessibility"
                name="Accessibility"
                stroke="#10b981"
                fill="#10b98120"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="lighthouseBestPractices"
                name="Best Practices"
                stroke="#f59e0b"
                fill="#f59e0b20"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="lighthouseSeo"
                name="SEO"
                stroke="#8b5cf6"
                fill="#8b5cf620"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Dev Quality view */}
        {view === 'devquality' && selectedDevQuality && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                {
                  label: 'Avg Bugs / Sprint',
                  value: selectedDevQuality.avgBugsPerSprint,
                },
                {
                  label: 'Regression Rate',
                  value: `${(selectedDevQuality.regressionRate * 100).toFixed(1)}%`,
                },
                {
                  label: 'Current Coverage',
                  value: `${selectedDevQuality.currentCoverage}%`,
                },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold mt-1">{value}</p>
                </div>
              ))}
            </div>

            <ResponsiveContainer width="100%" height={280}>
              <AreaChart
                data={selectedDevQuality.data}
                margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="sprint"
                  tick={{ fontSize: 11 }}
                  minTickGap={20}
                />
                <YAxis tick={{ fontSize: 11 }} width={30} />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="coveragePercent"
                  name="Coverage %"
                  stroke="#10b981"
                  fill="#10b98120"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="bugs"
                  name="Bugs"
                  stroke="#ef4444"
                  fill="#ef444420"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="regressions"
                  name="Regressions"
                  stroke="#f59e0b"
                  fill="#f59e0b20"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}

        {/* Drill-down data table */}
        {showDataTable && (
          <div className="mt-4 border rounded-md overflow-auto max-h-64">
            {view === 'cwv' && selectedPerfTrend && (
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-right font-medium">LCP (ms)</th>
                    <th className="px-3 py-2 text-right font-medium">FID (ms)</th>
                    <th className="px-3 py-2 text-right font-medium">CLS</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPerfTrend.data.map((d) => (
                    <tr key={d.date} className="border-t hover:bg-muted/40">
                      <td className="px-3 py-1.5">{d.date}</td>
                      <td
                        className="px-3 py-1.5 text-right font-medium"
                        style={{ color: lcpColour(d.lcp) }}
                      >
                        {d.lcp.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-right">{d.fid}</td>
                      <td
                        className="px-3 py-1.5 text-right"
                        style={{ color: clsColour(d.cls) }}
                      >
                        {d.cls.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {view === 'lighthouse' && selectedPerfTrend && (
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-right font-medium">Perf</th>
                    <th className="px-3 py-2 text-right font-medium">A11y</th>
                    <th className="px-3 py-2 text-right font-medium">BP</th>
                    <th className="px-3 py-2 text-right font-medium">SEO</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPerfTrend.data.map((d) => (
                    <tr key={d.date} className="border-t hover:bg-muted/40">
                      <td className="px-3 py-1.5">{d.date}</td>
                      <td className="px-3 py-1.5 text-right">
                        {d.lighthousePerformance}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {d.lighthouseAccessibility}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {d.lighthouseBestPractices}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {d.lighthouseSeo}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {view === 'devquality' && selectedDevQuality && (
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Sprint</th>
                    <th className="px-3 py-2 text-right font-medium">Bugs</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Regressions
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Coverage %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDevQuality.data.map((d) => (
                    <tr
                      key={d.sprint}
                      className="border-t hover:bg-muted/40"
                    >
                      <td className="px-3 py-1.5">{d.sprint}</td>
                      <td className="px-3 py-1.5 text-right">{d.bugs}</td>
                      <td className="px-3 py-1.5 text-right text-amber-600">
                        {d.regressions}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {d.coveragePercent}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
