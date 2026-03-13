'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left';
export type TooltipAlign = 'start' | 'center' | 'end';

export interface TooltipProps {
  /** The element that triggers the tooltip. */
  children: React.ReactNode;
  /** The tooltip content. */
  content: React.ReactNode;
  /** Which side to render the tooltip. Defaults to 'top'. */
  side?: TooltipSide;
  /** Alignment along the trigger. Defaults to 'center'. */
  align?: TooltipAlign;
  /** Additional class names for the tooltip bubble. */
  className?: string;
  /** Disable the tooltip entirely. */
  disabled?: boolean;
  /** Delay before showing the tooltip (ms). Defaults to 200. */
  delayMs?: number;
}

// ─── Position class maps ──────────────────────────────────────────────────────

const sideClasses: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

const alignOverrides: Partial<Record<TooltipSide, Record<TooltipAlign, string>>> = {
  top: {
    start: 'bottom-full left-0 translate-x-0 mb-2',
    center: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    end: 'bottom-full right-0 translate-x-0 mb-2',
  },
  bottom: {
    start: 'top-full left-0 translate-x-0 mt-2',
    center: 'top-full left-1/2 -translate-x-1/2 mt-2',
    end: 'top-full right-0 translate-x-0 mt-2',
  },
  left: {
    start: 'right-full top-0 translate-y-0 mr-2',
    center: 'right-full top-1/2 -translate-y-1/2 mr-2',
    end: 'right-full bottom-0 translate-y-0 mr-2',
  },
  right: {
    start: 'left-full top-0 translate-y-0 ml-2',
    center: 'left-full top-1/2 -translate-y-1/2 ml-2',
    end: 'left-full bottom-0 translate-y-0 ml-2',
  },
};

const arrowClasses: Record<TooltipSide, string> = {
  top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-0 border-t-gray-800',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-0 border-b-gray-800',
  left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-0 border-l-gray-800',
  right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-0 border-r-gray-800',
};

// ─── Tooltip component ────────────────────────────────────────────────────────

/**
 * Lightweight, accessible tooltip built with pure Tailwind CSS.
 * No external dependencies required.
 */
export function Tooltip({
  children,
  content,
  side = 'top',
  align = 'center',
  className,
  disabled = false,
  delayMs = 200,
}: TooltipProps) {
  const [visible, setVisible] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = React.useCallback(() => {
    if (disabled) return;
    timerRef.current = setTimeout(() => setVisible(true), delayMs);
  }, [disabled, delayMs]);

  const hide = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const positionClass =
    alignOverrides[side]?.[align] ?? sideClasses[side];

  if (disabled) return <>{children}</>;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={cn(
            'absolute z-50 whitespace-nowrap rounded-md bg-gray-800 px-2.5 py-1.5 text-xs text-white shadow-md',
            'animate-in fade-in-0 zoom-in-95 duration-100',
            positionClass,
            className,
          )}
        >
          {content}
          {/* Arrow */}
          <span
            aria-hidden
            className={cn(
              'absolute h-0 w-0 border-4',
              arrowClasses[side],
            )}
          />
        </span>
      )}
    </span>
  );
}

// ─── Contextual help tooltip ──────────────────────────────────────────────────

export interface HelpTooltipProps {
  /** Help text to display. */
  text: string;
  side?: TooltipSide;
  className?: string;
}

/**
 * Small question-mark icon that shows contextual help on hover.
 * Drop it inline next to form labels or dashboard elements.
 */
export function HelpTooltip({ text, side = 'top', className }: HelpTooltipProps) {
  return (
    <Tooltip content={text} side={side}>
      <span
        className={cn(
          'ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600 hover:bg-gray-300',
          className,
        )}
        aria-label={`Help: ${text}`}
      >
        ?
      </span>
    </Tooltip>
  );
}
