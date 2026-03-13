'use client';

import * as React from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Columns2,
  ChevronLeft,
  ChevronRight,
  X,
  Maximize2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import type { Evidence } from '../../types/run';

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.25;

interface ZoomPanImageProps {
  src: string;
  alt: string;
}

/**
 * Image with mouse-wheel zoom and drag-to-pan support.
 */
function ZoomPanImage({ src, alt }: ZoomPanImageProps) {
  const [scale, setScale] = React.useState(1);
  const [origin, setOrigin] = React.useState({ x: 0, y: 0 });
  const isDragging = React.useRef(false);
  const lastPointer = React.useRef({ x: 0, y: 0 });
  const containerRef = React.useRef<HTMLDivElement>(null);

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const handleWheel = React.useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => clampScale(s - e.deltaY * 0.001));
  }, []);

  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    if (scale <= 1) return;
    isDragging.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [scale]);

  const handlePointerMove = React.useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setOrigin((o) => ({ x: o.x + dx, y: o.y + dy }));
  }, []);

  const handlePointerUp = React.useCallback(() => {
    isDragging.current = false;
  }, []);

  const reset = React.useCallback(() => {
    setScale(1);
    setOrigin({ x: 0, y: 0 });
  }, []);

  const zoom = React.useCallback((delta: number) => {
    setScale((s) => clampScale(s + delta));
    if (scale + delta <= 1) setOrigin({ x: 0, y: 0 });
  }, [scale]);

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      {/* Controls */}
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={() => zoom(-ZOOM_STEP)} aria-label="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-sm tabular-nums w-12 text-center">{Math.round(scale * 100)}%</span>
        <Button variant="outline" size="sm" onClick={() => zoom(ZOOM_STEP)} aria-label="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={reset} aria-label="Reset zoom">
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* Image container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden rounded-md bg-muted/30 flex items-center justify-center min-h-0"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ cursor: scale > 1 ? (isDragging.current ? 'grabbing' : 'grab') : 'default' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-w-none select-none pointer-events-none"
          style={{
            transform: `scale(${scale}) translate(${origin.x / scale}px, ${origin.y / scale}px)`,
            transformOrigin: 'center center',
            transition: isDragging.current ? 'none' : 'transform 0.15s ease-out',
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}

interface ComparisonViewProps {
  actualSrc: string;
  baselineSrc: string;
  label: string;
}

/** Side-by-side comparison of actual vs baseline screenshot. */
function ComparisonView({ actualSrc, baselineSrc, label }: ComparisonViewProps) {
  return (
    <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
      <div className="flex flex-col gap-2 min-h-0">
        <p className="text-xs font-medium text-muted-foreground shrink-0">Baseline</p>
        <div className="flex-1 overflow-hidden rounded-md bg-muted/30 flex items-center justify-center min-h-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={baselineSrc}
            alt={`Baseline: ${label}`}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2 min-h-0">
        <p className="text-xs font-medium text-muted-foreground shrink-0">Actual</p>
        <div className="flex-1 overflow-hidden rounded-md bg-muted/30 flex items-center justify-center min-h-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={actualSrc}
            alt={`Actual: ${label}`}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      </div>
    </div>
  );
}

export interface EvidenceViewerProps {
  /** The evidence item to display initially. */
  evidence: Evidence | null;
  /** All evidence items for the current test (enables navigation). */
  allEvidence?: Evidence[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Full-screen evidence viewer with zoom/pan, side-by-side comparison, and
 * multi-item navigation.
 */
export function EvidenceViewer({
  evidence,
  allEvidence = [],
  open,
  onOpenChange,
}: EvidenceViewerProps) {
  const screenshotEvidence = allEvidence.filter((e) => e.type === 'screenshot');
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [isComparison, setIsComparison] = React.useState(false);

  // Sync index when the focused evidence changes
  React.useEffect(() => {
    if (!evidence) return;
    const idx = screenshotEvidence.findIndex((e) => e.id === evidence.id);
    setCurrentIndex(idx >= 0 ? idx : 0);
    setIsComparison(false);
  }, [evidence, screenshotEvidence]);

  const current = screenshotEvidence[currentIndex] ?? evidence;
  const hasComparison = !!(current?.comparisonUrl);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < screenshotEvidence.length - 1;

  const prev = React.useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
    setIsComparison(false);
  }, []);

  const next = React.useCallback(() => {
    setCurrentIndex((i) => Math.min(screenshotEvidence.length - 1, i + 1));
    setIsComparison(false);
  }, [screenshotEvidence.length]);

  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-full h-[90vh] flex flex-col gap-4 p-6">
        <DialogHeader className="shrink-0">
          <div className="flex items-start justify-between gap-4">
            <DialogTitle className="text-base">
              {current.label ?? 'Evidence'}
              {screenshotEvidence.length > 1 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {currentIndex + 1} / {screenshotEvidence.length}
                </span>
              )}
            </DialogTitle>
            <div className="flex items-center gap-2 shrink-0">
              {hasComparison && (
                <Button
                  variant={isComparison ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setIsComparison((v) => !v)}
                  aria-pressed={isComparison}
                >
                  <Columns2 className="h-4 w-4 mr-1.5" />
                  Compare
                </Button>
              )}
              <a
                href={current.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                aria-label="Open in new tab"
              >
                <Maximize2 className="h-4 w-4" />
              </a>
            </div>
          </div>
        </DialogHeader>

        {/* Viewer */}
        <div className="flex-1 flex flex-col min-h-0">
          {isComparison && current.comparisonUrl ? (
            <ComparisonView
              actualSrc={current.url}
              baselineSrc={current.comparisonUrl}
              label={current.label ?? 'Screenshot'}
            />
          ) : (
            <ZoomPanImage src={current.url} alt={current.label ?? 'Evidence screenshot'} />
          )}
        </div>

        {/* Navigation footer */}
        {screenshotEvidence.length > 1 && (
          <div className="flex items-center justify-center gap-3 shrink-0 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={prev}
              disabled={!hasPrev}
              aria-label="Previous screenshot"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex gap-1.5">
              {screenshotEvidence.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setCurrentIndex(i);
                    setIsComparison(false);
                  }}
                  className={cn(
                    'h-2 rounded-full transition-all',
                    i === currentIndex
                      ? 'w-4 bg-primary'
                      : 'w-2 bg-muted hover:bg-muted-foreground/40',
                  )}
                  aria-label={`Go to screenshot ${i + 1}`}
                />
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={next}
              disabled={!hasNext}
              aria-label="Next screenshot"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
