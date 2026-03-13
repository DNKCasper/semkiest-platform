'use client';

import * as React from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Columns2,
  Layers,
  GripVertical,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { DiffOverlay } from './diff-overlay';
import { ApprovalControls } from './approval-controls';
import type { VisualTestResult, ViewMode, DiffMode, ApprovalStatus } from './types';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;
const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

export interface SideBySideViewerProps {
  /** The visual test result to display */
  result: VisualTestResult;
  /** Called when navigating to the previous result */
  onPrevious?: () => void;
  /** Called when navigating to the next result */
  onNext?: () => void;
  /** Whether there is a previous result to navigate to */
  hasPrevious?: boolean;
  /** Whether there is a next result to navigate to */
  hasNext?: boolean;
  /** Called after a successful approval status change */
  onStatusChange?: (id: string, status: ApprovalStatus) => void;
  /** Additional CSS classes */
  className?: string;
}

/** Label pill above each viewer pane */
function PaneLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-0 top-0 z-10 rounded-br rounded-tl bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
      {children}
    </div>
  );
}

/** Image pane with scroll-based panning; scroll is exposed via ref for sync */
const ScrollPane = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('relative overflow-auto', className)}
    {...props}
  />
));
ScrollPane.displayName = 'ScrollPane';

/**
 * SideBySideViewer is the primary visual diff component for the Test Execution
 * Dashboard. It renders baseline, actual, and diff views of a visual regression
 * test result and supports:
 *
 * - **Side-by-side mode**: three synchronized panes (baseline | actual | diff)
 * - **Swipe mode**: draggable divider between baseline and actual
 * - **Overlay mode**: diff overlay with three visualization modes (highlight,
 *   diff-only, opacity blend)
 * - Zoom (25 % – 400 %) with scroll-synchronized panning
 * - Bounding-box toggle for highlighting changed regions
 * - Approve / reject actions wired to the approval workflow API
 * - Keyboard shortcuts for efficient keyboard-driven workflows
 *
 * **Keyboard shortcuts** (when not focused on an input):
 * | Key | Action |
 * |-----|--------|
 * | `1` | Side-by-side mode |
 * | `2` | Swipe mode |
 * | `3` | Overlay mode |
 * | `+` / `=` | Zoom in |
 * | `-` | Zoom out |
 * | `0` | Reset zoom to 100 % |
 * | `b` | Toggle bounding boxes |
 * | `a` | Approve current result |
 * | `r` | Reject current result |
 * | `←` / `h` | Navigate to previous result |
 * | `→` / `l` | Navigate to next result |
 */
export function SideBySideViewer({
  result,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  onStatusChange,
  className,
}: SideBySideViewerProps) {
  const [viewMode, setViewMode] = React.useState<ViewMode>('side-by-side');
  const [diffMode, setDiffMode] = React.useState<DiffMode>('highlight');
  const [zoom, setZoom] = React.useState(1);
  const [showBoundingBoxes, setShowBoundingBoxes] = React.useState(true);
  const [sliderPosition, setSliderPosition] = React.useState(50);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [localStatus, setLocalStatus] = React.useState<ApprovalStatus>(result.status);

  // Keep localStatus in sync when result changes (e.g. navigation)
  React.useEffect(() => {
    setLocalStatus(result.status);
    setErrorMessage(null);
  }, [result.id, result.status]);

  // Pane scroll refs for synchronization
  const leftPaneRef = React.useRef<HTMLDivElement>(null);
  const middlePaneRef = React.useRef<HTMLDivElement>(null);
  const rightPaneRef = React.useRef<HTMLDivElement>(null);
  const isSyncingScroll = React.useRef(false);

  // Swipe slider drag state
  const sliderContainerRef = React.useRef<HTMLDivElement>(null);
  const isDraggingSlider = React.useRef(false);

  // ── Zoom helpers ───────────────────────────────────────────────────────────

  const zoomIn = React.useCallback(() => {
    setZoom((z) => {
      const next = ZOOM_LEVELS.find((l) => l > z);
      return next !== undefined ? next : ZOOM_MAX;
    });
  }, []);

  const zoomOut = React.useCallback(() => {
    setZoom((z) => {
      const prev = [...ZOOM_LEVELS].reverse().find((l) => l < z);
      return prev !== undefined ? prev : ZOOM_MIN;
    });
  }, []);

  const resetZoom = React.useCallback(() => setZoom(1), []);

  // ── Scroll sync ───────────────────────────────────────────────────────────

  const handlePaneScroll = React.useCallback(
    (source: React.UIEvent<HTMLDivElement>) => {
      if (isSyncingScroll.current) return;
      isSyncingScroll.current = true;

      const { scrollLeft, scrollTop } = source.currentTarget;
      [leftPaneRef, middlePaneRef, rightPaneRef].forEach((ref) => {
        if (ref.current && ref.current !== source.currentTarget) {
          ref.current.scrollLeft = scrollLeft;
          ref.current.scrollTop = scrollTop;
        }
      });

      requestAnimationFrame(() => {
        isSyncingScroll.current = false;
      });
    },
    [],
  );

  // ── Swipe slider ──────────────────────────────────────────────────────────

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSlider.current || !sliderContainerRef.current) return;
      const rect = sliderContainerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSliderPosition(Math.max(2, Math.min(98, pct)));
    };

    const handleMouseUp = () => {
      isDraggingSlider.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Touch support for swipe slider
  const handleSliderTouchMove = React.useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!sliderContainerRef.current) return;
      const touch = e.touches[0];
      const rect = sliderContainerRef.current.getBoundingClientRect();
      const pct = ((touch.clientX - rect.left) / rect.width) * 100;
      setSliderPosition(Math.max(2, Math.min(98, pct)));
    },
    [],
  );

  // ── Approval handlers ─────────────────────────────────────────────────────

  const handleStatusChange = React.useCallback(
    (id: string, status: ApprovalStatus) => {
      setLocalStatus(status);
      onStatusChange?.(id, status);
    },
    [onStatusChange],
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (e.key) {
        case '1':
          e.preventDefault();
          setViewMode('side-by-side');
          break;
        case '2':
          e.preventDefault();
          setViewMode('swipe');
          break;
        case '3':
          e.preventDefault();
          setViewMode('overlay');
          break;
        case '+':
        case '=':
          e.preventDefault();
          zoomIn();
          break;
        case '-':
          e.preventDefault();
          zoomOut();
          break;
        case '0':
          e.preventDefault();
          resetZoom();
          break;
        case 'b':
        case 'B':
          setShowBoundingBoxes((v) => !v);
          break;
        case 'ArrowLeft':
        case 'h':
          if (hasPrevious) onPrevious?.();
          break;
        case 'ArrowRight':
        case 'l':
          if (hasNext) onNext?.();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomIn, zoomOut, resetZoom, hasPrevious, hasNext, onPrevious, onNext]);

  // ── Derived values ────────────────────────────────────────────────────────

  const imageWidthPercent = `${zoom * 100}%`;

  const diffPercentLabel =
    result.diffPercentage !== undefined
      ? `${result.diffPercentage.toFixed(2)}% changed`
      : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={cn('flex flex-col gap-0 rounded-lg border bg-card shadow-sm', className)}>
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex items-center gap-1">
          {/* Navigation */}
          <Button
            size="icon"
            variant="ghost"
            onClick={onPrevious}
            disabled={!hasPrevious}
            aria-label="Previous result (← or H)"
            title="Previous (←)"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onNext}
            disabled={!hasNext}
            aria-label="Next result (→ or L)"
            title="Next (→)"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <div className="mx-1 h-5 w-px bg-border" />

          {/* View mode */}
          <Button
            size="sm"
            variant={viewMode === 'side-by-side' ? 'secondary' : 'ghost'}
            onClick={() => setViewMode('side-by-side')}
            aria-label="Side-by-side view (1)"
            title="Side-by-side (1)"
            className="gap-1.5"
          >
            <Columns2 className="h-4 w-4" />
            <span className="hidden sm:inline">Side-by-side</span>
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'swipe' ? 'secondary' : 'ghost'}
            onClick={() => setViewMode('swipe')}
            aria-label="Swipe compare view (2)"
            title="Swipe (2)"
            className="gap-1.5"
          >
            <GripVertical className="h-4 w-4" />
            <span className="hidden sm:inline">Swipe</span>
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'overlay' ? 'secondary' : 'ghost'}
            onClick={() => setViewMode('overlay')}
            aria-label="Overlay view (3)"
            title="Overlay (3)"
            className="gap-1.5"
          >
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Overlay</span>
          </Button>

          {/* Diff mode selector (overlay mode only) */}
          {viewMode === 'overlay' && (
            <>
              <div className="mx-1 h-5 w-px bg-border" />
              {(['highlight', 'diff-only', 'opacity'] as DiffMode[]).map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={diffMode === m ? 'secondary' : 'ghost'}
                  onClick={() => setDiffMode(m)}
                  className="capitalize"
                >
                  {m.replace('-', ' ')}
                </Button>
              ))}
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Bounding boxes toggle */}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowBoundingBoxes((v) => !v)}
            aria-label={showBoundingBoxes ? 'Hide bounding boxes (B)' : 'Show bounding boxes (B)'}
            title={`${showBoundingBoxes ? 'Hide' : 'Show'} bounding boxes (B)`}
          >
            {showBoundingBoxes ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </Button>

          <div className="mx-1 h-5 w-px bg-border" />

          {/* Zoom controls */}
          <Button
            size="icon"
            variant="ghost"
            onClick={zoomOut}
            disabled={zoom <= ZOOM_MIN}
            aria-label="Zoom out (-)"
            title="Zoom out (-)"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span
            className="w-14 text-center text-xs tabular-nums text-muted-foreground"
            aria-label={`Zoom level: ${Math.round(zoom * 100)}%`}
          >
            {Math.round(zoom * 100)}%
          </span>
          <Button
            size="icon"
            variant="ghost"
            onClick={zoomIn}
            disabled={zoom >= ZOOM_MAX}
            aria-label="Zoom in (+)"
            title="Zoom in (+)"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={resetZoom}
            disabled={zoom === 1}
            aria-label="Reset zoom (0)"
            title="Reset zoom (0)"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Meta row ── */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{result.testName}</span>
        <div className="flex items-center gap-3">
          {diffPercentLabel && (
            <span className="text-orange-600 dark:text-orange-400">{diffPercentLabel}</span>
          )}
          {result.changedRegions && result.changedRegions.length > 0 && (
            <span>{result.changedRegions.length} changed region{result.changedRegions.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* ── Viewer area ── */}
      <div className="min-h-0 flex-1">
        {/* Error banner */}
        {errorMessage && (
          <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        {viewMode === 'side-by-side' && (
          <SideBySidePanes
            result={result}
            zoom={imageWidthPercent}
            showBoundingBoxes={showBoundingBoxes}
            leftPaneRef={leftPaneRef}
            middlePaneRef={middlePaneRef}
            rightPaneRef={rightPaneRef}
            onScroll={handlePaneScroll}
            onError={setErrorMessage}
          />
        )}

        {viewMode === 'swipe' && (
          <SwipeView
            result={result}
            sliderPosition={sliderPosition}
            zoom={imageWidthPercent}
            containerRef={sliderContainerRef}
            isDraggingRef={isDraggingSlider}
            onTouchMove={handleSliderTouchMove}
            onError={setErrorMessage}
          />
        )}

        {viewMode === 'overlay' && (
          <OverlayView
            result={result}
            diffMode={diffMode}
            zoom={imageWidthPercent}
            showBoundingBoxes={showBoundingBoxes}
            onError={setErrorMessage}
          />
        )}
      </div>

      {/* ── Approval footer ── */}
      <div className="flex items-center justify-end border-t px-4 py-2">
        <ApprovalControls
          resultId={result.id}
          currentStatus={localStatus}
          onStatusChange={handleStatusChange}
          onError={setErrorMessage}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-views
// ─────────────────────────────────────────────────────────────────────────────

interface BasePaneProps {
  result: VisualTestResult;
  zoom: string;
  onError: (msg: string) => void;
}

// ── Side-by-side ──

interface SideBySidePanesProps extends BasePaneProps {
  showBoundingBoxes: boolean;
  leftPaneRef: React.RefObject<HTMLDivElement | null>;
  middlePaneRef: React.RefObject<HTMLDivElement | null>;
  rightPaneRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

function SideBySidePanes({
  result,
  zoom,
  showBoundingBoxes,
  leftPaneRef,
  middlePaneRef,
  rightPaneRef,
  onScroll,
  onError,
}: SideBySidePanesProps) {
  return (
    <div className="grid h-full grid-cols-3 divide-x">
      {/* Baseline */}
      <ScrollPane ref={leftPaneRef} className="bg-[#1a1a1a]" onScroll={onScroll}>
        <PaneLabel>Baseline</PaneLabel>
        <div style={{ width: zoom }}>
          <ImageOrPlaceholder
            src={result.baselineUrl}
            alt="Baseline screenshot"
            onError={() => onError('Baseline image failed to load')}
          />
        </div>
      </ScrollPane>

      {/* Actual */}
      <ScrollPane ref={middlePaneRef} className="bg-[#1a1a1a]" onScroll={onScroll}>
        <PaneLabel>Actual</PaneLabel>
        <div style={{ width: zoom }}>
          <DiffOverlay
            baselineUrl={result.baselineUrl}
            actualUrl={result.actualUrl}
            changedRegions={result.changedRegions}
            mode="highlight"
            showBoundingBoxes={showBoundingBoxes}
            onError={onError}
          />
        </div>
      </ScrollPane>

      {/* Diff */}
      <ScrollPane ref={rightPaneRef} className="bg-[#1a1a1a]" onScroll={onScroll}>
        <PaneLabel>Diff</PaneLabel>
        <div style={{ width: zoom }}>
          <DiffOverlay
            baselineUrl={result.baselineUrl}
            actualUrl={result.actualUrl}
            diffUrl={result.diffUrl}
            changedRegions={result.changedRegions}
            mode="diff-only"
            showBoundingBoxes={showBoundingBoxes}
            onError={onError}
          />
        </div>
      </ScrollPane>
    </div>
  );
}

// ── Swipe ──

interface SwipeViewProps extends BasePaneProps {
  sliderPosition: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isDraggingRef: React.MutableRefObject<boolean>;
  onTouchMove: (e: React.TouchEvent<HTMLDivElement>) => void;
}

function SwipeView({
  result,
  zoom,
  sliderPosition,
  containerRef,
  isDraggingRef,
  onTouchMove,
}: SwipeViewProps) {
  return (
    <div
      ref={containerRef}
      className="relative select-none overflow-auto bg-[#1a1a1a]"
      onTouchMove={onTouchMove}
    >
      <div style={{ width: zoom, position: 'relative' }}>
        {/* Baseline — always rendered full-width */}
        <ImageOrPlaceholder
          src={result.baselineUrl}
          alt="Baseline screenshot"
          className="block w-full"
        />

        {/* Actual — clipped to left of slider */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
          aria-hidden="true"
        >
          <ImageOrPlaceholder
            src={result.actualUrl}
            alt="Actual screenshot"
            className="block w-full"
          />
        </div>

        {/* Slider handle */}
        <div
          role="slider"
          aria-label="Comparison slider"
          aria-valuenow={Math.round(sliderPosition)}
          aria-valuemin={2}
          aria-valuemax={98}
          tabIndex={0}
          className="absolute bottom-0 top-0 z-20 flex cursor-ew-resize items-center justify-center"
          style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
          onMouseDown={(e) => {
            e.preventDefault();
            isDraggingRef.current = true;
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.stopPropagation();
              e.preventDefault();
            }
            if (e.key === 'ArrowRight') {
              e.stopPropagation();
              e.preventDefault();
            }
          }}
        >
          {/* Vertical line */}
          <div className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.8)]" />
          {/* Handle knob */}
          <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-lg">
            <Loader2 className="hidden h-4 w-4" aria-hidden="true" />
            <span className="text-[10px] font-bold text-gray-700 select-none">⇔</span>
          </div>
        </div>

        {/* Labels */}
        <div
          className="pointer-events-none absolute bottom-2 left-2 z-10 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white"
          aria-hidden="true"
        >
          Baseline
        </div>
        <div
          className="pointer-events-none absolute bottom-2 right-2 z-10 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white"
          aria-hidden="true"
        >
          Actual
        </div>
      </div>
    </div>
  );
}

// ── Overlay ──

interface OverlayViewProps extends BasePaneProps {
  diffMode: DiffMode;
  showBoundingBoxes: boolean;
}

function OverlayView({
  result,
  zoom,
  diffMode,
  showBoundingBoxes,
  onError,
}: OverlayViewProps) {
  return (
    <div className="overflow-auto bg-[#1a1a1a]">
      <div style={{ width: zoom }}>
        <DiffOverlay
          baselineUrl={result.baselineUrl}
          actualUrl={result.actualUrl}
          diffUrl={result.diffUrl}
          changedRegions={result.changedRegions}
          mode={diffMode}
          showBoundingBoxes={showBoundingBoxes}
          onError={onError}
        />
      </div>
    </div>
  );
}

// ── Shared helpers ──

function ImageOrPlaceholder({
  src,
  alt,
  className,
  onError,
}: {
  src: string | null;
  alt: string;
  className?: string;
  onError?: () => void;
}) {
  const [state, setState] = React.useState<'loading' | 'loaded' | 'error'>('loading');

  React.useEffect(() => {
    setState('loading');
  }, [src]);

  if (!src) {
    return (
      <div
        className={cn(
          'flex aspect-video items-center justify-center bg-muted/20 text-sm text-muted-foreground',
          className,
        )}
      >
        No image available
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}
      {state === 'error' && (
        <div className="flex aspect-video items-center justify-center bg-destructive/10 text-sm text-destructive">
          Failed to load image
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={cn('block w-full', state !== 'loaded' && 'invisible')}
        onLoad={() => setState('loaded')}
        onError={() => {
          setState('error');
          onError?.();
        }}
        draggable={false}
      />
    </div>
  );
}

SideBySideViewer.displayName = 'SideBySideViewer';
