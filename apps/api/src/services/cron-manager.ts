import { parseExpression } from 'cron-parser';
import type { ScheduleTemplateDefinition, ScheduleTemplateId, CronValidationResult } from '@semkiest/shared-types';

// =============================================================================
// Schedule Templates
// =============================================================================

/** Built-in schedule templates for common testing patterns. */
export const SCHEDULE_TEMPLATES: ScheduleTemplateDefinition[] = [
  {
    id: 'hourly',
    name: 'Hourly',
    description: 'Run every hour at the top of the hour',
    cronExpression: '0 * * * *',
    timezone: 'UTC',
  },
  {
    id: 'daily_smoke',
    name: 'Daily Smoke Test',
    description: 'Run a quick smoke test every morning at 9:00 AM',
    cronExpression: '0 9 * * *',
    timezone: 'UTC',
  },
  {
    id: 'daily_regression',
    name: 'Daily Regression',
    description: 'Full regression suite nightly at 2:00 AM',
    cronExpression: '0 2 * * *',
    timezone: 'UTC',
  },
  {
    id: 'weekly_regression',
    name: 'Weekly Regression',
    description: 'Full regression suite every Monday at 2:00 AM',
    cronExpression: '0 2 * * 1',
    timezone: 'UTC',
  },
  {
    id: 'monthly_full',
    name: 'Monthly Full Suite',
    description: 'Complete test suite on the 1st of every month at 2:00 AM',
    cronExpression: '0 2 1 * *',
    timezone: 'UTC',
  },
];

/** Returns a template by ID, or undefined if not found. */
export function getTemplateById(
  id: ScheduleTemplateId,
): ScheduleTemplateDefinition | undefined {
  return SCHEDULE_TEMPLATES.find((t) => t.id === id);
}

// =============================================================================
// Cron Expression Utilities
// =============================================================================

/**
 * Validates a 5-field cron expression.
 * Returns a validation result with optional error message and preview of next runs.
 */
export function validateCronExpression(
  expression: string,
  timezone = 'UTC',
): CronValidationResult {
  if (!expression || expression.trim() === '') {
    return { valid: false, error: 'Cron expression must not be empty' };
  }

  try {
    const interval = parseExpression(expression, { tz: timezone, iterator: false });
    // Collect next 3 upcoming run times for preview
    const nextRunTimes: string[] = [];
    for (let i = 0; i < 3; i++) {
      nextRunTimes.push((interval.next() as CronDate).toISOString());
    }
    return { valid: true, nextRunTimes };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Invalid cron expression',
    };
  }
}

/**
 * Returns the next N run times for a cron expression in the given timezone.
 * Returns an empty array on parse failure.
 */
export function getNextRunTimes(
  expression: string,
  timezone = 'UTC',
  count = 10,
): Date[] {
  try {
    const interval = parseExpression(expression, { tz: timezone, iterator: false });
    const times: Date[] = [];
    for (let i = 0; i < count; i++) {
      times.push((interval.next() as CronDate).toDate());
    }
    return times;
  } catch {
    return [];
  }
}

/**
 * Returns the immediate next run time for a cron expression, or null on error.
 */
export function getNextRunTime(expression: string, timezone = 'UTC'): Date | null {
  const times = getNextRunTimes(expression, timezone, 1);
  return times[0] ?? null;
}

/**
 * Converts a 5-field cron expression to a human-readable description.
 * Falls back to the raw expression if no known pattern matches.
 */
export function cronToHumanReadable(expression: string): string {
  const trimmed = expression.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) return trimmed;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Every minute
  if (trimmed === '* * * * *') return 'Every minute';

  // Every hour at :00
  if (minute === '0' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'Every hour';
  }

  // Every N minutes
  if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const n = minute.slice(2);
    return `Every ${n} minutes`;
  }

  // Daily at specific time
  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  // Weekly on a specific weekday
  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    dayOfMonth === '*' &&
    month === '*' &&
    /^\d$/.test(dayOfWeek)
  ) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[Number(dayOfWeek)] ?? `day ${dayOfWeek}`;
    return `Every ${dayName} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  // Monthly on a specific day
  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    /^\d+$/.test(dayOfMonth) &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    return `Monthly on day ${dayOfMonth} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  return trimmed;
}

/**
 * Returns true if `runTime` falls within `windowMs` milliseconds before `now`.
 * Used to detect missed schedule windows after a service restart.
 */
export function wasMissed(
  runTime: Date,
  now: Date = new Date(),
  windowMs = 60 * 60 * 1000, // default: 1-hour window
): boolean {
  const diff = now.getTime() - runTime.getTime();
  return diff > 0 && diff <= windowMs;
}

// ---------------------------------------------------------------------------
// Internal helper type — cron-parser's iterator item exposes toISOString
// ---------------------------------------------------------------------------
interface CronDate {
  toDate(): Date;
  toISOString(): string;
}
