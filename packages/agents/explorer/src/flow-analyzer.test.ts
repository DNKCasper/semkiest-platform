import { FlowAnalyzer } from './flow-analyzer';
import type { DiscoveredInteraction, FlowType } from './types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeInteraction(
  overrides: Partial<DiscoveredInteraction> & { flowType: FlowType },
): DiscoveredInteraction {
  return {
    id: `id-${Math.random().toString(36).slice(2, 8)}`,
    pageUrl: 'https://example.com',
    pageTitle: 'Example',
    type: 'form_submission',
    description: 'Submit form',
    elements: [],
    complexity: 'simple',
    requiresAuth: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FlowAnalyzer', () => {
  let analyzer: FlowAnalyzer;

  beforeEach(() => {
    analyzer = new FlowAnalyzer();
  });

  describe('analyzeFlows()', () => {
    it('returns an empty array when no interactions are provided', () => {
      expect(analyzer.analyzeFlows([])).toEqual([]);
    });

    it('groups interactions by flow type', () => {
      const interactions = [
        makeInteraction({ flowType: 'login', pageUrl: 'https://example.com/login' }),
        makeInteraction({ flowType: 'login', pageUrl: 'https://example.com/login' }),
        makeInteraction({ flowType: 'registration', pageUrl: 'https://example.com/register' }),
      ];

      const flows = analyzer.analyzeFlows(interactions);

      expect(flows).toHaveLength(2);
      const loginFlow = flows.find((f) => f.type === 'login');
      expect(loginFlow?.interactions).toHaveLength(2);
    });

    it('returns flows sorted by descending priority', () => {
      const interactions = [
        makeInteraction({ flowType: 'navigation' }),
        makeInteraction({ flowType: 'login', pageUrl: 'https://example.com/login' }),
        makeInteraction({ flowType: 'checkout', pageUrl: 'https://example.com/checkout' }),
      ];

      const flows = analyzer.analyzeFlows(interactions);
      const priorities = flows.map((f) => f.priority);
      const sorted = [...priorities].sort((a, b) => b - a);

      expect(priorities).toEqual(sorted);
    });

    it('assigns correct names for known flow types', () => {
      const interactions = [
        makeInteraction({ flowType: 'login', pageUrl: 'https://example.com/login' }),
        makeInteraction({ flowType: 'registration', pageUrl: 'https://example.com/register' }),
        makeInteraction({ flowType: 'checkout', pageUrl: 'https://example.com/checkout' }),
      ];

      const flows = analyzer.analyzeFlows(interactions);

      expect(flows.find((f) => f.type === 'login')?.name).toBe('User Login Flow');
      expect(flows.find((f) => f.type === 'registration')?.name).toBe('User Registration Flow');
      expect(flows.find((f) => f.type === 'checkout')?.name).toBe('Checkout & Payment Flow');
    });

    it('collects unique page URLs per flow', () => {
      const interactions = [
        makeInteraction({ flowType: 'crud_create', pageUrl: 'https://example.com/new' }),
        makeInteraction({ flowType: 'crud_create', pageUrl: 'https://example.com/new' }), // duplicate URL
        makeInteraction({ flowType: 'crud_create', pageUrl: 'https://example.com/items/new' }),
      ];

      const flows = analyzer.analyzeFlows(interactions);
      const crudFlow = flows.find((f) => f.type === 'crud_create');

      expect(crudFlow?.involvedPages).toHaveLength(2);
    });

    it('gives bonus priority when flow touches homepage (depth-0 URL)', () => {
      const loginOnRoot = makeInteraction({
        flowType: 'login',
        pageUrl: 'https://example.com/',
      });
      const loginDeep = makeInteraction({
        flowType: 'registration',
        pageUrl: 'https://example.com/auth/users/register',
      });

      const flows = analyzer.analyzeFlows([loginOnRoot, loginDeep]);
      const loginFlow = flows.find((f) => f.type === 'login')!;
      const regFlow = flows.find((f) => f.type === 'registration')!;

      // login (base 10 + homepage bonus) should outrank registration (base 9, no bonus)
      expect(loginFlow.priority).toBeGreaterThanOrEqual(regFlow.priority);
    });

    it('gives bonus priority when flow spans multiple pages', () => {
      const multiPage = [
        makeInteraction({ flowType: 'checkout', pageUrl: 'https://example.com/cart' }),
        makeInteraction({ flowType: 'checkout', pageUrl: 'https://example.com/checkout' }),
        makeInteraction({ flowType: 'checkout', pageUrl: 'https://example.com/confirmation' }),
      ];

      const singlePage = [
        makeInteraction({ flowType: 'registration', pageUrl: 'https://example.com/register' }),
      ];

      const flows = analyzer.analyzeFlows([...multiPage, ...singlePage]);
      const checkoutFlow = flows.find((f) => f.type === 'checkout')!;
      const regFlow = flows.find((f) => f.type === 'registration')!;

      // checkout (base 9 + multi-page bonus) >= registration (base 9)
      expect(checkoutFlow.priority).toBeGreaterThanOrEqual(regFlow.priority);
    });

    it('produces stable (deterministic) IDs across calls', () => {
      const interactions = [
        makeInteraction({ flowType: 'login', pageUrl: 'https://example.com/login', id: 'fixed-id-1' }),
      ];

      const first = analyzer.analyzeFlows(interactions);
      const second = analyzer.analyzeFlows(interactions);

      expect(first.map((f) => f.id)).toEqual(second.map((f) => f.id));
    });

    it('sets dominant complexity from interactions', () => {
      const interactions = [
        makeInteraction({ flowType: 'crud_create', complexity: 'simple' }),
        makeInteraction({ flowType: 'crud_create', complexity: 'complex' }),
      ];

      const flows = analyzer.analyzeFlows(interactions);
      const flow = flows.find((f) => f.type === 'crud_create')!;
      expect(flow.complexity).toBe('complex');
    });

    it('handles a single unknown interaction gracefully', () => {
      const interactions = [makeInteraction({ flowType: 'unknown' })];
      const flows = analyzer.analyzeFlows(interactions);
      expect(flows).toHaveLength(1);
      expect(flows[0]!.type).toBe('unknown');
      expect(flows[0]!.priority).toBeGreaterThanOrEqual(1);
    });
  });
});
