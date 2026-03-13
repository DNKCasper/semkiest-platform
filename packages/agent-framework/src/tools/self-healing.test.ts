import { Locator, Page } from 'playwright';
import { SelfHealingFinder } from './self-healing';

// ---------------------------------------------------------------------------
// Helpers to build minimal Playwright Page / Locator mocks
// ---------------------------------------------------------------------------

function makeLocator(found: boolean): Locator {
  return {
    waitFor: found
      ? jest.fn().mockResolvedValue(undefined)
      : jest.fn().mockRejectedValue(new Error('Locator not found')),
    click: jest.fn().mockResolvedValue(undefined),
  } as unknown as Locator;
}

function makePage(overrides: {
  locator?: Locator;
  getByText?: Locator;
  getByLabel?: Locator;
  getByRole?: { first: () => Locator };
}): Page {
  return {
    locator: jest.fn().mockReturnValue(overrides.locator ?? makeLocator(false)),
    getByText: jest.fn().mockReturnValue(overrides.getByText ?? makeLocator(false)),
    getByLabel: jest.fn().mockReturnValue(overrides.getByLabel ?? makeLocator(false)),
    getByRole: jest.fn().mockReturnValue(
      overrides.getByRole ?? { first: () => makeLocator(false) },
    ),
  } as unknown as Page;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SelfHealingFinder', () => {
  describe('findElement()', () => {
    it('returns element when primary CSS selector succeeds', async () => {
      const successLocator = makeLocator(true);
      const page = makePage({ locator: successLocator });
      const finder = new SelfHealingFinder({ timeout: 100 });

      const result = await finder.findElement(page, '#my-button');
      expect(result).toBe(successLocator);
      expect(finder.getHealingEvents()).toHaveLength(0);
    });

    it('falls back to text content from data-testid when CSS fails', async () => {
      const textLocator = makeLocator(true);
      const page = makePage({ getByText: textLocator });
      const finder = new SelfHealingFinder({ timeout: 100 });

      const result = await finder.findElement(page, '[data-testid="submit-button"]');
      expect(result).toBe(textLocator);
      const events = finder.getHealingEvents();
      expect(events).toHaveLength(1);
      expect(events[0].fallbackStrategy).toBe('text-content');
      expect(events[0].originalSelector).toBe('[data-testid="submit-button"]');
    });

    it('falls back to ARIA label when text content also fails', async () => {
      const ariaLocator = makeLocator(true);
      const page = makePage({ getByLabel: ariaLocator });
      const finder = new SelfHealingFinder({ timeout: 100 });

      const result = await finder.findElement(page, '[aria-label="Close dialog"]');
      expect(result).toBe(ariaLocator);
      const events = finder.getHealingEvents();
      expect(events).toHaveLength(1);
      expect(events[0].fallbackStrategy).toBe('aria-label');
      expect(events[0].resolvedSelector).toBe('label="Close dialog"');
    });

    it('falls back to role-based visual context when previous strategies fail', async () => {
      const roleLocator = makeLocator(true);
      const page = makePage({
        getByRole: { first: () => roleLocator },
      });
      const finder = new SelfHealingFinder({ timeout: 100 });

      const result = await finder.findElement(page, 'button.fancy-submit');
      expect(result).toBe(roleLocator);
      const events = finder.getHealingEvents();
      expect(events).toHaveLength(1);
      expect(events[0].fallbackStrategy).toBe('visual-context');
    });

    it('throws when all strategies are exhausted', async () => {
      const page = makePage({});
      const finder = new SelfHealingFinder({ timeout: 100 });

      await expect(finder.findElement(page, '#not-found')).rejects.toThrow(
        'SelfHealingFinder exhausted all strategies',
      );
    });

    it('records timestamp on healing events', async () => {
      const before = new Date();
      const textLocator = makeLocator(true);
      const page = makePage({ getByText: textLocator });
      const finder = new SelfHealingFinder({ timeout: 100 });

      await finder.findElement(page, '[data-testid="my-element"]');
      const after = new Date();

      const [event] = finder.getHealingEvents();
      expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(event.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('getHealingEvents() / clearHealingEvents()', () => {
    it('returns a copy so mutations do not affect internal state', async () => {
      const textLocator = makeLocator(true);
      const page = makePage({ getByText: textLocator });
      const finder = new SelfHealingFinder({ timeout: 100 });

      await finder.findElement(page, '[data-testid="foo"]');
      const events = finder.getHealingEvents();
      events.length = 0; // mutate the copy

      expect(finder.getHealingEvents()).toHaveLength(1);
    });

    it('clearHealingEvents() resets the log', async () => {
      const textLocator = makeLocator(true);
      const page = makePage({ getByText: textLocator });
      const finder = new SelfHealingFinder({ timeout: 100 });

      await finder.findElement(page, '[data-testid="foo"]');
      expect(finder.getHealingEvents()).toHaveLength(1);

      finder.clearHealingEvents();
      expect(finder.getHealingEvents()).toHaveLength(0);
    });
  });

  describe('selector parsing helpers (via integration)', () => {
    it('extracts text hint from :contains() pseudo-selector', async () => {
      const textLocator = makeLocator(true);
      const page = makePage({ getByText: textLocator });
      const finder = new SelfHealingFinder({ timeout: 100 });

      await finder.findElement(page, 'p:contains("Hello World")');
      const [event] = finder.getHealingEvents();
      expect(event.fallbackStrategy).toBe('text-content');
      expect(event.resolvedSelector).toContain('Hello World');
    });

    it('extracts aria-label attribute selector', async () => {
      const ariaLocator = makeLocator(true);
      const page = makePage({ getByLabel: ariaLocator });
      const finder = new SelfHealingFinder({ timeout: 100 });

      await finder.findElement(page, '[aria-label="Search"]');
      const [event] = finder.getHealingEvents();
      expect(event.fallbackStrategy).toBe('aria-label');
      expect(event.resolvedSelector).toBe('label="Search"');
    });
  });
});
