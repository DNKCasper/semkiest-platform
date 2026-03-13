/**
 * Scenario Generator
 *
 * Uses an LLM (Anthropic Claude by default, or any LLMClient implementation)
 * to generate structured, executable test scenarios from analysed user flows.
 *
 * Determinism guarantee
 * ─────────────────────
 * All LLM calls are made with temperature=0 so that the same input flow
 * always produces the same scenario text.  IDs are derived deterministically
 * from the scenario title and flow type via SHA-256.
 *
 * Dependency: SEM-46 (LLM Gateway) — fulfilled via the LLMClient interface.
 */

import { createHash } from 'crypto';
import type {
  ExplorerConfig,
  FlowType,
  LLMClient,
  ScenarioPriority,
  TestPrerequisite,
  TestScenario,
  TestStep,
  TestSuite,
  UserFlow,
} from './types';

// ---------------------------------------------------------------------------
// Default Anthropic LLM client
// ---------------------------------------------------------------------------

/**
 * Default LLM client backed by the Anthropic Claude API (SEM-46 gateway).
 *
 * Uses temperature=0 for deterministic outputs.
 * Reads ANTHROPIC_API_KEY from the environment when no key is provided.
 */
class AnthropicLLMClient implements LLMClient {
  private readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey?: string, model = 'claude-sonnet-4-6') {
    this.apiKey = apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '';
    this.model = model;
  }

  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    // Dynamic import keeps @anthropic-ai/sdk as a regular dependency
    // while avoiding circular-import issues in test environments.
    const { default: Anthropic } = await import('@anthropic-ai/sdk');

    const client = new Anthropic({ apiKey: this.apiKey });

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 4096,
      // temperature: 0 ensures deterministic output for the same input
      temperature: 0,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: 'user', content: prompt }],
    });

    const block = response.content[0];
    if (!block || block.type !== 'text') {
      throw new Error('[ScenarioGenerator] Unexpected LLM response type');
    }
    return block.text;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_SCENARIOS = 5;

const SYSTEM_PROMPT = `You are an expert QA engineer specialising in web application test automation.
Your task is to generate structured, executable test scenarios for a web application based on
information about a discovered user flow.

Rules:
- Output ONLY valid JSON — no prose, no markdown fences.
- Be specific about selectors and values (use accessible names when possible).
- Include both happy-path and edge-case scenarios.
- Each scenario must have a unique, descriptive title.
- Steps must be atomic and unambiguous.
- Expected outcomes must be verifiable assertions.
- The "id" field must match the pattern [a-z0-9_]{8,32}.`;

const FLOW_PRIORITY_MAP: Record<FlowType, ScenarioPriority> = {
  login: 'critical',
  registration: 'critical',
  checkout: 'critical',
  crud_create: 'high',
  crud_update: 'high',
  crud_delete: 'high',
  crud_read: 'medium',
  search_filter: 'medium',
  password_reset: 'high',
  profile_management: 'medium',
  navigation: 'low',
  unknown: 'low',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stableId(...parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

function stableSuiteId(flowType: FlowType, pages: string[]): string {
  return stableId(flowType, ...pages.slice().sort());
}

/** Sort scenarios: critical > high > medium > low, then by title. */
function priorityOrder(p: ScenarioPriority): number {
  const order: Record<ScenarioPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return order[p];
}

function sortScenarios(scenarios: TestScenario[]): TestScenario[] {
  return [...scenarios].sort(
    (a, b) =>
      priorityOrder(a.priority) - priorityOrder(b.priority) ||
      a.title.localeCompare(b.title),
  );
}

function highestPriority(scenarios: TestScenario[]): ScenarioPriority {
  if (scenarios.some((s) => s.priority === 'critical')) return 'critical';
  if (scenarios.some((s) => s.priority === 'high')) return 'high';
  if (scenarios.some((s) => s.priority === 'medium')) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(flow: UserFlow, maxScenarios: number, includeEdgeCases: boolean): string {
  const interactions = flow.interactions
    .map((i) => `  - ${i.description} (type: ${i.type}, complexity: ${i.complexity})`)
    .join('\n');

  const pages = flow.involvedPages.map((p) => `  - ${p}`).join('\n');

  return `Generate ${maxScenarios} test scenarios for the following user flow.
${includeEdgeCases ? 'Include at least 1–2 edge-case scenarios (e.g. validation errors, empty fields, incorrect credentials).' : ''}

Flow type: ${flow.type}
Flow name: ${flow.name}
Description: ${flow.description}
Complexity: ${flow.complexity}
Pages involved:
${pages}

Discovered interactions:
${interactions}

Return a JSON array of scenario objects. Each object must match this exact schema:
{
  "id": string,            // snake_case, 8–32 chars, stable identifier
  "title": string,         // ≤80 chars, descriptive
  "description": string,   // 1–3 sentences explaining what is tested
  "priority": "critical" | "high" | "medium" | "low",
  "prerequisites": [       // array, may be empty
    { "type": "authentication" | "data" | "state" | "permission", "description": string }
  ],
  "steps": [               // ordered array, at least 2 steps
    {
      "stepNumber": number,
      "description": string,
      "action": "navigate" | "click" | "type" | "select" | "check" | "uncheck" | "hover" | "wait" | "assert" | "scroll" | "clear",
      "target": string,    // CSS selector or accessible-name selector
      "value": string,     // optional — omit if not applicable
      "expectedOutcome": string
    }
  ],
  "expectedOutcomes": string[],  // global post-scenario assertions
  "tags": string[],              // e.g. ["smoke", "auth", "edge-case"]
  "pageUrl": string,             // starting URL for the scenario
  "estimatedDuration": number    // seconds
}`;
}

// ---------------------------------------------------------------------------
// LLM response parser
// ---------------------------------------------------------------------------

/** Validate and parse the LLM's JSON output into TestScenario objects. */
function parseScenarios(
  raw: string,
  flow: UserFlow,
  defaultPriority: ScenarioPriority,
): TestScenario[] {
  // Strip possible markdown code fences the model might emit despite instructions
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `[ScenarioGenerator] Failed to parse LLM response as JSON.\nRaw output:\n${raw}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error('[ScenarioGenerator] Expected a JSON array of scenarios.');
  }

  return parsed.map((item, index): TestScenario => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`[ScenarioGenerator] Scenario at index ${index} is not an object.`);
    }

    const s = item as Record<string, unknown>;

    const rawSteps = Array.isArray(s['steps']) ? (s['steps'] as unknown[]) : [];
    const steps: TestStep[] = rawSteps.map((step, si): TestStep => {
      if (typeof step !== 'object' || step === null) {
        throw new Error(`[ScenarioGenerator] Step ${si} in scenario ${index} is not an object.`);
      }
      const st = step as Record<string, unknown>;
      return {
        stepNumber: typeof st['stepNumber'] === 'number' ? st['stepNumber'] : si + 1,
        description: String(st['description'] ?? ''),
        action: String(st['action'] ?? 'click') as TestStep['action'],
        target: String(st['target'] ?? ''),
        ...(st['value'] !== undefined ? { value: String(st['value']) } : {}),
        expectedOutcome: String(st['expectedOutcome'] ?? ''),
      };
    });

    const rawPrereqs = Array.isArray(s['prerequisites']) ? (s['prerequisites'] as unknown[]) : [];
    const prerequisites: TestPrerequisite[] = rawPrereqs.map((p): TestPrerequisite => {
      if (typeof p !== 'object' || p === null) return { type: 'state', description: String(p) };
      const pr = p as Record<string, unknown>;
      return {
        type: String(pr['type'] ?? 'state') as TestPrerequisite['type'],
        description: String(pr['description'] ?? ''),
      };
    });

    const scenarioId =
      typeof s['id'] === 'string' && /^[a-z0-9_]{8,32}$/.test(s['id'])
        ? s['id']
        : stableId(flow.type, String(s['title'] ?? index));

    return {
      id: scenarioId,
      title: String(s['title'] ?? `Scenario ${index + 1}`),
      description: String(s['description'] ?? ''),
      flowType: flow.type,
      priority: (s['priority'] as ScenarioPriority | undefined) ?? defaultPriority,
      prerequisites,
      steps,
      expectedOutcomes: Array.isArray(s['expectedOutcomes'])
        ? (s['expectedOutcomes'] as unknown[]).map(String)
        : [],
      tags: Array.isArray(s['tags']) ? (s['tags'] as unknown[]).map(String) : [],
      pageUrl:
        typeof s['pageUrl'] === 'string'
          ? s['pageUrl']
          : (flow.involvedPages[0] ?? ''),
      estimatedDuration:
        typeof s['estimatedDuration'] === 'number' ? s['estimatedDuration'] : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// ScenarioGenerator class
// ---------------------------------------------------------------------------

/**
 * Generates structured test suites from UserFlows using an LLM backend.
 *
 * Usage:
 * ```typescript
 * const generator = new ScenarioGenerator();
 * const suites = await generator.generateScenarios(flows);
 * ```
 */
export class ScenarioGenerator {
  private readonly llmClient: LLMClient;
  private readonly maxScenariosPerFlow: number;
  private readonly includeEdgeCases: boolean;

  constructor(config: ExplorerConfig = {}) {
    this.llmClient = config.llmClient ?? new AnthropicLLMClient();
    this.maxScenariosPerFlow = config.maxScenariosPerFlow ?? DEFAULT_MAX_SCENARIOS;
    this.includeEdgeCases = config.includeEdgeCases ?? true;
  }

  /**
   * Generate a TestSuite for every provided UserFlow.
   *
   * Suites are returned sorted by descending priority (most critical first).
   *
   * @param flows - Output of FlowAnalyzer.analyzeFlows()
   */
  async generateScenarios(flows: UserFlow[]): Promise<TestSuite[]> {
    const suites: TestSuite[] = [];

    for (const flow of flows) {
      const suite = await this.generateSuiteForFlow(flow);
      suites.push(suite);
    }

    // Sort suites by highest-priority scenario descending
    return suites.sort(
      (a, b) => priorityOrder(a.priority) - priorityOrder(b.priority),
    );
  }

  /**
   * Generate a single TestSuite for one UserFlow.
   *
   * Exposed for granular use or parallel invocation.
   */
  async generateSuiteForFlow(flow: UserFlow): Promise<TestSuite> {
    const scenarios = await this.generateScenariosForFlow(flow);
    const sortedScenarios = sortScenarios(scenarios);

    return {
      id: stableSuiteId(flow.type, flow.involvedPages),
      name: `${flow.name} Suite`,
      description: flow.description,
      flowType: flow.type,
      scenarios: sortedScenarios,
      priority: highestPriority(sortedScenarios),
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Generate test scenarios for a single UserFlow.
   * Calls the LLM and parses the JSON response.
   */
  async generateScenariosForFlow(flow: UserFlow): Promise<TestScenario[]> {
    const prompt = buildPrompt(flow, this.maxScenariosPerFlow, this.includeEdgeCases);
    const defaultPriority = FLOW_PRIORITY_MAP[flow.type];

    const raw = await this.llmClient.complete(prompt, SYSTEM_PROMPT);
    return parseScenarios(raw, flow, defaultPriority);
  }
}
