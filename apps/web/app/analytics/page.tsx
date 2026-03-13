'use client';

/**
 * Quality Intelligence Dashboard (SEM-97)
 *
 * Provides analytics across quality trends, cross-project leaderboard,
 * performance vitals, development quality metrics, and AI credit usage.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Wifi, WifiOff, BarChart3 } from 'lucide-react';
import { TrendChart } from '../../components/analytics/trend-chart';
import { Leaderboard } from '../../components/analytics/leaderboard';
import { PerformanceTrends } from '../../components/analytics/performance-trends';
import { CreditAnalytics } from '../../components/analytics/credit-analytics';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  fetchQualityTrends,
  fetchLeaderboard,
  fetchPerformanceTrends,
  fetchDevQualityMetrics,
  fetchCreditUsage,
  computeAnalyticsSummary,
} from '../../lib/analytics-api';
import type {
  DateRange,
  DateRangeOption,
  QualityTrend,
  LeaderboardEntry,
  LeaderboardWeights,
  PerformanceTrend,
  DevQualityMetrics,
  ProjectCreditUsage,
  AnalyticsSummary,
} from '../../types/analytics';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDateRange(option: DateRangeOption): DateRange {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  if (option === '7d') start.setDate(start.getDate() - 6);
  else if (option === '30d') start.setDate(start.getDate() - 29);
  else if (option === '90d') start.setDate(start.getDate() - 89);
  start.setHours(0, 0, 0, 0);
  return { start, end, option };
}

const WS_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001/ws/analytics')
    : null;

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'green' | 'red' | 'blue' | 'amber';
}) {
  const colourMap: Record<string, string> = {
    green: 'text-emerald-600',
    red: 'text-red-600',
    blue: 'text-blue-600',
    amber: 'text-amber-600',
  };
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-2xl font-bold ${accent ? colourMap[accent] : 'text-foreground'}`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const [rangeOption, setRangeOption] = useState<DateRangeOption>('30d');
  const [dateRange, setDateRange] = useState<DateRange>(
    buildDateRange('30d'),
  );
  const [weights, setWeights] = useState<LeaderboardWeights>({
    passRate: 5,
    bugRate: 3,
    coverage: 4,
    regressionRate: 3,
  });

  // Data state
  const [qualityTrends, setQualityTrends] = useState<QualityTrend[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [perfTrends, setPerfTrends] = useState<PerformanceTrend[]>([]);
  const [devQuality, setDevQuality] = useState<DevQualityMetrics[]>([]);
  const [creditUsage, setCreditUsage] = useState<ProjectCreditUsage[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadData = useCallback(
    async (range: DateRange, w: LeaderboardWeights) => {
      setLoading(true);
      setError(null);
      try {
        const [qt, lb, pt, dq, cu] = await Promise.all([
          fetchQualityTrends(range),
          fetchLeaderboard(w),
          fetchPerformanceTrends(range),
          fetchDevQualityMetrics(range),
          fetchCreditUsage(range),
        ]);
        setQualityTrends(qt);
        setLeaderboard(lb);
        setPerfTrends(pt);
        setDevQuality(dq);
        setCreditUsage(cu);
        setSummary(computeAnalyticsSummary(lb, cu));
        setLastUpdated(new Date());
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load analytics data',
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // WebSocket for real-time updates
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!WS_URL) return;

    let reconnectTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      try {
        const ws = new WebSocket(WS_URL as string);
        wsRef.current = ws;

        ws.onopen = () => setWsConnected(true);
        ws.onclose = () => {
          setWsConnected(false);
          reconnectTimeout = setTimeout(connect, 5000);
        };
        ws.onerror = () => {
          ws.close();
        };
        ws.onmessage = (event: MessageEvent) => {
          try {
            const msg = JSON.parse(event.data as string) as {
              type: string;
            };
            if (msg.type === 'analytics:update') {
              void loadData(dateRange, weights);
            }
          } catch {
            // ignore malformed WS messages
          }
        };
      } catch {
        reconnectTimeout = setTimeout(connect, 5000);
      }
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, []); // connect once on mount; reconnect handles the rest

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  useEffect(() => {
    void loadData(dateRange, weights);
  }, [dateRange, loadData]);

  // Reload leaderboard when weights change (debounced via separate effect)
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      void fetchLeaderboard(weights).then((lb) => {
        setLeaderboard(lb);
        setSummary((prev) =>
          prev ? computeAnalyticsSummary(lb, creditUsage) : prev,
        );
      });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weights]);

  function handleRangeChange(option: DateRangeOption) {
    setRangeOption(option);
    const range = buildDateRange(option);
    setDateRange(range);
  }

  function handleRefresh() {
    void loadData(dateRange, weights);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold leading-tight">
                Quality Intelligence
              </h1>
              <p className="text-xs text-muted-foreground">
                Analytics Dashboard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Date range selector */}
            <Select
              value={rangeOption}
              onValueChange={(v) => handleRangeChange(v as DateRangeOption)}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>

            {/* WebSocket status */}
            <div
              className="flex items-center gap-1 text-xs text-muted-foreground"
              title={wsConnected ? 'Live updates active' : 'Live updates inactive'}
            >
              {wsConnected ? (
                <Wifi className="h-4 w-4 text-emerald-500" />
              ) : (
                <WifiOff className="h-4 w-4" />
              )}
              <span>{wsConnected ? 'Live' : 'Offline'}</span>
            </div>

            {/* Refresh button */}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>

            {lastUpdated && (
              <span className="text-xs text-muted-foreground hidden md:block">
                Updated{' '}
                {lastUpdated.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Error banner */}
        {error && (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-lg border bg-muted animate-pulse"
              />
            ))}
          </div>
        )}

        {/* KPI summary strip */}
        {!loading && summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Tracked Projects"
              value={String(summary.totalProjects)}
            />
            <KpiCard
              label="Avg Pass Rate"
              value={`${(summary.avgPassRate * 100).toFixed(1)}%`}
              accent={
                summary.avgPassRate >= 0.9
                  ? 'green'
                  : summary.avgPassRate >= 0.7
                    ? 'amber'
                    : 'red'
              }
            />
            <KpiCard
              label="Total Credits Used"
              value={summary.totalCreditsUsed.toLocaleString()}
              accent="blue"
            />
            <KpiCard
              label="Critical Projects"
              value={String(summary.criticalIssues)}
              sub="Pass rate < 70%"
              accent={summary.criticalIssues > 0 ? 'red' : 'green'}
            />
          </div>
        )}

        {/* Quality Trend Charts */}
        {!loading && qualityTrends.length > 0 && (
          <TrendChart trends={qualityTrends} />
        )}

        {/* Quality Leaderboard */}
        {!loading && leaderboard.length > 0 && (
          <Leaderboard
            entries={leaderboard}
            weights={weights}
            onWeightsChange={setWeights}
          />
        )}

        {/* Performance & Dev Quality Trends */}
        {!loading &&
          perfTrends.length > 0 &&
          devQuality.length > 0 && (
            <PerformanceTrends
              performanceTrends={perfTrends}
              devQualityMetrics={devQuality}
            />
          )}

        {/* AI Credit Usage */}
        {!loading && creditUsage.length > 0 && (
          <CreditAnalytics projects={creditUsage} />
        )}
      </main>
    </div>
  );
}
