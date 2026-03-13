'use client';

import React, { useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  type TooltipProps,
} from 'recharts';
import { Download, Zap, TrendingUp, AlertTriangle } from 'lucide-react';
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
import { toCsv, downloadCsv, computeAgentTypeSummary } from '../../lib/analytics-api';
import type { ProjectCreditUsage, AgentTypeSummary } from '../../types/analytics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreditAnalyticsProps {
  projects: ProjectCreditUsage[];
  className?: string;
}

type ViewMode = 'burnrate' | 'breakdown' | 'perproject';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_COLOURS: Record<string, string> = {
  'Test Generation': '#3b82f6',
  'Code Review': '#10b981',
  'Bug Analysis': '#f59e0b',
  Other: '#8b5cf6',
};

const STACKED_COLOURS = {
  testGeneration: '#3b82f6',
  codeReview: '#10b981',
  bugAnalysis: '#f59e0b',
  other: '#8b5cf6',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  alert,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4 space-y-1',
        alert && 'border-amber-400 bg-amber-50 dark:bg-amber-950/20',
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={cn('h-4 w-4', alert && 'text-amber-500')} />
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function CustomPieLabel({
  cx,
  cy,
  midAngle,
  outerRadius,
  percent,
  name,
}: {
  cx: number;
  cy: number;
  midAngle: number;
  outerRadius: number;
  percent: number;
  name: string;
}) {
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 28;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  if (percent < 0.05) return null;
  return (
    <text
      x={x}
      y={y}
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={11}
    >
      {name} ({(percent * 100).toFixed(0)}%)
    </text>
  );
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

function CreditTooltip({
  active,
  payload,
  label,
}: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-sm min-w-[160px]">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}:{' '}
          <span className="font-semibold">
            {typeof entry.value === 'number'
              ? entry.value.toLocaleString()
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
 * AI Credit Usage Analytics component.
 *
 * Provides three views:
 * - Burn rate: daily credit consumption over time with stacked area chart
 * - Breakdown: pie chart of credit usage by agent type
 * - Per project: horizontal bar chart comparing projects
 */
export function CreditAnalytics({ projects, className }: CreditAnalyticsProps) {
  const [view, setView] = useState<ViewMode>('burnrate');
  const [selectedProject, setSelectedProject] = useState<string>(
    projects[0]?.projectId ?? '',
  );

  const selectedProjectData =
    projects.find((p) => p.projectId === selectedProject) ?? projects[0];

  const agentSummary: AgentTypeSummary[] = computeAgentTypeSummary(projects);

  // Aggregate all-project totals for summary KPIs
  const totalCredits = projects.reduce((s, p) => s + p.totalCredits, 0);
  const avgBurnRate =
    projects.reduce((s, p) => s + p.burnRate, 0) / Math.max(projects.length, 1);
  const projectedMonthlyTotal = projects.reduce(
    (s, p) => s + p.projectedMonthly,
    0,
  );

  // Per-project bar chart data
  const perProjectData = projects
    .map((p) => ({ name: p.projectName, credits: p.totalCredits, burnRate: p.burnRate }))
    .sort((a, b) => b.credits - a.credits);

  const handleExportCsv = useCallback(() => {
    if (view === 'burnrate' && selectedProjectData) {
      const rows = selectedProjectData.data.map((d) => ({
        project: selectedProjectData.projectName,
        date: d.date,
        totalCredits: d.totalCredits,
        testGeneration: d.testGeneration,
        codeReview: d.codeReview,
        bugAnalysis: d.bugAnalysis,
        other: d.other,
      }));
      downloadCsv(toCsv(rows), 'credit-burnrate.csv');
    } else if (view === 'breakdown') {
      const rows = agentSummary.map((a) => ({
        agentType: a.agentType,
        totalCredits: a.totalCredits,
        percentage: a.percentage,
      }));
      downloadCsv(toCsv(rows), 'credit-by-agent.csv');
    } else if (view === 'perproject') {
      const rows = projects.map((p) => ({
        project: p.projectName,
        totalCredits: p.totalCredits,
        burnRatePerDay: p.burnRate,
        projectedMonthly: p.projectedMonthly,
      }));
      downloadCsv(toCsv(rows), 'credit-per-project.csv');
    }
  }, [view, selectedProjectData, agentSummary, projects]);

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
        <div>
          <CardTitle>AI Credit Usage</CardTitle>
          <CardDescription>
            Per-project and per-agent-type consumption with burn rate projection
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View mode tabs */}
          <div className="flex rounded-md border overflow-hidden text-sm">
            {(
              [
                { id: 'burnrate', label: 'Burn Rate' },
                { id: 'breakdown', label: 'By Agent' },
                { id: 'perproject', label: 'By Project' },
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

          {view === 'burnrate' && (
            <Select
              value={selectedProject}
              onValueChange={setSelectedProject}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.projectId} value={p.projectId}>
                    {p.projectName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

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
        {/* KPI summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KpiCard
            icon={Zap}
            label="Total Credits Used"
            value={totalCredits.toLocaleString()}
            sub="Selected period"
          />
          <KpiCard
            icon={TrendingUp}
            label="Avg Burn Rate"
            value={`${Math.round(avgBurnRate).toLocaleString()}/day`}
            sub="Across all projects"
          />
          <KpiCard
            icon={AlertTriangle}
            label="Projected Monthly"
            value={projectedMonthlyTotal.toLocaleString()}
            sub="At current burn rate"
            alert={projectedMonthlyTotal > 500000}
          />
        </div>

        {/* Burn rate view */}
        {view === 'burnrate' && selectedProjectData && (
          <>
            <div className="flex gap-4 text-sm">
              <span>
                <span className="text-muted-foreground">Burn Rate: </span>
                <span className="font-semibold">
                  {selectedProjectData.burnRate.toLocaleString()} credits/day
                </span>
              </span>
              <span>
                <span className="text-muted-foreground">
                  Projected Monthly:{' '}
                </span>
                <span className="font-semibold">
                  {selectedProjectData.projectedMonthly.toLocaleString()}
                </span>
              </span>
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <AreaChart
                data={selectedProjectData.data}
                margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
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
                <Tooltip content={<CreditTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="testGeneration"
                  name="Test Generation"
                  stackId="1"
                  stroke={STACKED_COLOURS.testGeneration}
                  fill={STACKED_COLOURS.testGeneration}
                  fillOpacity={0.7}
                />
                <Area
                  type="monotone"
                  dataKey="codeReview"
                  name="Code Review"
                  stackId="1"
                  stroke={STACKED_COLOURS.codeReview}
                  fill={STACKED_COLOURS.codeReview}
                  fillOpacity={0.7}
                />
                <Area
                  type="monotone"
                  dataKey="bugAnalysis"
                  name="Bug Analysis"
                  stackId="1"
                  stroke={STACKED_COLOURS.bugAnalysis}
                  fill={STACKED_COLOURS.bugAnalysis}
                  fillOpacity={0.7}
                />
                <Area
                  type="monotone"
                  dataKey="other"
                  name="Other"
                  stackId="1"
                  stroke={STACKED_COLOURS.other}
                  fill={STACKED_COLOURS.other}
                  fillOpacity={0.7}
                />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}

        {/* Agent-type breakdown view */}
        {view === 'breakdown' && (
          <div className="flex flex-col md:flex-row items-center gap-6">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={agentSummary}
                  dataKey="totalCredits"
                  nameKey="agentType"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  labelLine={false}
                  label={CustomPieLabel}
                >
                  {agentSummary.map((entry) => (
                    <Cell
                      key={entry.agentType}
                      fill={AGENT_COLOURS[entry.agentType] ?? '#94a3b8'}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => value.toLocaleString()}
                />
              </PieChart>
            </ResponsiveContainer>

            <div className="w-full md:w-48 space-y-2 shrink-0">
              {agentSummary.map((a) => (
                <div key={a.agentType} className="flex items-center gap-2 text-sm">
                  <span
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{
                      background: AGENT_COLOURS[a.agentType] ?? '#94a3b8',
                    }}
                  />
                  <span className="flex-1 text-muted-foreground">
                    {a.agentType}
                  </span>
                  <span className="font-medium">{a.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-project view */}
        {view === 'perproject' && (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={perProjectData}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 80, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  className="stroke-border"
                />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 11 }}
                  width={80}
                />
                <Tooltip content={<CreditTooltip />} />
                <Legend />
                <Bar
                  dataKey="credits"
                  name="Total Credits"
                  fill="#3b82f6"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>

            {/* Per-project drill table */}
            <div className="border rounded-md overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Project</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Total Credits
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Burn Rate/day
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Proj. Monthly
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projects
                    .slice()
                    .sort((a, b) => b.totalCredits - a.totalCredits)
                    .map((p) => (
                      <tr key={p.projectId} className="border-t hover:bg-muted/40">
                        <td className="px-3 py-1.5 font-medium">
                          {p.projectName}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {p.totalCredits.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {p.burnRate.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {p.projectedMonthly.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
