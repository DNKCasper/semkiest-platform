'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import type { DiffViewerData, DiffViewMode } from './types';

// ─── View Mode Labels ──────────────────────────────────────────────────────────

const VIEW_MODE_LABELS: Record<DiffViewMode, string> = {
  'side-by-side': 'Side by Side',
  overlay: 'Overlay',
  'diff-highlight': 'Diff Highlight',
  slider: 'Slider',
};

// ─── Screenshot Panel ─────────────────────────────────────────────────────────

interface ScreenshotPanelProps {
  label: string;
  url: string;
  alt: string;
  className?: string;
}

function ScreenshotPanel({ label, url, alt, className }: ScreenshotPanelProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="overflow-hidden rounded-md border border-border bg-muted/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          className="h-auto w-full object-contain"
          loading="lazy"
        />
      </div>
    </div>
  );
}

// ─── Side-by-Side View ────────────────────────────────────────────────────────

interface SideBySideViewProps {
  data: DiffViewerData;
}

function SideBySideView({ data }: SideBySideViewProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <ScreenshotPanel
        label="Baseline"
        url={data.baseline.url}
        alt={`Baseline screenshot of ${data.componentName}`}
      />
      <ScreenshotPanel
        label="Actual"
        url={data.actual.url}
        alt={`Actual screenshot of ${data.componentName}`}
      />
    </div>
  );
}

// ─── Overlay View ──────────────────────────────────────────────────────────────

interface OverlayViewProps {
  data: DiffViewerData;
}

function OverlayView({ data }: OverlayViewProps) {
  const [opacity, setOpacity] = React.useState(50);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Baseline</span>
        <input
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="w-40"
          aria-label="Overlay opacity"
        />
        <span className="text-sm text-muted-foreground">Actual</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {opacity}%
        </span>
      </div>
      <div className="relative overflow-hidden rounded-md border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={data.baseline.url}
          alt={`Baseline screenshot of ${data.componentName}`}
          className="h-auto w-full object-contain"
          loading="lazy"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={data.actual.url}
          alt={`Actual screenshot of ${data.componentName}`}
          className="absolute inset-0 h-full w-full object-contain"
          style={{ opacity: opacity / 100 }}
          loading="lazy"
        />
      </div>
    </div>
  );
}

// ─── Diff Highlight View ──────────────────────────────────────────────────────

interface DiffHighlightViewProps {
  data: DiffViewerData;
}

function DiffHighlightView({ data }: DiffHighlightViewProps) {
  const diffUrl = data.diffOverlay?.url ?? data.diffResult.diffImageUrl;

  if (!diffUrl) {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
        No diff image available for this comparison.
      </div>
    );
  }

  return (
    <ScreenshotPanel
      label="Diff Highlight"
      url={diffUrl}
      alt={`Diff highlight for ${data.componentName}`}
    />
  );
}

// ─── Slider View ──────────────────────────────────────────────────────────────

interface SliderViewProps {
  data: DiffViewerData;
}

function SliderView({ data }: SliderViewProps) {
  const [sliderPos, setSliderPos] = React.useState(50);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Baseline</span>
        <input
          type="range"
          min={0}
          max={100}
          value={sliderPos}
          onChange={(e) => setSliderPos(Number(e.target.value))}
          className="flex-1"
          aria-label="Comparison slider position"
        />
        <span className="text-sm text-muted-foreground">Actual</span>
      </div>
      <div
        className="relative overflow-hidden rounded-md border border-border"
        style={{ aspectRatio: `${data.baseline.width} / ${data.baseline.height}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={data.baseline.url}
          alt={`Baseline screenshot of ${data.componentName}`}
          className="absolute inset-0 h-full w-full object-contain"
          loading="lazy"
        />
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.actual.url}
            alt={`Actual screenshot of ${data.componentName}`}
            className="h-full w-full object-contain"
            loading="lazy"
          />
        </div>
        {/* Divider line */}
        <div
          className="absolute inset-y-0 w-0.5 bg-primary shadow-md"
          style={{ left: `${sliderPos}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

// ─── Diff Stats Bar ───────────────────────────────────────────────────────────

interface DiffStatsBarProps {
  data: DiffViewerData;
}

function DiffStatsBar({ data }: DiffStatsBarProps) {
  const pct = data.diffResult.diffPercentage;
  const isClean = pct === 0;
  const isMinor = pct > 0 && pct <= 1;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md bg-muted/50 px-4 py-2 text-sm">
      <span>
        <span className="font-medium">Component:</span>{' '}
        <span className="text-foreground">{data.componentName}</span>
      </span>
      <span>
        <span className="font-medium">Viewport:</span>{' '}
        <span className="text-foreground">{data.viewport}</span>
      </span>
      <span>
        <span className="font-medium">Diff:</span>{' '}
        <span
          className={cn(
            'font-mono font-semibold',
            isClean && 'text-green-600 dark:text-green-400',
            isMinor && 'text-yellow-600 dark:text-yellow-400',
            !isClean && !isMinor && 'text-red-600 dark:text-red-400',
          )}
        >
          {pct.toFixed(3)}%
        </span>{' '}
        <span className="text-muted-foreground">
          ({data.diffResult.diffPixels.toLocaleString()} /{' '}
          {data.diffResult.totalPixels.toLocaleString()} px)
        </span>
      </span>
      <span>
        <span className="font-medium">Version:</span>{' '}
        <span className="font-mono text-foreground">{data.version}</span>
      </span>
    </div>
  );
}

// ─── DiffViewer ───────────────────────────────────────────────────────────────

export interface DiffViewerProps {
  /** Complete diff data payload from GET /api/baselines/:id/diff. */
  data: DiffViewerData;
  /** Initial view mode. Defaults to 'side-by-side'. */
  defaultMode?: DiffViewMode;
  className?: string;
}

/**
 * Visual diff viewer component.
 *
 * Renders baseline vs actual screenshots with multiple viewing modes:
 * side-by-side, overlay (with opacity control), diff highlight, and slider.
 *
 * @example
 * ```tsx
 * <DiffViewer data={diffViewerData} defaultMode="side-by-side" />
 * ```
 */
export function DiffViewer({ data, defaultMode = 'side-by-side', className }: DiffViewerProps) {
  const availableModes = data.availableViewModes;
  const initialMode = availableModes.includes(defaultMode)
    ? defaultMode
    : (availableModes[0] ?? 'side-by-side');

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <DiffStatsBar data={data} />

      <Tabs defaultValue={initialMode}>
        <TabsList>
          {availableModes.map((mode) => (
            <TabsTrigger key={mode} value={mode}>
              {VIEW_MODE_LABELS[mode]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="side-by-side">
          <SideBySideView data={data} />
        </TabsContent>

        <TabsContent value="overlay">
          <OverlayView data={data} />
        </TabsContent>

        <TabsContent value="diff-highlight">
          <DiffHighlightView data={data} />
        </TabsContent>

        <TabsContent value="slider">
          <SliderView data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
