/**
 * Jira acceptance criteria parser.
 *
 * Parses Gherkin-style (Given/When/Then) acceptance criteria as written in
 * Jira issue descriptions. Supports:
 *   - Multiple `Scenario:` / `Scenario Outline:` blocks
 *   - `And` / `But` connectors that inherit the preceding step's role
 *   - Jira text markup (bold, italic, headers, links, macros)
 */

import type { GherkinKeyword, GherkinScenario, GherkinStep, StepRole } from './types';

/** Matches a Scenario or Scenario Outline header (case-insensitive). */
const SCENARIO_RE = /^scenario(?:\s+outline)?:\s*(.*)$/i;

/**
 * Matches a Gherkin step keyword followed by the step text.
 * Captures: [1] keyword, [2] step text.
 */
const STEP_RE = /^(given|when|then|and|but)\s+(.+)$/i;

/** Jira markup patterns to strip before parsing. */
const JIRA_MARKUP: Array<[RegExp, string]> = [
  // Remove block macros like {code}, {noformat}, {panel:...}, {color:red}...{color}
  [/\{[^}]*\}/g, ''],
  // Bold: *text*
  [/\*([^*\n]+)\*/g, '$1'],
  // Italic: _text_
  [/_([^_\n]+)_/g, '$1'],
  // Underline: +text+
  [/\+([^+\n]+)\+/g, '$1'],
  // Strikethrough: -text-
  [/-([^-\n]+)-/g, '$1'],
  // Monospace: {{text}}
  [/\{\{([^}]+)\}\}/g, '$1'],
  // Jira headers: h1. … h6.
  [/^h[1-6]\.\s*/gm, ''],
  // Wiki-style links with alias: [display text|url]  — keep display text
  [/\[([^\]|]+)\|[^\]]+\]/g, '$1'],
  // Plain wiki links: [text]
  [/\[([^\]]+)\]/g, '$1'],
  // Horizontal rule
  [/^----$/gm, ''],
];

/**
 * Strips Jira text markup from a string, returning plain text.
 */
export function stripJiraMarkup(text: string): string {
  let result = text;
  for (const [pattern, replacement] of JIRA_MARKUP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Resolves the semantic role of an `And` or `But` connector by inheriting
 * the role of the most recent non-connector keyword.
 */
function resolveRole(keyword: GherkinKeyword, lastRole: StepRole): StepRole {
  switch (keyword) {
    case 'Given':
      return 'precondition';
    case 'When':
      return 'action';
    case 'Then':
      return 'assertion';
    case 'And':
    case 'But':
      return lastRole;
  }
}

/**
 * Normalises a raw keyword string to a typed `GherkinKeyword`.
 * Input is expected to already match the STEP_RE capture group.
 */
function toKeyword(raw: string): GherkinKeyword {
  const capitalised = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  return capitalised as GherkinKeyword;
}

/**
 * Parses Jira-style Gherkin acceptance criteria text into an array of
 * `GherkinScenario` objects.
 *
 * Handles:
 *   - One or more `Scenario:` / `Scenario Outline:` blocks
 *   - Bare Given/When/Then blocks without a `Scenario:` header
 *   - `And` / `But` connectors inheriting the preceding step's role
 *   - Jira text markup (stripped before parsing)
 *
 * @param text - Raw Jira acceptance criteria text.
 * @returns Array of parsed scenarios; empty array for blank input.
 */
export function parseJiraAcceptanceCriteria(text: string): GherkinScenario[] {
  if (!text.trim()) {
    return [];
  }

  const cleaned = stripJiraMarkup(text);
  const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);

  const scenarios: GherkinScenario[] = [];
  let current: GherkinScenario | null = null;
  // Default role for the very first And/But connector before any keyword is seen.
  let lastRole: StepRole = 'precondition';

  const flushCurrent = (): void => {
    if (current && current.steps.length > 0) {
      scenarios.push(current);
    }
    current = null;
  };

  for (const line of lines) {
    // Detect a Scenario header
    const scenarioMatch = SCENARIO_RE.exec(line);
    if (scenarioMatch) {
      flushCurrent();
      const title = scenarioMatch[1]?.trim();
      current = { title: title || undefined, steps: [] };
      lastRole = 'precondition';
      continue;
    }

    // Detect a Gherkin step
    const stepMatch = STEP_RE.exec(line);
    if (stepMatch) {
      const keyword = toKeyword(stepMatch[1]);
      const stepText = stepMatch[2].trim();
      const role = resolveRole(keyword, lastRole);

      // Lazily create a scenario if there was no explicit Scenario header
      if (!current) {
        current = { steps: [] };
      }

      const step: GherkinStep = { keyword, role, text: stepText };
      current.steps.push(step);

      // Only update lastRole for primary keywords, not connectors
      if (keyword !== 'And' && keyword !== 'But') {
        lastRole = role;
      }
    }
    // Lines that match neither pattern are ignored (prose, section headings, etc.)
  }

  flushCurrent();
  return scenarios;
}
