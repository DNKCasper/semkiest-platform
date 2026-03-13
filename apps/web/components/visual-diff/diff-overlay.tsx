'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';
import type { BoundingBox, DiffMode, ImageDimensions } from './types';

export interface DiffOverlayProps {
  /** URL of the baseline screenshot */
  baselineUrl: string | null;
  /** URL of the actual (new) screenshot */
  actualUrl: string | null;
  /** URL of a pre-computed diff image */
  diffUrl?: string | null;
  /** Detected changed regions to highlight */
  changedRegions?: BoundingBox[];
  /** Visualization mode */
  mode: DiffMode;
  /** Whether to show bounding box overlays */
  showBoundingBoxes?: boolean;
  /** Additional CSS classes for the container */
  className?: string;
  /** Called once both images have loaded successfully */
  onLoad?: () => void;
  /** Called when an image fails to load */
  onError?: (message: string) => void;
}

type ImageLoadState = 'idle' | 'loading' | 'loaded' | 'error';

interface UseImageLoadReturn {
  state: ImageLoadState;
  dimensions: ImageDimensions | null;
  imgRef: React.RefObject<HTMLImageElement | null>;
  handleLoad: () => void;
  handleError: () => void;
}

function useImageLoad(url: string | null): UseImageLoadReturn {
  const [state, setState] = React.useState<ImageLoadState>('idle');
  const [dimensions, setDimensions] = React.useState<ImageDimensions | null>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);

  React.useEffect(() => {
    if (!url) {
      setState('idle');
      setDimensions(null);
      return;
    }
    setState('loading');
    setDimensions(null);
  }, [url]);

  const handleLoad = React.useCallback(() => {
    if (imgRef.current) {
      setDimensions({
        width: imgRef.current.naturalWidth,
        height: imgRef.current.naturalHeight,
      });
    }
    setState('loaded');
  }, []);

  const handleError = React.useCallback(() => {
    setState('error');
  }, []);

  return { state, dimensions, imgRef, handleLoad, handleError };
}

/** Placeholder shown while an image is loading or unavailable */
function ImagePlaceholder({
  message,
  variant = 'loading',
  className,
}: {
  message: string;
  variant?: 'loading' | 'error' | 'empty';
  className?: string;
}) {
  const variantClasses = {
    loading: 'bg-muted text-muted-foreground animate-pulse',
    error: 'bg-destructive/10 text-destructive',
    empty: 'bg-muted/50 text-muted-foreground',
  };

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded text-sm font-medium',
        variantClasses[variant],
        className,
      )}
      aria-label={message}
    >
      <span className="px-4 py-2 text-center">{message}</span>
    </div>
  );
}

/** SVG overlay that draws bounding boxes for changed regions */
function BoundingBoxOverlay({
  regions,
  dimensions,
}: {
  regions: BoundingBox[];
  dimensions: ImageDimensions;
}) {
  if (regions.length === 0) return null;

  return (
    <svg
      viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {regions.map((box, index) => (
        <rect
          key={index}
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          fill="rgba(239, 68, 68, 0.15)"
          stroke="rgb(239, 68, 68)"
          strokeWidth={Math.max(1, dimensions.width / 1000)}
        />
      ))}
    </svg>
  );
}

/** Canvas that blends baseline and actual at 50% opacity each */
function OpacityBlendCanvas({
  baselineUrl,
  actualUrl,
  dimensions,
  className,
}: {
  baselineUrl: string;
  actualUrl: string;
  dimensions: ImageDimensions;
  className?: string;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = React.useState(false);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setRendered(false);

    const baseImg = new Image();
    const actualImg = new Image();
    baseImg.crossOrigin = 'anonymous';
    actualImg.crossOrigin = 'anonymous';

    let loadedCount = 0;

    const tryDraw = () => {
      loadedCount += 1;
      if (loadedCount < 2) return;

      canvas.width = dimensions.width;
      canvas.height = dimensions.height;

      ctx.clearRect(0, 0, dimensions.width, dimensions.height);
      ctx.globalAlpha = 1;
      ctx.drawImage(baseImg, 0, 0);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(actualImg, 0, 0);
      ctx.globalAlpha = 1;

      setRendered(true);
    };

    baseImg.onload = tryDraw;
    actualImg.onload = tryDraw;
    baseImg.src = baselineUrl;
    actualImg.src = actualUrl;
  }, [baselineUrl, actualUrl, dimensions]);

  return (
    <>
      {!rendered && (
        <ImagePlaceholder message="Rendering blend…" className={className} />
      )}
      <canvas
        ref={canvasRef}
        className={cn('block h-full w-full object-contain', !rendered && 'hidden', className)}
        aria-label="Opacity blend of baseline and actual"
      />
    </>
  );
}

/**
 * DiffOverlay renders a visual diff between baseline and actual screenshots.
 *
 * Supports three visualization modes:
 * - `highlight`: actual image with changed-region bounding boxes
 * - `diff-only`: pre-computed diff image (or actual image if diff unavailable)
 * - `opacity`: 50/50 opacity blend of baseline and actual on a canvas
 */
export function DiffOverlay({
  baselineUrl,
  actualUrl,
  diffUrl,
  changedRegions = [],
  mode,
  showBoundingBoxes = true,
  className,
  onLoad,
  onError,
}: DiffOverlayProps) {
  const baselineImage = useImageLoad(baselineUrl);
  const actualImage = useImageLoad(actualUrl);

  // Notify parent when both images have loaded
  React.useEffect(() => {
    if (
      baselineImage.state === 'loaded' &&
      actualImage.state === 'loaded'
    ) {
      onLoad?.();
    }
  }, [baselineImage.state, actualImage.state, onLoad]);

  React.useEffect(() => {
    if (baselineImage.state === 'error') onError?.('Baseline image failed to load');
    if (actualImage.state === 'error') onError?.('Actual image failed to load');
  }, [baselineImage.state, actualImage.state, onError]);

  // Determine natural image size for SVG viewBox (prefer actual, fall back to baseline)
  const imageDimensions =
    actualImage.dimensions ?? baselineImage.dimensions ?? { width: 1, height: 1 };

  // --- Opacity blend mode ---
  if (mode === 'opacity') {
    if (!baselineUrl || !actualUrl) {
      return (
        <ImagePlaceholder
          message="Both baseline and actual images are required for opacity mode"
          variant="empty"
          className={cn('aspect-video', className)}
        />
      );
    }
    if (baselineImage.state === 'error' || actualImage.state === 'error') {
      return (
        <ImagePlaceholder message="Failed to load images" variant="error" className={cn('aspect-video', className)} />
      );
    }
    // Preload both images (hidden) then render canvas
    return (
      <div className={cn('relative', className)}>
        {/* Hidden preload elements */}
        <img
          ref={baselineImage.imgRef}
          src={baselineUrl}
          alt=""
          className="hidden"
          onLoad={baselineImage.handleLoad}
          onError={baselineImage.handleError}
          draggable={false}
        />
        <img
          ref={actualImage.imgRef}
          src={actualUrl}
          alt=""
          className="hidden"
          onLoad={actualImage.handleLoad}
          onError={actualImage.handleError}
          draggable={false}
        />
        {baselineImage.state === 'loaded' && actualImage.state === 'loaded' ? (
          <OpacityBlendCanvas
            baselineUrl={baselineUrl}
            actualUrl={actualUrl}
            dimensions={imageDimensions}
            className="w-full"
          />
        ) : (
          <ImagePlaceholder message="Loading images…" className="aspect-video" />
        )}
        {showBoundingBoxes && baselineImage.state === 'loaded' && (
          <BoundingBoxOverlay regions={changedRegions} dimensions={imageDimensions} />
        )}
      </div>
    );
  }

  // --- Diff-only mode ---
  if (mode === 'diff-only') {
    const src = diffUrl ?? actualUrl;
    if (!src) {
      return (
        <ImagePlaceholder message="No diff image available" variant="empty" className={cn('aspect-video', className)} />
      );
    }
    return (
      <div className={cn('relative', className)}>
        <SingleImage
          src={src}
          alt="Diff visualization"
          onError={() => onError?.('Diff image failed to load')}
          onLoad={onLoad}
        />
        {showBoundingBoxes && (
          <BoundingBoxOverlay regions={changedRegions} dimensions={imageDimensions} />
        )}
      </div>
    );
  }

  // --- Highlight mode (default) ---
  if (!actualUrl) {
    return (
      <ImagePlaceholder message="No actual image available" variant="empty" className={cn('aspect-video', className)} />
    );
  }

  return (
    <div className={cn('relative', className)}>
      <img
        ref={actualImage.imgRef}
        src={actualUrl}
        alt="Actual screenshot"
        className="block w-full"
        onLoad={() => { actualImage.handleLoad(); onLoad?.(); }}
        onError={() => { actualImage.handleError(); onError?.('Actual image failed to load'); }}
        draggable={false}
      />
      {actualImage.state === 'loading' && (
        <ImagePlaceholder message="Loading…" className="absolute inset-0" />
      )}
      {actualImage.state === 'error' && (
        <ImagePlaceholder message="Failed to load image" variant="error" className="absolute inset-0" />
      )}
      {showBoundingBoxes && actualImage.state === 'loaded' && (
        <BoundingBoxOverlay regions={changedRegions} dimensions={imageDimensions} />
      )}
    </div>
  );
}

/** Simple image with loading/error states */
function SingleImage({
  src,
  alt,
  className,
  onLoad,
  onError,
}: {
  src: string;
  alt: string;
  className?: string;
  onLoad?: () => void;
  onError?: () => void;
}) {
  const [state, setState] = React.useState<ImageLoadState>('loading');

  return (
    <>
      {state === 'loading' && <ImagePlaceholder message="Loading…" className={cn('aspect-video', className)} />}
      {state === 'error' && (
        <ImagePlaceholder message="Failed to load image" variant="error" className={cn('aspect-video', className)} />
      )}
      <img
        src={src}
        alt={alt}
        className={cn('block w-full', state !== 'loaded' && 'hidden', className)}
        onLoad={() => { setState('loaded'); onLoad?.(); }}
        onError={() => { setState('error'); onError?.(); }}
        draggable={false}
      />
    </>
  );
}

DiffOverlay.displayName = 'DiffOverlay';
