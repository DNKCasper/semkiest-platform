import { BrainCircuit, Calendar, Flame, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { CreditSummary } from '@/types/dashboard';

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface CreditSummaryProps {
  summary: CreditSummary;
}

/**
 * AI credit consumption summary card showing usage, burn rate, and per-agent breakdown.
 */
export function CreditSummaryCard({ summary }: CreditSummaryProps) {
  const usagePercent = Math.min(100, (summary.usedCredits / summary.totalCredits) * 100);
  const remainingCredits = summary.totalCredits - summary.usedCredits;

  const progressColor =
    usagePercent >= 90
      ? 'bg-red-500'
      : usagePercent >= 70
        ? 'bg-yellow-500'
        : 'bg-green-500';

  // Sort agents by usage descending
  const sortedAgents = [...summary.byAgentType].sort((a, b) => b.creditsUsed - a.creditsUsed);
  const maxAgentUsage = sortedAgents[0]?.creditsUsed ?? 1;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">AI Credit Usage</CardTitle>
          <div className="rounded-md bg-purple-50 p-2">
            <BrainCircuit className="h-4 w-4 text-purple-600" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{summary.periodLabel}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Usage bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {summary.usedCredits.toLocaleString()} / {summary.totalCredits.toLocaleString()}{' '}
              credits used
            </span>
            <span className="text-muted-foreground">{usagePercent.toFixed(1)}%</span>
          </div>
          <Progress value={usagePercent} indicatorClassName={progressColor} className="h-3" />
          <p className="text-xs text-muted-foreground">
            {remainingCredits.toLocaleString()} credits remaining
          </p>
        </div>

        {/* Burn rate & depletion */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Flame className="h-3.5 w-3.5 text-orange-500" />
              <span>Burn rate</span>
            </div>
            <p className="mt-1 text-sm font-semibold">
              {summary.burnRatePerDay.toLocaleString()} / day
            </p>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 text-blue-500" />
              <span>Est. depletion</span>
            </div>
            <p className="mt-1 text-sm font-semibold">
              {summary.estimatedDepletionDate ? formatDate(summary.estimatedDepletionDate) : '—'}
            </p>
          </div>
        </div>

        {/* Per-agent breakdown */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Zap className="h-3.5 w-3.5" />
            <span>Usage by agent</span>
          </div>
          <div className="space-y-2">
            {sortedAgents.map((agent) => (
              <div key={agent.agentType} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground">{agent.agentType}</span>
                  <span className="text-muted-foreground">
                    {agent.creditsUsed.toLocaleString()} credits
                  </span>
                </div>
                <Progress
                  value={(agent.creditsUsed / maxAgentUsage) * 100}
                  className="h-1.5"
                  indicatorClassName="bg-purple-500"
                />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
