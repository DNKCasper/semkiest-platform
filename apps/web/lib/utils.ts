import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes without conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format a date string for display. */
export function formatDate(dateStr: string | Date | null | undefined): string {
  if (dateStr == null) return '—';
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Format a date+time string for display. */
export function formatDateTime(dateStr: string | Date | null | undefined): string {
  if (dateStr == null) return '—';
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Format a pass rate (0-1) as a percentage string. */
export function formatPassRate(rate: number | undefined | null): string {
  if (rate == null) return '—';
  return `${Math.round(rate * 100)}%`;
}
