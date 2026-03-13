/**
 * Acceptance Criteria (AC) schema for the Spec Reader Agent.
 *
 * Defines the core types used when parsing Jira and Asana acceptance criteria
 * into structured, executable test scenarios.
 */

/** Supported source systems for acceptance criteria. */
export type SourceSystem = 'jira' | 'asana' | 'freeform';

/**
 * Gherkin step keywords.
 * `And` and `But` inherit the semantic role of the preceding non-connector keyword.
 */
export type GherkinKeyword = 'Given' | 'When' | 'Then' | 'And' | 'But';

/**
 * Semantic role of a step in a test scenario.
 * - `precondition`: state that must hold before the action (Given)
 * - `action`: the activity being tested (When)
 * - `assertion`: the expected outcome (Then)
 */
export type StepRole = 'precondition' | 'action' | 'assertion';

/** A single parsed step within a Gherkin scenario. */
export interface GherkinStep {
  /** The original Gherkin keyword used in the source text. */
  keyword: GherkinKeyword;
  /** The resolved semantic role after resolving And/But connectors. */
  role: StepRole;
  /** The step description, stripped of the leading keyword. */
  text: string;
}

/** A complete Gherkin scenario block containing one or more steps. */
export interface GherkinScenario {
  /** Optional scenario title extracted from a `Scenario:` header. */
  title?: string;
  /** Ordered list of steps in this scenario. */
  steps: GherkinStep[];
}

/**
 * An executable test scenario produced from parsed acceptance criteria.
 * Compatible with all SemkiEst testing agents.
 */
export interface TestScenario {
  /** Unique identifier for this scenario, derived from source and index. */
  id: string;
  /** Human-readable title for the scenario. */
  title: string;
  /** Identifier of the original Jira issue key or Asana task GID. */
  sourceId: string;
  /** The system the criteria were sourced from, for traceability. */
  sourceSystem: SourceSystem;
  /** Ordered list of precondition descriptions (from Given steps). */
  preconditions: string[];
  /** Ordered list of action descriptions (from When steps). */
  steps: string[];
  /** Ordered list of assertion descriptions (from Then steps). */
  assertions: string[];
  /** The raw acceptance criteria text this scenario was derived from. */
  rawCriteria: string;
}

/** A single parse error encountered during AC parsing. */
export interface ParseError {
  /** Human-readable description of the error. */
  message: string;
  /** Optional 1-based line number where the error occurred. */
  line?: number;
  /** The raw text that could not be parsed. */
  raw?: string;
}

/** The full result of parsing an acceptance criteria block. */
export interface ParseResult {
  /** Identifier of the original source (Jira key or Asana GID). */
  sourceId: string;
  /** The system the criteria were sourced from. */
  sourceSystem: SourceSystem;
  /** The executable test scenarios extracted from the criteria. */
  scenarios: TestScenario[];
  /** Non-fatal errors encountered during parsing. */
  errors: ParseError[];
}

/** Options for controlling AC parsing behaviour. */
export interface ParseOptions {
  /** Identifier of the source (e.g. Jira issue key `PROJ-123` or Asana task GID). */
  sourceId: string;
  /** Explicitly specify the source system, or use `'freeform'` to auto-detect. */
  sourceSystem: SourceSystem;
}
