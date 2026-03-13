/**
 * Acceptance Criteria Reader.
 *
 * Reads acceptance criteria (AC) from Jira stories and converts them into
 * structured test case specs that can be passed to the SemkiEst Spec Reader
 * Agent or test generation pipeline.
 */

import { JiraClient, JiraDocNode, JiraDocument, JiraIssue } from './client.js';
import { JiraIntegrationConfig } from './config.js';

/** A single parsed acceptance criterion. */
export interface AcceptanceCriterion {
  /** Stable identifier derived from position in the source issue */
  id: string;
  /** Plain-text criterion content */
  text: string;
  /**
   * Detected format of the criterion text:
   * - "given_when_then": BDD-style "Given ... When ... Then ..."
   * - "bullet": plain bullet-point item
   * - "numbered": numbered list item
   */
  format: 'given_when_then' | 'bullet' | 'numbered';
}

/** Structured acceptance criteria extracted from a Jira issue. */
export interface AcceptanceCriteria {
  issueKey: string;
  summary: string;
  /** Ordered list of parsed criteria */
  criteria: AcceptanceCriterion[];
  /** Raw plain-text content before parsing */
  rawText: string;
}

/** A test case generated from an acceptance criterion. */
export interface GeneratedTestCase {
  /** Links back to the source criterion */
  criterionId: string;
  issueKey: string;
  title: string;
  description: string;
  /** BDD steps (empty for non-GWT criteria) */
  steps: GwtStep[];
}

export interface GwtStep {
  keyword: 'Given' | 'When' | 'Then' | 'And';
  text: string;
}

// ---------------------------------------------------------------------------
// ADF text extraction
// ---------------------------------------------------------------------------

/**
 * Recursively extracts plain text from an Atlassian Document Format (ADF) node.
 * Block-level nodes are separated by newlines; list items are prefixed with "- ".
 */
function extractTextFromAdf(node: JiraDocNode, depth = 0): string {
  if (node.type === 'text') {
    return node.text ?? '';
  }

  const children = node.content ?? [];

  switch (node.type) {
    case 'paragraph':
      return children.map((c) => extractTextFromAdf(c, depth)).join('') + '\n';

    case 'bulletList':
    case 'orderedList':
      return children.map((c) => extractTextFromAdf(c, depth + 1)).join('');

    case 'listItem':
      return `${'  '.repeat(depth - 1)}- ${children.map((c) => extractTextFromAdf(c, depth)).join('').trim()}\n`;

    case 'heading':
      return children.map((c) => extractTextFromAdf(c, depth)).join('') + '\n';

    case 'hardBreak':
      return '\n';

    case 'rule':
      return '\n---\n';

    case 'codeBlock':
    case 'blockquote':
    case 'panel':
    case 'doc':
    default:
      return children.map((c) => extractTextFromAdf(c, depth)).join('');
  }
}

function adfToText(doc: JiraDocument | null): string {
  if (!doc) return '';
  return extractTextFromAdf(doc).trim();
}

// ---------------------------------------------------------------------------
// Criterion parsing
// ---------------------------------------------------------------------------

const GWT_REGEX = /\b(given|when|then|and)\b/i;

function detectFormat(text: string): AcceptanceCriterion['format'] {
  if (GWT_REGEX.test(text)) return 'given_when_then';
  if (/^\d+[\.\)]/.test(text.trim())) return 'numbered';
  return 'bullet';
}

function parseCriteriaFromText(rawText: string): AcceptanceCriterion[] {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const criteria: AcceptanceCriterion[] = [];

  // Strategy: group consecutive GWT lines into a single criterion; treat each
  // bullet/numbered line as its own criterion.
  let gwtBuffer: string[] = [];

  const flushGwt = (index: number) => {
    if (gwtBuffer.length === 0) return;
    criteria.push({
      id: `ac-${index + 1}`,
      text: gwtBuffer.join(' '),
      format: 'given_when_then',
    });
    gwtBuffer = [];
  };

  lines.forEach((line, i) => {
    const cleanLine = line.replace(/^[-*•]\s*/, '');
    const format = detectFormat(cleanLine);

    if (format === 'given_when_then') {
      gwtBuffer.push(cleanLine);
    } else {
      flushGwt(i);
      criteria.push({
        id: `ac-${criteria.length + 1}`,
        text: cleanLine,
        format,
      });
    }
  });

  flushGwt(lines.length);

  return criteria;
}

// ---------------------------------------------------------------------------
// GWT step extraction
// ---------------------------------------------------------------------------

function parseGwtSteps(text: string): GwtStep[] {
  const steps: GwtStep[] = [];
  const stepRegex = /\b(Given|When|Then|And)\b(.+?)(?=\b(?:Given|When|Then|And)\b|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = stepRegex.exec(text)) !== null) {
    steps.push({
      keyword: match[1] as GwtStep['keyword'],
      text: match[2].trim(),
    });
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Test case generation
// ---------------------------------------------------------------------------

function generateTestCase(criterion: AcceptanceCriterion, issueKey: string): GeneratedTestCase {
  const steps = criterion.format === 'given_when_then' ? parseGwtSteps(criterion.text) : [];

  const title =
    criterion.format === 'given_when_then'
      ? `[${issueKey}] BDD: ${criterion.text.slice(0, 80).trim()}`
      : `[${issueKey}] AC: ${criterion.text.slice(0, 80).trim()}`;

  return {
    criterionId: criterion.id,
    issueKey,
    title,
    description: criterion.text,
    steps,
  };
}

// ---------------------------------------------------------------------------
// AcReader class
// ---------------------------------------------------------------------------

/**
 * Reads and parses acceptance criteria from Jira stories.
 */
export class AcReader {
  private readonly client: JiraClient;

  constructor(config: JiraIntegrationConfig) {
    this.client = new JiraClient({
      baseUrl: config.baseUrl,
      email: config.email,
      apiToken: config.apiToken,
    });
  }

  /**
   * Fetch a Jira issue and extract its acceptance criteria.
   *
   * The reader first looks for a dedicated AC custom field (if configured
   * via `acCustomField`). If not present, it falls back to parsing the issue
   * description for GWT-style or bullet-list acceptance criteria.
   *
   * @param issueKey  Jira issue key, e.g. "SEM-42"
   * @param acCustomField  Optional Jira custom field ID that contains AC, e.g. "customfield_10016"
   */
  async readAcceptanceCriteria(
    issueKey: string,
    acCustomField?: string,
  ): Promise<AcceptanceCriteria> {
    const issue = await this.client.getIssue(issueKey);
    return this.parseIssue(issue, acCustomField);
  }

  /**
   * Parse an already-fetched Jira issue into structured acceptance criteria.
   */
  parseIssue(issue: JiraIssue, acCustomField?: string): AcceptanceCriteria {
    let rawText = '';

    if (acCustomField) {
      const customValue = issue.fields[acCustomField];
      if (typeof customValue === 'string') {
        rawText = customValue;
      } else if (customValue && typeof customValue === 'object') {
        rawText = adfToText(customValue as JiraDocument);
      }
    }

    if (!rawText) {
      rawText = adfToText(issue.fields.description);
    }

    const criteria = parseCriteriaFromText(rawText);

    return {
      issueKey: issue.key,
      summary: issue.fields.summary,
      criteria,
      rawText,
    };
  }

  /**
   * Convert acceptance criteria into test case specs.
   *
   * Each criterion produces one {@link GeneratedTestCase}. BDD-format criteria
   * are annotated with parsed GWT steps.
   */
  generateTestCases(ac: AcceptanceCriteria): GeneratedTestCase[] {
    return ac.criteria.map((criterion) => generateTestCase(criterion, ac.issueKey));
  }

  /**
   * Convenience: fetch an issue and return ready-to-use test case specs.
   */
  async extractTestCases(
    issueKey: string,
    acCustomField?: string,
  ): Promise<GeneratedTestCase[]> {
    const ac = await this.readAcceptanceCriteria(issueKey, acCustomField);
    return this.generateTestCases(ac);
  }
}
