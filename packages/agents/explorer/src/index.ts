/**
 * @semkiest/agent-explorer
 *
 * Explorer Agent: Interaction Discovery & Test Scenario Generation (SEM-56)
 *
 * Public API:
 *
 *   InteractionDiscovery  — analyses crawled pages, emits DiscoveredInteraction[]
 *   FlowAnalyzer          — groups interactions into prioritised UserFlow[]
 *   ScenarioGenerator     — uses an LLM to turn UserFlows into TestSuite[]
 *
 * Typical pipeline:
 *
 * ```typescript
 * import {
 *   InteractionDiscovery,
 *   FlowAnalyzer,
 *   ScenarioGenerator,
 * } from '@semkiest/agent-explorer';
 *
 * const pages = await crawler.crawl('https://example.com');
 *
 * const discovery  = new InteractionDiscovery();
 * const analyzer   = new FlowAnalyzer();
 * const generator  = new ScenarioGenerator({ maxScenariosPerFlow: 5 });
 *
 * const interactions = discovery.discoverInteractions(pages);
 * const flows        = analyzer.analyzeFlows(interactions);
 * const suites       = await generator.generateScenarios(flows);
 * ```
 */

export { InteractionDiscovery } from './interaction-discovery';
export { FlowAnalyzer } from './flow-analyzer';
export { ScenarioGenerator } from './scenario-generator';

export type {
  // Crawler input types (SEM-51 contract)
  CrawledPage,
  FormElement,
  ButtonElement,
  InputElement,
  PageLink,
  // Interaction discovery
  DiscoveredInteraction,
  FlowType,
  InteractionComplexity,
  // Flow analysis
  UserFlow,
  // Scenario / suite output (downstream agent contract)
  TestScenario,
  TestStep,
  TestAction,
  TestPrerequisite,
  TestSuite,
  ScenarioPriority,
  // LLM & config
  LLMClient,
  ExplorerConfig,
} from './types';
