import type { Page } from 'playwright';
import type { WaitCondition } from './types';

/**
 * Executes a WaitCondition against a Playwright Page.
 *
 * Supports:
 * - waitForSelector (with visibility / attachment states)
 * - waitForNavigation (URL-aware)
 * - waitForNetworkIdle (configurable idle window)
 * - waitForTimeout (fixed delay)
 */
export async function applyWaitCondition(page: Page, condition: WaitCondition): Promise<void> {
  switch (condition.kind) {
    case 'selector':
      await waitForSelector(page, condition.selector, condition.state, condition.timeout);
      break;

    case 'navigation':
      await waitForNavigation(page, condition.url, condition.timeout);
      break;

    case 'network_idle':
      await waitForNetworkIdle(page, condition.idleMs, condition.timeout);
      break;

    case 'timeout':
      await waitForTimeout(page, condition.ms);
      break;

    default: {
      // Exhaustiveness guard — TypeScript will catch unhandled variants at compile-time
      const _exhaustive: never = condition;
      throw new Error(`Unknown wait condition kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Wait until a CSS selector is in the desired state.
 *
 * @param page      - Playwright Page instance
 * @param selector  - CSS / text / XPath selector
 * @param state     - 'visible' | 'hidden' | 'attached' | 'detached' (default: 'visible')
 * @param timeout   - Max wait in ms (default: 30 000)
 */
export async function waitForSelector(
  page: Page,
  selector: string,
  state: 'attached' | 'detached' | 'visible' | 'hidden' = 'visible',
  timeout = 30_000,
): Promise<void> {
  await page.waitForSelector(selector, { state, timeout });
}

/**
 * Wait for a navigation event, optionally matching a URL pattern.
 *
 * When `url` is supplied, we poll until `page.url()` matches — this handles
 * SPAs that update the URL via `history.pushState` without a full page load.
 *
 * @param page    - Playwright Page instance
 * @param url     - Expected URL string or RegExp (optional)
 * @param timeout - Max wait in ms (default: 30 000)
 */
export async function waitForNavigation(
  page: Page,
  url?: string | RegExp,
  timeout = 30_000,
): Promise<void> {
  if (url === undefined) {
    await page.waitForLoadState('load', { timeout });
    return;
  }

  const deadline = Date.now() + timeout;

  // Poll until the current URL matches the expected pattern
  while (Date.now() < deadline) {
    const current = page.url();
    const matched =
      url instanceof RegExp ? url.test(current) : current === url || current.includes(url);

    if (matched) return;

    // Give the browser a short idle slice before re-checking
    await page.waitForTimeout(100);
  }

  throw new Error(
    `waitForNavigation: URL did not match "${url}" within ${timeout}ms. Current: "${page.url()}"`,
  );
}

/**
 * Wait until there are no in-flight network requests for a given idle window.
 *
 * Playwright's built-in `networkidle` waits for 500 ms of inactivity; this
 * implementation exposes the idle window as a configurable parameter.
 *
 * @param page    - Playwright Page instance
 * @param idleMs  - Required network-idle window in ms (default: 500)
 * @param timeout - Outer timeout in ms (default: 30 000)
 */
export async function waitForNetworkIdle(
  page: Page,
  idleMs = 500,
  timeout = 30_000,
): Promise<void> {
  let inflightRequests = 0;
  let idleTimer: NodeJS.Timeout | null = null;

  const deadline = Date.now() + timeout;

  await new Promise<void>((resolve, reject) => {
    const timeoutTimer = setTimeout(() => {
      cleanup();
      reject(new Error(`waitForNetworkIdle: network not idle after ${timeout}ms`));
    }, timeout);

    const onRequest = (): void => {
      inflightRequests++;
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const onResponse = (): void => {
      inflightRequests = Math.max(0, inflightRequests - 1);
      scheduleIdleCheck();
    };

    const scheduleIdleCheck = (): void => {
      if (inflightRequests > 0) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (inflightRequests === 0 && Date.now() < deadline) {
          cleanup();
          resolve();
        }
      }, idleMs);
    };

    const cleanup = (): void => {
      clearTimeout(timeoutTimer);
      if (idleTimer) clearTimeout(idleTimer);
      page.off('request', onRequest);
      page.off('response', onResponse);
    };

    page.on('request', onRequest);
    page.on('response', onResponse);

    // If there are already no requests in flight, start the idle timer immediately
    scheduleIdleCheck();
  });
}

/**
 * Fixed-duration pause (thin wrapper around Playwright's built-in helper).
 *
 * Use sparingly — prefer event-based strategies above for reliable tests.
 */
export async function waitForTimeout(page: Page, ms: number): Promise<void> {
  await page.waitForTimeout(ms);
}
