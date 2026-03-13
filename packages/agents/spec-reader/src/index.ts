/**
 * @semkiest/spec-reader
 *
 * Spec Reader Agent — Acceptance Criteria Parser (Jira / Asana Format).
 *
 * Public API surface:
 * - `parseAcceptanceCriteria` — main entry point; auto-detects or uses the
 *   specified format and returns structured `TestScenario` objects.
 * - `parseJiraAcceptanceCriteria` — low-level Gherkin parser for Jira text.
 * - `parseAsanaAcceptanceCriteria` — low-level parser for Asana descriptions.
 * - `stripJiraMarkup` — utility to remove Jira wiki markup from text.
 * - All shared TypeScript types.
 */

export { parseAcceptanceCriteria } from './ac-parser';
export { parseJiraAcceptanceCriteria, stripJiraMarkup } from './jira-format';
export { parseAsanaAcceptanceCriteria } from './asana-format';

export type {
  GherkinKeyword,
  GherkinScenario,
  GherkinStep,
  ParseError,
  ParseOptions,
  ParseResult,
  SourceSystem,
  StepRole,
  TestScenario,
} from './types';
