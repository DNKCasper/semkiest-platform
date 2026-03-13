/**
 * Acceptance Criteria (AC) Parser — main entry point.
 *
 * Orchestrates format detection and delegates parsing to the appropriate
 * format-specific module (Jira Gherkin or Asana). Converts parsed
 * `GherkinScenario` objects into the canonical `TestScenario` format
 * consumed by all SemkiEst testing agents, with full traceability back to
 * the original source.
 */

import type {
  GherkinScenario,
  ParseError,
  ParseOptions,
  ParseResult,
  SourceSystem,
  TestScenario,
} from './types';
import { parseJiraAcceptanceCriteria } from './jira-format';
import { parseAsanaAcceptanceCriteria } from './asana-format';

/**
 * Detects whether the text is likely Gherkin-style (Jira) or unstructured
 * (Asana / freeform) by looking for Gherkin keywords.
 */
function detectFormat(text: string): SourceSystem {
  const gherkinRe = /\b(given|when|then)\b/i;
  return gherkinRe.test(text) ? 'jira' : 'asana';
}

/**
 * Builds a stable, human-readable scenario ID from the source identifier and
 * a 1-based index.
 *
 * @example `PROJ-123_scenario_1`
 */
function buildScenarioId(sourceId: string, index: number): string {
  return `${sourceId}_scenario_${index + 1}`;
}

/**
 * Derives a scenario title from the parsed scenario's optional title field or
 * a default based on the source ID and index.
 */
function buildScenarioTitle(
  scenario: GherkinScenario,
  sourceId: string,
  index: number,
): string {
  if (scenario.title && scenario.title.length > 0) {
    return scenario.title;
  }
  return `${sourceId} – Scenario ${index + 1}`;
}

/**
 * Converts a `GherkinScenario` into an executable `TestScenario`.
 *
 * @param scenario    - The parsed Gherkin scenario.
 * @param sourceId    - Traceability identifier (Jira key / Asana GID).
 * @param sourceSystem - The originating system.
 * @param index       - 0-based position of this scenario within the result set.
 * @param rawCriteria - The original AC text for traceability.
 */
function toTestScenario(
  scenario: GherkinScenario,
  sourceId: string,
  sourceSystem: SourceSystem,
  index: number,
  rawCriteria: string,
): TestScenario {
  const preconditions = scenario.steps
    .filter((s) => s.role === 'precondition')
    .map((s) => s.text);

  const steps = scenario.steps
    .filter((s) => s.role === 'action')
    .map((s) => s.text);

  const assertions = scenario.steps
    .filter((s) => s.role === 'assertion')
    .map((s) => s.text);

  return {
    id: buildScenarioId(sourceId, index),
    title: buildScenarioTitle(scenario, sourceId, index),
    sourceId,
    sourceSystem,
    preconditions,
    steps,
    assertions,
    rawCriteria,
  };
}

/**
 * Parses acceptance criteria text into structured, executable test scenarios.
 *
 * Format resolution order:
 * 1. If `options.sourceSystem` is `'jira'` → Gherkin parser.
 * 2. If `options.sourceSystem` is `'asana'` → Asana parser.
 * 3. If `options.sourceSystem` is `'freeform'` → auto-detect from text.
 *
 * Edge cases handled gracefully:
 * - Empty or whitespace-only input returns zero scenarios with no errors.
 * - Malformed Gherkin (no steps) produces a `ParseError` and is skipped.
 * - Scenarios with no steps are silently dropped.
 *
 * @param text    - Raw acceptance criteria text from Jira or Asana.
 * @param options - Source metadata and format hints.
 * @returns A `ParseResult` with all extracted scenarios and any parse errors.
 */
export function parseAcceptanceCriteria(
  text: string,
  options: ParseOptions,
): ParseResult {
  const errors: ParseError[] = [];

  // Return an empty result for blank input without raising an error
  if (!text.trim()) {
    return {
      sourceId: options.sourceId,
      sourceSystem: options.sourceSystem,
      scenarios: [],
      errors: [],
    };
  }

  // Determine the effective format
  const effectiveSystem: SourceSystem =
    options.sourceSystem === 'freeform'
      ? detectFormat(text)
      : options.sourceSystem;

  let parsed: GherkinScenario[];

  try {
    if (effectiveSystem === 'jira') {
      parsed = parseJiraAcceptanceCriteria(text);
    } else {
      parsed = parseAsanaAcceptanceCriteria(text);
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown error during parsing';
    errors.push({ message, raw: text });
    return {
      sourceId: options.sourceId,
      sourceSystem: options.sourceSystem,
      scenarios: [],
      errors,
    };
  }

  const scenarios: TestScenario[] = [];

  parsed.forEach((scenario, index) => {
    if (scenario.steps.length === 0) {
      errors.push({
        message: `Scenario ${index + 1} contains no steps and was skipped`,
        raw: scenario.title,
      });
      return;
    }

    scenarios.push(
      toTestScenario(
        scenario,
        options.sourceId,
        options.sourceSystem,
        index,
        text,
      ),
    );
  });

  return {
    sourceId: options.sourceId,
    sourceSystem: options.sourceSystem,
    scenarios,
    errors,
  };
}
