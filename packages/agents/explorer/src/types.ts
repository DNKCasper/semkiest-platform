/**
 * Core type definitions for the Explorer Agent.
 *
 * These types define the contracts between the crawler output (SEM-51),
 * the interaction discovery layer, the flow analyzer, the scenario generator,
 * and downstream agents (Executor, Validator).
 */

// ---------------------------------------------------------------------------
// Crawler output types (produced by SEM-51: Site Crawler & Sitemap Builder)
// ---------------------------------------------------------------------------

/** An input field discovered on a page */
export interface InputElement {
  /** CSS selector for the element */
  selector: string;
  /** The `name` attribute of the input */
  name?: string;
  /** The `type` attribute (text, email, password, number, tel, url, etc.) */
  type: string;
  /** Associated label text */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the field is marked as required */
  required: boolean;
  /** Validation rules derived from HTML attributes (minlength, maxlength, pattern, etc.) */
  validationRules?: string[];
}

/** A submit / action button discovered on a page */
export interface ButtonElement {
  /** CSS selector for the element */
  selector: string;
  /** Visible text of the button */
  text: string;
  /** The `type` attribute (submit, button, reset) */
  type?: string;
  /** Whether this is a form-submit button */
  isSubmit?: boolean;
}

/** A hyperlink discovered on a page */
export interface PageLink {
  /** Resolved absolute href */
  href: string;
  /** Visible link text */
  text: string;
  /** True when the href points outside the crawled domain */
  isExternal: boolean;
  /** True when the link appears inside a `<nav>` or nav-like element */
  isNavigation: boolean;
}

/** A form element and all of its child fields */
export interface FormElement {
  /** CSS selector for the `<form>` element */
  selector: string;
  /** The form's `action` attribute (where it posts to) */
  action?: string;
  /** The form's `method` attribute (GET / POST) */
  method?: string;
  /** All input, select, and textarea children */
  fields: InputElement[];
  /** The primary submit button inside this form */
  submitButton?: ButtonElement;
}

/**
 * A single page as returned by the site crawler (SEM-51).
 * Acts as the primary input for the Explorer Agent pipeline.
 */
export interface CrawledPage {
  /** Absolute URL of the page */
  url: string;
  /** Document title */
  title: string;
  /** Crawl depth (0 = seed URL) */
  depth: number;
  /** HTTP status code received */
  statusCode: number;
  /** MIME type of the response */
  contentType: string;
  /** All `<form>` elements found on the page */
  forms: FormElement[];
  /** All standalone (non-form) buttons */
  buttons: ButtonElement[];
  /** All anchor links on the page */
  links: PageLink[];
  /** All input elements (may overlap with those inside forms) */
  inputs: InputElement[];
  /** Top-level headings (h1–h3) in order of appearance */
  headings: string[];
  /** Content of the page's `<meta name="description">` tag */
  metaDescription?: string;
  /** ISO-8601 timestamp when the page was crawled */
  crawledAt: string;
}

// ---------------------------------------------------------------------------
// Interaction discovery types
// ---------------------------------------------------------------------------

/** High-level category of a testable user flow */
export type FlowType =
  | 'login'
  | 'registration'
  | 'crud_create'
  | 'crud_read'
  | 'crud_update'
  | 'crud_delete'
  | 'checkout'
  | 'search_filter'
  | 'navigation'
  | 'password_reset'
  | 'profile_management'
  | 'unknown';

/** Perceived complexity of an interaction */
export type InteractionComplexity = 'simple' | 'moderate' | 'complex';

/**
 * A single testable interaction discovered on a crawled page.
 * Represents a concrete UI action a user can perform.
 */
export interface DiscoveredInteraction {
  /** Stable deterministic ID derived from the page URL and interaction description */
  id: string;
  /** URL of the page where this interaction was found */
  pageUrl: string;
  /** Title of the page where this interaction was found */
  pageTitle: string;
  /** Category of action */
  type:
    | 'form_submission'
    | 'button_click'
    | 'navigation'
    | 'search'
    | 'authentication'
    | 'data_manipulation';
  /** Human-readable description of the interaction */
  description: string;
  /** Raw HTML elements that make up this interaction */
  elements: Array<InputElement | ButtonElement | PageLink | FormElement>;
  /** The user-flow this interaction belongs to */
  flowType: FlowType;
  /** How many steps / fields are involved */
  complexity: InteractionComplexity;
  /** Whether the interaction requires the user to be authenticated first */
  requiresAuth: boolean;
}

// ---------------------------------------------------------------------------
// User flow types
// ---------------------------------------------------------------------------

/**
 * A logical user flow composed of one or more related interactions
 * that span one or more pages.
 */
export interface UserFlow {
  /** Stable deterministic ID derived from flow type and involved pages */
  id: string;
  /** Semantic type of the flow */
  type: FlowType;
  /** Short human-readable name (e.g. "User Login Flow") */
  name: string;
  /** Longer description explaining what the flow accomplishes */
  description: string;
  /** Ordered list of page URLs involved in the flow */
  involvedPages: string[];
  /** All interactions that make up this flow */
  interactions: DiscoveredInteraction[];
  /**
   * Priority score (1–10).  Higher values mean more important.
   * Derived from page importance, flow type, and interaction complexity.
   */
  priority: number;
  /** Overall complexity of completing the entire flow */
  complexity: InteractionComplexity;
}

// ---------------------------------------------------------------------------
// Test scenario / test suite types
// (schema shared with Executor and Validator agents)
// ---------------------------------------------------------------------------

/** Importance level of a generated test scenario */
export type ScenarioPriority = 'critical' | 'high' | 'medium' | 'low';

/** The type of UI action a test step performs */
export type TestAction =
  | 'navigate'
  | 'click'
  | 'type'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'hover'
  | 'wait'
  | 'assert'
  | 'scroll'
  | 'clear';

/** A single step inside a test scenario */
export interface TestStep {
  /** 1-based ordinal */
  stepNumber: number;
  /** What the step does in plain English */
  description: string;
  /** The UI action to perform */
  action: TestAction;
  /**
   * CSS selector, URL, or element label identifying the target.
   * Use accessible-name selectors (role/text) when available.
   */
  target: string;
  /** Value to type, option to select, or URL to navigate to */
  value?: string;
  /** What should be true after this step completes */
  expectedOutcome: string;
}

/** A condition that must be satisfied before a scenario can run */
export interface TestPrerequisite {
  /** Category of the prerequisite */
  type: 'authentication' | 'data' | 'state' | 'permission';
  /** Plain-English description */
  description: string;
}

/**
 * A fully-specified, executable test scenario.
 * This is the primary output artifact consumed by the Executor and Validator agents.
 */
export interface TestScenario {
  /** Stable deterministic ID */
  id: string;
  /** Short title (≤ 80 chars) */
  title: string;
  /** Detailed description of what is being tested and why */
  description: string;
  /** The user-flow category this scenario exercises */
  flowType: FlowType;
  /** Relative importance of the scenario */
  priority: ScenarioPriority;
  /** Conditions that must be met before the scenario starts */
  prerequisites: TestPrerequisite[];
  /** Ordered list of actions the user (or bot) must perform */
  steps: TestStep[];
  /** Global assertions that must hold after all steps complete */
  expectedOutcomes: string[];
  /** Searchable tags (e.g. ["smoke", "auth", "edge-case"]) */
  tags: string[];
  /** URL of the page where the scenario begins */
  pageUrl: string;
  /** Estimated wall-clock time to execute the scenario in seconds */
  estimatedDuration?: number;
}

/**
 * A named collection of thematically related test scenarios.
 * Grouped by user-flow type for easy filtering and reporting.
 */
export interface TestSuite {
  /** Stable deterministic ID */
  id: string;
  /** Human-readable suite name (e.g. "Login & Authentication Suite") */
  name: string;
  /** What the suite covers */
  description: string;
  /** The user-flow category that unifies all scenarios in the suite */
  flowType: FlowType;
  /** All scenarios belonging to this suite, ordered by priority */
  scenarios: TestScenario[];
  /** Highest priority among all contained scenarios */
  priority: ScenarioPriority;
  /** ISO-8601 creation timestamp */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// LLM gateway interface (SEM-46 dependency)
// ---------------------------------------------------------------------------

/**
 * Minimal interface for an LLM completion backend.
 * The default implementation uses the Anthropic Claude API.
 * Inject a custom implementation to use a different provider or a mock.
 */
export interface LLMClient {
  /**
   * Send a prompt to the language model and return the text response.
   * @param prompt - The user-turn message
   * @param systemPrompt - Optional system instructions
   */
  complete(prompt: string, systemPrompt?: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Explorer agent configuration
// ---------------------------------------------------------------------------

/** Options for customising Explorer Agent behaviour */
export interface ExplorerConfig {
  /** Custom LLM client; defaults to Anthropic Claude if omitted */
  llmClient?: LLMClient;
  /**
   * Maximum number of test scenarios to generate per user flow.
   * Default: 5
   */
  maxScenariosPerFlow?: number;
  /**
   * Whether to generate edge-case scenarios (validation errors, missing fields, etc.).
   * Default: true
   */
  includeEdgeCases?: boolean;
  /**
   * Strategy used to order scenarios within a suite.
   * Default: 'combined'
   */
  prioritizationStrategy?: 'importance' | 'complexity' | 'combined';
}
