import { Locator, Page } from 'playwright';
import { HealingEvent } from './types';

/** Fallback strategy identifiers, in the order they are attempted. */
export type HealingStrategy = 'text-content' | 'aria-label' | 'visual-context';

/** Options for the SelfHealingFinder. */
export interface SelfHealingFinderOptions {
  /** How long (ms) to wait for each locator attempt before trying the next strategy. Default: 5000. */
  timeout?: number;
}

/**
 * Finds page elements with automatic fallback when the primary CSS selector fails.
 *
 * Strategy order:
 *   1. Primary   — CSS selector as-is
 *   2. Fallback1 — text content derived from the selector
 *   3. Fallback2 — ARIA label derived from the selector
 *   4. Fallback3 — element role derived from the selector
 *
 * Every successful healing action is recorded and can be retrieved via
 * getHealingEvents() for inclusion in test reports.
 */
export class SelfHealingFinder {
  private readonly healingEvents: HealingEvent[] = [];
  private readonly timeout: number;

  constructor(options: SelfHealingFinderOptions = {}) {
    this.timeout = options.timeout ?? 5000;
  }

  /**
   * Find an element on the page using the given selector, automatically
   * falling back to alternative strategies when the primary selector fails.
   *
   * @throws {Error} when all strategies are exhausted without finding the element.
   */
  async findElement(page: Page, selector: string): Promise<Locator> {
    // Strategy 1 — Primary: exact CSS selector
    const cssLocator = await this.tryLocator(
      page.locator(selector),
      'css',
    );
    if (cssLocator) return cssLocator;

    // Strategy 2 — Fallback: text content
    const text = this.extractTextFromSelector(selector);
    if (text) {
      const textLocator = await this.tryLocator(
        page.getByText(text, { exact: false }),
        'text-content',
      );
      if (textLocator) {
        this.recordHealingEvent(selector, 'text-content', `text="${text}"`);
        return textLocator;
      }
    }

    // Strategy 3 — Fallback: ARIA label
    const ariaLabel = this.extractAriaLabel(selector);
    if (ariaLabel) {
      const ariaLocator = await this.tryLocator(
        page.getByLabel(ariaLabel),
        'aria-label',
      );
      if (ariaLocator) {
        this.recordHealingEvent(selector, 'aria-label', `label="${ariaLabel}"`);
        return ariaLocator;
      }
    }

    // Strategy 4 — Fallback: visual context via role
    const role = this.extractRole(selector);
    if (role) {
      const roleLocator = page.getByRole(role as Parameters<Page['getByRole']>[0]);
      const firstRoleLocator = await this.tryLocator(roleLocator.first(), 'visual-context');
      if (firstRoleLocator) {
        this.recordHealingEvent(selector, 'visual-context', `role="${role}"`);
        return firstRoleLocator;
      }
    }

    throw new Error(
      `SelfHealingFinder exhausted all strategies for selector: "${selector}"`,
    );
  }

  /** All healing events recorded since the last clearHealingEvents() call. */
  getHealingEvents(): HealingEvent[] {
    return [...this.healingEvents];
  }

  /** Reset the healing events log. */
  clearHealingEvents(): void {
    this.healingEvents.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Attempt to wait for a locator within the configured timeout.
   * Returns the locator on success, null on failure (so the caller can try
   * the next strategy without throwing).
   */
  private async tryLocator(
    locator: Locator,
    _strategy: 'css' | HealingStrategy,
  ): Promise<Locator | null> {
    try {
      await locator.waitFor({ timeout: this.timeout, state: 'attached' });
      return locator;
    } catch {
      return null;
    }
  }

  /**
   * Derive a human-readable text hint from common selector patterns:
   *   - `:contains("Submit")` → "Submit"
   *   - `[data-testid="submit-button"]` → "submit button"
   */
  private extractTextFromSelector(selector: string): string | null {
    const containsMatch = selector.match(/:contains\(["']?(.+?)["']?\)/);
    if (containsMatch) return containsMatch[1];

    const testIdMatch = selector.match(/\[data-testid=["'](.+?)["']\]/);
    if (testIdMatch) return testIdMatch[1].replace(/-/g, ' ');

    return null;
  }

  /** Extract an ARIA label from `[aria-label="..."]` attribute selectors. */
  private extractAriaLabel(selector: string): string | null {
    const ariaMatch = selector.match(/\[aria-label=["'](.+?)["']\]/);
    return ariaMatch ? ariaMatch[1] : null;
  }

  /**
   * Derive an ARIA role from:
   *   - HTML tag names: button, input, a, nav, …
   *   - Explicit `[role="..."]` attribute selectors
   */
  private extractRole(selector: string): string | null {
    const tagMatch = selector.match(
      /^(button|input|a|nav|header|main|footer|form|select|textarea|img|table|list|listitem)/i,
    );
    if (tagMatch) return tagMatch[1].toLowerCase();

    const roleMatch = selector.match(/\[role=["'](.+?)["']\]/);
    return roleMatch ? roleMatch[1] : null;
  }

  private recordHealingEvent(
    originalSelector: string,
    strategy: HealingStrategy,
    resolvedSelector: string,
  ): void {
    const event: HealingEvent = {
      originalSelector,
      fallbackStrategy: strategy,
      resolvedSelector,
      timestamp: new Date(),
    };
    this.healingEvents.push(event);
  }
}
