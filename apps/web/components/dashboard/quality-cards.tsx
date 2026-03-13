import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FolderOpen,
  Percent,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { QualityMetrics } from '@/types/dashboard';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  /** Optional Tailwind color class for the icon background */
  iconBg?: string;
  /** Optional Tailwind color class for the value text */
  valueColor?: string;
}

function MetricCard({ title, value, subtitle, icon, iconBg, valueColor }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`rounded-md p-2 ${iconBg ?? 'bg-muted'}`}>{icon}</div>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueColor ?? 'text-foreground'}`}>{value}</div>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

interface QualityCardsProps {
  metrics: QualityMetrics;
}

/**
 * Grid of quality metric summary cards displayed at the top of the dashboard.
 * Renders responsively: 1 column on mobile → 2 on sm → 3 on lg.
 */
export function QualityCards({ metrics }: QualityCardsProps) {
  const passRateColor =
    metrics.overallPassRate >= 90
      ? 'text-green-600'
      : metrics.overallPassRate >= 70
        ? 'text-yellow-600'
        : 'text-red-600';

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <MetricCard
        title="Total Projects"
        value={metrics.totalProjects}
        subtitle="Projects under management"
        icon={<FolderOpen className="h-4 w-4 text-blue-600" />}
        iconBg="bg-blue-50"
      />
      <MetricCard
        title="Active Test Runs"
        value={metrics.activeTestRuns}
        subtitle="Currently in progress"
        icon={<Activity className="h-4 w-4 text-indigo-600" />}
        iconBg="bg-indigo-50"
      />
      <MetricCard
        title="Overall Pass Rate"
        value={`${metrics.overallPassRate.toFixed(1)}%`}
        subtitle="Aggregated across all projects"
        icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
        iconBg="bg-green-50"
        valueColor={passRateColor}
      />
      <MetricCard
        title="Flaky Tests"
        value={metrics.flakyTestCount}
        subtitle="Tests with variable results"
        icon={<AlertTriangle className="h-4 w-4 text-yellow-600" />}
        iconBg="bg-yellow-50"
        valueColor={metrics.flakyTestCount > 0 ? 'text-yellow-600' : 'text-green-600'}
      />
      <MetricCard
        title="Avg Execution Time"
        value={`${metrics.avgExecutionTimeSeconds}s`}
        subtitle="Per test run"
        icon={<Clock className="h-4 w-4 text-purple-600" />}
        iconBg="bg-purple-50"
      />
      <MetricCard
        title="Test Coverage"
        value={`${metrics.totalCoveragePercent.toFixed(1)}%`}
        subtitle="Total coverage across projects"
        icon={<Percent className="h-4 w-4 text-teal-600" />}
        iconBg="bg-teal-50"
      />
    </div>
  );
}
