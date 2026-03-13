import { RefreshCw } from 'lucide-react';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { CreditSummaryCard } from '@/components/dashboard/credit-summary';
import { Leaderboard } from '@/components/dashboard/leaderboard';
import { QualityCards } from '@/components/dashboard/quality-cards';
import { Button } from '@/components/ui/button';
import {
  getMockActivityFeed,
  getMockLeaderboard,
  mockCreditSummary,
  mockQualityMetrics,
} from '@/lib/mock-data';

/**
 * Dashboard home page — organization-wide quality health overview.
 *
 * Layout:
 * - Header with title and refresh button
 * - Quality metrics cards (6-up grid)
 * - Two-column layout on large screens:
 *   - Left: Activity feed (stacks full-width on mobile)
 *   - Right: Credit summary card
 * - Full-width project leaderboard table
 *
 * All data is currently sourced from mock-data.ts.
 * TODO: Replace mock imports with API calls when backend is ready.
 */
export default function DashboardPage() {
  // Data fetching will move to server actions / API calls in future iterations.
  const metrics = mockQualityMetrics;
  const activities = getMockActivityFeed(10);
  const leaderboard = getMockLeaderboard();
  const credits = mockCreditSummary;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Page header */}
      <header className="border-b bg-card px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Organization-wide quality health overview
            </p>
          </div>
          <Button variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-6 py-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Quality metrics cards */}
          <section aria-label="Quality metrics">
            <QualityCards metrics={metrics} />
          </section>

          {/* Activity feed + Credit summary */}
          <section aria-label="Activity and credits" className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ActivityFeed events={activities} />
            </div>
            <div>
              <CreditSummaryCard summary={credits} />
            </div>
          </section>

          {/* Project leaderboard */}
          <section aria-label="Project leaderboard">
            <Leaderboard entries={leaderboard} />
          </section>
        </div>
      </main>
    </div>
  );
}
