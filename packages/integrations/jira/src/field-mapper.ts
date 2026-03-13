import type { JiraPriority, SeverityLevel } from './types';

/**
 * Maps a SemkiEst severity level to a Jira priority name.
 *
 * Mapping:
 *   Critical → Highest
 *   High     → High
 *   Medium   → Medium
 *   Low      → Low
 *
 * @param severity - SemkiEst severity level.
 * @returns Jira priority name.
 */
export function mapSeverityToPriority(severity: SeverityLevel): JiraPriority {
  const mapping: Record<SeverityLevel, JiraPriority> = {
    Critical: 'Highest',
    High: 'High',
    Medium: 'Medium',
    Low: 'Low',
  };

  return mapping[severity];
}

/**
 * Maps a Jira priority back to a SemkiEst severity level.
 * Useful when reading Jira issue data and converting to SemkiEst concepts.
 *
 * Mapping:
 *   Highest → Critical
 *   High    → High
 *   Medium  → Medium
 *   Low     → Low
 *   Lowest  → Low  (conservative fall-through)
 *
 * @param priority - Jira priority name.
 * @returns SemkiEst severity level.
 */
export function mapPriorityToSeverity(priority: JiraPriority): SeverityLevel {
  const mapping: Record<JiraPriority, SeverityLevel> = {
    Highest: 'Critical',
    High: 'High',
    Medium: 'Medium',
    Low: 'Low',
    Lowest: 'Low',
  };

  return mapping[priority];
}

/**
 * Builds a standard set of Jira labels for a SemkiEst bug report.
 *
 * Labels always include "semkiest" and "automated-test". Severity and optional
 * extras are appended.
 *
 * @param severity - Test failure severity.
 * @param extra - Any additional labels to include.
 * @returns Array of label strings.
 */
export function buildBugLabels(severity: SeverityLevel, extra: string[] = []): string[] {
  return ['semkiest', 'automated-test', severity.toLowerCase(), ...extra];
}

/**
 * Produces a short, human-readable ticket summary from a test name and severity.
 *
 * Example: "[Critical] Login form validation fails on empty email"
 *
 * @param testName - Name of the failing test.
 * @param severity - Severity of the failure.
 * @returns Formatted summary string (max 255 chars, Jira's summary limit).
 */
export function buildIssueSummary(testName: string, severity: SeverityLevel): string {
  const prefix = `[${severity}] `;
  const maxLength = 255 - prefix.length;
  const truncatedName =
    testName.length > maxLength ? `${testName.slice(0, maxLength - 3)}...` : testName;

  return `${prefix}${truncatedName}`;
}
