import { InteractionDiscovery } from './interaction-discovery';
import type { CrawledPage, FormElement, ButtonElement, InputElement, PageLink } from './types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<InputElement> = {}): InputElement {
  return {
    selector: '#field',
    type: 'text',
    required: false,
    ...overrides,
  };
}

function makeButton(overrides: Partial<ButtonElement> = {}): ButtonElement {
  return { selector: '#btn', text: 'Submit', type: 'submit', isSubmit: true, ...overrides };
}

function makeLink(overrides: Partial<PageLink> = {}): PageLink {
  return {
    href: '/home',
    text: 'Home',
    isExternal: false,
    isNavigation: true,
    ...overrides,
  };
}

function makeForm(overrides: Partial<FormElement> = {}): FormElement {
  return {
    selector: 'form',
    action: '/submit',
    method: 'POST',
    fields: [],
    ...overrides,
  };
}

function makePage(overrides: Partial<CrawledPage> = {}): CrawledPage {
  return {
    url: 'https://example.com',
    title: 'Example',
    depth: 0,
    statusCode: 200,
    contentType: 'text/html',
    forms: [],
    buttons: [],
    links: [],
    inputs: [],
    headings: [],
    crawledAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InteractionDiscovery', () => {
  let discovery: InteractionDiscovery;

  beforeEach(() => {
    discovery = new InteractionDiscovery();
  });

  describe('discoverInteractions()', () => {
    it('returns an empty array when no pages are provided', () => {
      expect(discovery.discoverInteractions([])).toEqual([]);
    });

    it('skips forms with no fields', () => {
      const page = makePage({ forms: [makeForm({ fields: [] })] });
      const result = discovery.discoverInteractions([page]);
      expect(result.filter((i) => i.type === 'form_submission')).toHaveLength(0);
    });

    it('classifies login form correctly', () => {
      const page = makePage({
        url: 'https://example.com/login',
        forms: [
          makeForm({
            fields: [
              makeInput({ type: 'email', name: 'email', required: true }),
              makeInput({ type: 'password', name: 'password', required: true }),
            ],
            submitButton: makeButton({ text: 'Sign in' }),
          }),
        ],
      });

      const interactions = discovery.discoverInteractions([page]);
      const loginInteraction = interactions.find((i) => i.flowType === 'login');

      expect(loginInteraction).toBeDefined();
      expect(loginInteraction!.type).toBe('authentication');
      expect(loginInteraction!.pageUrl).toBe('https://example.com/login');
    });

    it('classifies registration form correctly', () => {
      const page = makePage({
        url: 'https://example.com/register',
        forms: [
          makeForm({
            fields: [
              makeInput({ type: 'text', name: 'firstName', required: true }),
              makeInput({ type: 'text', name: 'lastName', required: true }),
              makeInput({ type: 'email', name: 'email', required: true }),
              makeInput({ type: 'password', name: 'password', required: true }),
              makeInput({ type: 'password', name: 'confirmPassword', required: true }),
            ],
          }),
        ],
      });

      const interactions = discovery.discoverInteractions([page]);
      expect(interactions.some((i) => i.flowType === 'registration')).toBe(true);
    });

    it('classifies search form correctly', () => {
      const page = makePage({
        url: 'https://example.com/search',
        forms: [
          makeForm({
            fields: [makeInput({ type: 'search', name: 'q', placeholder: 'Search...' })],
            method: 'GET',
          }),
        ],
      });

      const interactions = discovery.discoverInteractions([page]);
      expect(interactions.some((i) => i.flowType === 'search_filter')).toBe(true);
    });

    it('classifies checkout form correctly', () => {
      const page = makePage({
        url: 'https://example.com/checkout',
        forms: [
          makeForm({
            fields: [
              makeInput({ type: 'text', name: 'cardNumber', required: true }),
              makeInput({ type: 'text', name: 'cardExpiry', required: true }),
              makeInput({ type: 'text', name: 'cardCvc', required: true }),
            ],
          }),
        ],
      });

      const interactions = discovery.discoverInteractions([page]);
      expect(interactions.some((i) => i.flowType === 'checkout')).toBe(true);
    });

    it('detects navigation interactions from nav links', () => {
      const page = makePage({
        links: [
          makeLink({ href: '/home', text: 'Home', isNavigation: true }),
          makeLink({ href: '/about', text: 'About', isNavigation: true }),
          makeLink({ href: '/contact', text: 'Contact', isNavigation: true }),
        ],
      });

      const interactions = discovery.discoverInteractions([page]);
      const navInteraction = interactions.find((i) => i.type === 'navigation');
      expect(navInteraction).toBeDefined();
      expect(navInteraction!.flowType).toBe('navigation');
    });

    it('ignores external navigation links', () => {
      const page = makePage({
        links: [
          makeLink({ href: 'https://external.com', isExternal: true, isNavigation: true }),
        ],
      });

      const interactions = discovery.discoverInteractions([page]);
      // Only external links — no nav interaction expected
      const navInteraction = interactions.find((i) => i.type === 'navigation');
      expect(navInteraction).toBeUndefined();
    });

    it('detects standalone search inputs', () => {
      const page = makePage({
        inputs: [makeInput({ type: 'search', name: 'q', placeholder: 'Search products' })],
      });

      const interactions = discovery.discoverInteractions([page]);
      expect(interactions.some((i) => i.type === 'search')).toBe(true);
    });

    it('does not create duplicate search interaction when form already covers it', () => {
      const page = makePage({
        forms: [
          makeForm({
            fields: [makeInput({ type: 'search', name: 'q' })],
          }),
        ],
        inputs: [makeInput({ type: 'search', name: 'q' })],
      });

      const interactions = discovery.discoverInteractions([page]);
      const searchInteractions = interactions.filter((i) => i.type === 'search');
      // The standalone search analyser should skip because the form covers it
      expect(searchInteractions).toHaveLength(0);
    });

    it('filters out utility buttons (cancel, close, back)', () => {
      const page = makePage({
        buttons: [
          makeButton({ selector: '#cancel', text: 'Cancel', isSubmit: false }),
          makeButton({ selector: '#close', text: 'Close', isSubmit: false }),
          makeButton({ selector: '#delete', text: 'Delete Item', isSubmit: false }),
        ],
      });

      const interactions = discovery.discoverInteractions([page]);
      const buttonInteractions = interactions.filter((i) => i.type === 'button_click');
      // Only "Delete Item" should survive
      expect(buttonInteractions).toHaveLength(1);
      expect(buttonInteractions[0]!.description).toContain('Delete Item');
    });

    it('produces stable (deterministic) IDs across calls', () => {
      const page = makePage({
        url: 'https://example.com/login',
        forms: [
          makeForm({
            fields: [
              makeInput({ type: 'email', name: 'email', required: true }),
              makeInput({ type: 'password', name: 'password', required: true }),
            ],
          }),
        ],
      });

      const first = discovery.discoverInteractions([page]);
      const second = discovery.discoverInteractions([page]);

      expect(first.map((i) => i.id)).toEqual(second.map((i) => i.id));
    });

    it('marks dashboard pages as requiring authentication', () => {
      const page = makePage({
        url: 'https://example.com/dashboard',
        forms: [
          makeForm({
            fields: [makeInput({ type: 'text', name: 'title', required: true })],
          }),
        ],
      });

      const interactions = discovery.discoverInteractions([page]);
      expect(interactions.every((i) => i.requiresAuth)).toBe(true);
    });

    it('assigns simple complexity to 2-field forms', () => {
      const page = makePage({
        url: 'https://example.com/login',
        forms: [
          makeForm({
            fields: [
              makeInput({ type: 'email', name: 'email' }),
              makeInput({ type: 'password', name: 'password' }),
            ],
          }),
        ],
      });

      const interactions = discovery.discoverInteractions([page]);
      const form = interactions.find((i) => i.flowType === 'login');
      expect(form?.complexity).toBe('simple');
    });

    it('assigns complex complexity to forms with 7+ fields', () => {
      const page = makePage({
        url: 'https://example.com/register',
        forms: [
          makeForm({
            fields: Array.from({ length: 8 }, (_, i) =>
              makeInput({ name: `field${i}`, type: 'text' }),
            ),
          }),
        ],
      });

      const interactions = discovery.discoverInteractions([page]);
      const form = interactions.find((i) => i.type === 'form_submission' || i.type === 'authentication');
      expect(form?.complexity).toBe('complex');
    });

    it('returns results sorted by page URL', () => {
      const pages = [
        makePage({ url: 'https://example.com/z', links: [makeLink({ href: '/z' })] }),
        makePage({ url: 'https://example.com/a', links: [makeLink({ href: '/a' })] }),
      ];

      const interactions = discovery.discoverInteractions(pages);
      const urls = interactions.map((i) => i.pageUrl);
      const sorted = [...urls].sort();
      expect(urls).toEqual(sorted);
    });
  });
});
