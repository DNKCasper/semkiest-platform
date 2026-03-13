import type { Page } from 'playwright';

/** Result of a single keyboard navigation check. */
export interface KeyboardNavigationResult {
  passed: boolean;
  violations: KeyboardViolation[];
  tabOrder: TabOrderEntry[];
  skipLinks: SkipLinkResult[];
  focusIndicators: FocusIndicatorResult[];
}

export interface KeyboardViolation {
  type: 'tab-order' | 'focus-trap' | 'missing-focus' | 'skip-link' | 'focus-indicator';
  element: string;
  message: string;
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
}

export interface TabOrderEntry {
  index: number;
  element: string;
  tagName: string;
  text: string;
  isFocusable: boolean;
  tabIndex: number;
}

export interface SkipLinkResult {
  href: string;
  text: string;
  isVisible: boolean;
  targetExists: boolean;
  passed: boolean;
}

export interface FocusIndicatorResult {
  element: string;
  hasVisibleOutline: boolean;
  outlineStyle: string;
  passed: boolean;
}

/**
 * Tests keyboard navigation on a page loaded in a Playwright browser context.
 *
 * Checks tab order, focus management, skip links, and focus indicator visibility.
 */
export async function testKeyboardNavigation(
  page: Page
): Promise<KeyboardNavigationResult> {
  const violations: KeyboardViolation[] = [];

  const [tabOrder, skipLinks, focusIndicators] = await Promise.all([
    captureTabOrder(page),
    checkSkipLinks(page),
    checkFocusIndicators(page),
  ]);

  // Validate tab order — detect elements with positive tabIndex (anti-pattern)
  for (const entry of tabOrder) {
    if (entry.tabIndex > 0) {
      violations.push({
        type: 'tab-order',
        element: entry.element,
        message: `Element has tabindex="${entry.tabIndex}". Positive tabindex values disrupt natural tab order.`,
        severity: 'serious',
      });
    }
  }

  // Flag skip-link failures
  for (const link of skipLinks) {
    if (!link.passed) {
      violations.push({
        type: 'skip-link',
        element: `a[href="${link.href}"]`,
        message: link.targetExists
          ? `Skip link "${link.text}" exists but its target is not reachable.`
          : `Skip link "${link.text}" points to missing target "${link.href}".`,
        severity: 'serious',
      });
    }
  }

  // Flag missing focus indicators
  for (const indicator of focusIndicators) {
    if (!indicator.passed) {
      violations.push({
        type: 'focus-indicator',
        element: indicator.element,
        message: `Element does not display a visible focus indicator (outline: ${indicator.outlineStyle}).`,
        severity: 'serious',
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    tabOrder,
    skipLinks,
    focusIndicators,
  };
}

/**
 * Simulates pressing Tab repeatedly to capture the sequential focus order of
 * all keyboard-focusable elements on the page.
 */
async function captureTabOrder(page: Page): Promise<TabOrderEntry[]> {
  // Collect all potentially-focusable elements with their tabIndex values
  const elements: TabOrderEntry[] = await page.evaluate(() => {
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]',
      'details > summary',
    ].join(', ');

    const nodes = Array.from(document.querySelectorAll(focusableSelectors));
    return nodes.map((el, index) => {
      const htmlEl = el as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const text =
        htmlEl.textContent?.trim().slice(0, 60) ||
        (htmlEl as HTMLInputElement).placeholder ||
        htmlEl.getAttribute('aria-label') ||
        '';
      const selector = buildSelector(el);

      return {
        index,
        element: selector,
        tagName: tag,
        text,
        isFocusable: !htmlEl.hasAttribute('disabled'),
        tabIndex: htmlEl.tabIndex,
      };
    });

    function buildSelector(el: Element): string {
      if (el.id) return `#${el.id}`;
      const tag = el.tagName.toLowerCase();
      const cls = el.className
        ? `.${String(el.className).split(' ').join('.')}`
        : '';
      return `${tag}${cls}`;
    }
  });

  return elements;
}

/**
 * Detects skip-navigation links (typically the first focusable link on a page)
 * and verifies they point to existing in-page anchors.
 */
async function checkSkipLinks(page: Page): Promise<SkipLinkResult[]> {
  const results: SkipLinkResult[] = await page.evaluate(() => {
    const skipLinkPatterns = /skip|jump|bypass|main|content/i;
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')
    );

    return links
      .filter((link) => skipLinkPatterns.test(link.textContent || ''))
      .map((link) => {
        const href = link.getAttribute('href') || '';
        const targetId = href.slice(1);
        const target = targetId ? document.getElementById(targetId) : null;
        const style = window.getComputedStyle(link);
        const isVisible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0';

        return {
          href,
          text: link.textContent?.trim() || '',
          isVisible,
          targetExists: target !== null,
          passed: target !== null && isVisible,
        };
      });
  });

  return results;
}

/**
 * Checks whether interactive elements show a visible focus outline by briefly
 * focusing each one via JavaScript and inspecting computed styles.
 */
async function checkFocusIndicators(page: Page): Promise<FocusIndicatorResult[]> {
  const results: FocusIndicatorResult[] = await page.evaluate(() => {
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
    ].join(', ');

    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(focusableSelectors)
    ).slice(0, 30); // Limit to first 30 to avoid overwhelming output

    return nodes.map((el) => {
      el.focus({ preventScroll: true });
      const style = window.getComputedStyle(el);
      const outlineStyle = style.outline;
      const outlineWidth = parseFloat(style.outlineWidth || '0');
      const hasVisibleOutline =
        outlineStyle !== 'none' &&
        outlineStyle !== '' &&
        outlineWidth > 0;

      el.blur();

      const selector = el.id
        ? `#${el.id}`
        : `${el.tagName.toLowerCase()}${
            el.className ? `.${String(el.className).split(' ')[0]}` : ''
          }`;

      return {
        element: selector,
        hasVisibleOutline,
        outlineStyle,
        passed: hasVisibleOutline,
      };
    });
  });

  return results;
}
