/**
 * Flow Analyzer
 *
 * Groups DiscoveredInteractions into coherent UserFlows and assigns
 * priority scores so that downstream scenario generation focuses on
 * the most important workflows first.
 *
 * Priority scoring heuristics
 * ─────────────────────────────
 * Base scores by flow type (reflects business criticality):
 *   login / registration / checkout  ⟹ 9–10  (critical path)
 *   crud_create / crud_update        ⟹ 7–8
 *   search_filter / password_reset   ⟹ 6
 *   profile_management               ⟹ 5
 *   navigation                       ⟹ 3
 *   crud_read / crud_delete          ⟹ 4–5
 *   unknown                          ⟹ 2
 *
 * Bonus modifiers:
 *   +1  if the flow is on the homepage or a top-level URL (depth 0–1)
 *   +1  if the flow involves multiple pages
 *   –1  if all interactions are of 'simple' complexity (deprioritise trivial)
 */

import { createHash } from 'crypto';
import type {
  DiscoveredInteraction,
  FlowType,
  InteractionComplexity,
  UserFlow,
} from './types';

// ---------------------------------------------------------------------------
// Priority base scores
// ---------------------------------------------------------------------------

const FLOW_BASE_PRIORITY: Record<FlowType, number> = {
  login: 10,
  registration: 9,
  checkout: 9,
  crud_create: 8,
  crud_update: 7,
  password_reset: 6,
  search_filter: 6,
  profile_management: 5,
  crud_delete: 5,
  crud_read: 4,
  navigation: 3,
  unknown: 2,
};

/** Human-readable names for each flow type. */
const FLOW_NAMES: Record<FlowType, string> = {
  login: 'User Login Flow',
  registration: 'User Registration Flow',
  checkout: 'Checkout & Payment Flow',
  crud_create: 'Create Record Flow',
  crud_update: 'Edit / Update Record Flow',
  crud_delete: 'Delete Record Flow',
  crud_read: 'View Record Flow',
  search_filter: 'Search & Filter Flow',
  navigation: 'Site Navigation Flow',
  password_reset: 'Password Reset Flow',
  profile_management: 'Profile Management Flow',
  unknown: 'Unknown Interaction Flow',
};

/** One-sentence description template for each flow type. */
const FLOW_DESCRIPTIONS: Record<FlowType, string> = {
  login: 'Covers all scenarios for authenticating an existing user.',
  registration: 'Covers all scenarios for creating a new user account.',
  checkout: 'Covers the end-to-end purchase and payment process.',
  crud_create: 'Covers creating new records or resources through the UI.',
  crud_update: 'Covers editing and saving changes to existing records.',
  crud_delete: 'Covers permanently removing records from the system.',
  crud_read: 'Covers browsing and viewing existing records.',
  search_filter: 'Covers searching, filtering, and sorting content.',
  navigation: 'Covers moving between pages using site navigation.',
  password_reset: 'Covers the forgotten-password and reset-link workflow.',
  profile_management: 'Covers updating profile information and account settings.',
  unknown: 'Miscellaneous interactions that could not be auto-classified.',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stableId(...parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

/** Determine the dominant complexity of a set of interactions. */
function dominantComplexity(interactions: DiscoveredInteraction[]): InteractionComplexity {
  const counts: Record<InteractionComplexity, number> = { simple: 0, moderate: 0, complex: 0 };
  for (const i of interactions) {
    counts[i.complexity] += 1;
  }
  if (counts.complex > 0) return 'complex';
  if (counts.moderate > 0) return 'moderate';
  return 'simple';
}

/** Collect unique page URLs referenced by the given interactions. */
function uniquePages(interactions: DiscoveredInteraction[]): string[] {
  return [...new Set(interactions.map((i) => i.pageUrl))].sort();
}

/** Estimate whether a URL belongs to a high-importance page (homepage or shallow path). */
function isHighImportancePage(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    const depth = pathname.split('/').filter(Boolean).length;
    return depth <= 1; // root or one segment deep
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// FlowAnalyzer class
// ---------------------------------------------------------------------------

/**
 * Groups a flat list of discovered interactions into prioritised UserFlows.
 *
 * The result is deterministic: same input interactions always produce
 * the same flows in the same order.
 */
export class FlowAnalyzer {
  /**
   * Analyse interactions and return a list of UserFlows sorted by
   * descending priority (most important first).
   *
   * @param interactions - Output of InteractionDiscovery.discoverInteractions()
   */
  analyzeFlows(interactions: DiscoveredInteraction[]): UserFlow[] {
    const grouped = this.groupByFlowType(interactions);

    const flows: UserFlow[] = [];

    for (const [flowType, group] of grouped.entries()) {
      if (group.length === 0) continue;

      const pages = uniquePages(group);
      const complexity = dominantComplexity(group);
      const priority = this.calculatePriority(flowType, group, pages);

      flows.push({
        id: stableId(flowType, ...pages),
        type: flowType,
        name: FLOW_NAMES[flowType],
        description: FLOW_DESCRIPTIONS[flowType],
        involvedPages: pages,
        interactions: group,
        priority,
        complexity,
      });
    }

    // Sort by priority descending; break ties alphabetically by flow name
    return flows.sort(
      (a, b) => b.priority - a.priority || a.name.localeCompare(b.name),
    );
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Bucket interactions by their flow type. */
  private groupByFlowType(
    interactions: DiscoveredInteraction[],
  ): Map<FlowType, DiscoveredInteraction[]> {
    const map = new Map<FlowType, DiscoveredInteraction[]>();

    for (const interaction of interactions) {
      const existing = map.get(interaction.flowType) ?? [];
      map.set(interaction.flowType, [...existing, interaction]);
    }

    return map;
  }

  /**
   * Compute a priority score in the range [1, 10].
   *
   * The score combines:
   *   1. A base score per flow type (business criticality)
   *   2. A +1 bonus when the flow touches a high-importance page
   *   3. A +1 bonus when the flow spans multiple pages
   *   4. A –1 penalty when all interactions are trivially simple
   */
  private calculatePriority(
    flowType: FlowType,
    interactions: DiscoveredInteraction[],
    pages: string[],
  ): number {
    let score = FLOW_BASE_PRIORITY[flowType];

    // Bonus: flow touches the homepage or a very shallow URL
    if (pages.some(isHighImportancePage)) {
      score = Math.min(score + 1, 10);
    }

    // Bonus: flow spans multiple pages (multi-step flow)
    if (pages.length > 1) {
      score = Math.min(score + 1, 10);
    }

    // Penalty: all interactions are trivially simple
    if (interactions.every((i) => i.complexity === 'simple')) {
      score = Math.max(score - 1, 1);
    }

    return score;
  }
}
