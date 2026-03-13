/**
 * Asana acceptance criteria parser.
 *
 * Parses Asana task descriptions for testable acceptance criteria.
 * Supports:
 *   - Gherkin-style (Given/When/Then) blocks embedded in Asana descriptions
 *   - Structured lists: bullet points, numbered lists, Markdown checkboxes
 *   - Freeform prose with keyword-based classification
 */

import type { GherkinKeyword, GherkinScenario, GherkinStep, StepRole } from './types';
import { parseJiraAcceptanceCriteria } from './jira-format';

/** Matches a Markdown checkbox item: `- [ ] text` or `- [x] text`. */
const CHECKBOX_RE = /^[-*]\s*\[[xX ]?\]\s+(.+)$/;

/** Matches a standard bullet point: `- text`, `* text`, `• text`. */
const BULLET_RE = /^[-*•]\s+(.+)$/;

/** Matches a numbered list item: `1. text` or `1) text`. */
const NUMBERED_RE = /^\d+[.)]\s+(.+)$/;

/** Matches any Gherkin keyword at the start of a line (case-insensitive). */
const GHERKIN_KEYWORD_RE = /^(given|when|then|and|but)\s+/i;

/**
 * Keyword patterns used to classify freeform list items into step roles.
 * Checked in order; first match wins.
 */
const ASSERTION_PATTERNS =
  /\b(should|must|shall|verify|assert|expect|ensure|confirm|display|show|visible|appear|return|redirect|receive|see|find)\b/i;

const PRECONDITION_PATTERNS =
  /\b(given|assuming|prerequisite|precondition|setup|before|initial|exist|logged.?in|authenticated|configured|installed|have)\b/i;

const ACTION_PATTERNS =
  /\b(click|submit|enter|type|navigate|select|choose|fill|press|open|close|drag|drop|upload|download|send|request|call|invoke|trigger|visit|go.?to|input)\b/i;

/**
 * Attempts to classify a freeform text item into a `StepRole` based on
 * linguistic patterns. Falls back to a positional heuristic.
 *
 * @param text - The step text to classify.
 * @param index - 0-based position of this item in the list.
 * @param total - Total number of items in the list.
 */
function classifyItem(text: string, index: number, total: number): StepRole {
  if (ASSERTION_PATTERNS.test(text)) {
    return 'assertion';
  }
  if (PRECONDITION_PATTERNS.test(text)) {
    return 'precondition';
  }
  if (ACTION_PATTERNS.test(text)) {
    return 'action';
  }

  // Positional heuristic: last item → assertion, first item → precondition
  if (index === total - 1 && total > 1) {
    return 'assertion';
  }
  if (index === 0) {
    return 'precondition';
  }
  return 'action';
}

/**
 * Determines the appropriate Gherkin keyword for a step, choosing the primary
 * keyword (`Given`, `When`, `Then`) for the first occurrence of each role and
 * `And` for subsequent steps with the same role.
 */
function chooseKeyword(role: StepRole, seen: Set<StepRole>): GherkinKeyword {
  if (seen.has(role)) {
    return 'And';
  }
  seen.add(role);
  switch (role) {
    case 'precondition':
      return 'Given';
    case 'action':
      return 'When';
    case 'assertion':
      return 'Then';
  }
}

/**
 * Parses a structured (bulleted / numbered / checkbox) list of acceptance
 * criteria items into a single `GherkinScenario`.
 */
function parseStructuredList(items: string[]): GherkinScenario {
  const seenRoles = new Set<StepRole>();
  const steps: GherkinStep[] = items.map((text, index) => {
    const role = classifyItem(text, index, items.length);
    const keyword = chooseKeyword(role, seenRoles);
    return { keyword, role, text };
  });
  return { steps };
}

/**
 * Extracts plain-text items from a block of structured list lines.
 * Recognises Markdown checkboxes, bullet points, and numbered lists.
 * Falls back to including non-empty lines as freeform items.
 */
function extractListItems(lines: string[]): string[] {
  const items: string[] = [];

  for (const line of lines) {
    const checkboxMatch = CHECKBOX_RE.exec(line);
    if (checkboxMatch) {
      items.push(checkboxMatch[1].trim());
      continue;
    }

    const bulletMatch = BULLET_RE.exec(line);
    if (bulletMatch) {
      items.push(bulletMatch[1].trim());
      continue;
    }

    const numberedMatch = NUMBERED_RE.exec(line);
    if (numberedMatch) {
      items.push(numberedMatch[1].trim());
      continue;
    }

    // Include non-trivially-short freeform lines as prose criteria
    const trimmed = line.trim();
    if (trimmed.length > 5) {
      items.push(trimmed);
    }
  }

  return items;
}

/**
 * Returns `true` if the text contains at least one Gherkin keyword line,
 * indicating Gherkin-style syntax should be used for parsing.
 */
function hasGherkinKeywords(lines: string[]): boolean {
  return lines.some((l) => GHERKIN_KEYWORD_RE.test(l.trim()));
}

/**
 * Parses an Asana task description for acceptance criteria.
 *
 * Strategy:
 * 1. If the text contains Gherkin keywords, delegate to the Jira Gherkin parser.
 * 2. Otherwise, extract list items (checkboxes, bullets, numbers, or freeform
 *    prose) and classify each into a step role via keyword matching.
 *
 * @param text - Raw Asana task description text.
 * @returns Array of parsed scenarios; empty array for blank input.
 */
export function parseAsanaAcceptanceCriteria(text: string): GherkinScenario[] {
  if (!text.trim()) {
    return [];
  }

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // If the description contains Gherkin syntax, use the Gherkin parser directly
  if (hasGherkinKeywords(lines)) {
    return parseJiraAcceptanceCriteria(text);
  }

  // Extract structured or freeform list items
  const items = extractListItems(lines);

  if (items.length === 0) {
    return [];
  }

  const scenario = parseStructuredList(items);
  return [scenario];
}
