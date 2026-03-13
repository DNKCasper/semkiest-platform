import type { Page } from 'playwright';
import { waitForSelector, waitForNavigation, waitForTimeout, waitForNetworkIdle } from './wait-strategies';

// ─── Minimal Page mock helpers ────────────────────────────────────────────────

function makePage(overrides: Partial<Record<string, unknown>> = {}): Page {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  const page = {
    waitForSelector: jest.fn().mockResolvedValue(null),
    waitForLoadState: jest.fn().mockResolvedValue(null),
    waitForTimeout: jest.fn().mockResolvedValue(null),
    url: jest.fn().mockReturnValue('https://example.com/'),
    on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
    }),
    off: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((l) => l !== cb);
      }
    }),
    _emit: (event: string, ...args: unknown[]) => {
      (listeners[event] ?? []).forEach((cb) => cb(...args));
    },
    ...overrides,
  } as unknown as Page;

  return page;
}

// ─── waitForSelector ──────────────────────────────────────────────────────────

describe('waitForSelector', () => {
  it('delegates to page.waitForSelector with defaults', async () => {
    const page = makePage();
    await waitForSelector(page, '#btn');

    expect(page.waitForSelector).toHaveBeenCalledWith('#btn', {
      state: 'visible',
      timeout: 30_000,
    });
  });

  it('forwards custom state and timeout', async () => {
    const page = makePage();
    await waitForSelector(page, '#modal', 'hidden', 5_000);

    expect(page.waitForSelector).toHaveBeenCalledWith('#modal', {
      state: 'hidden',
      timeout: 5_000,
    });
  });
});

// ─── waitForNavigation ────────────────────────────────────────────────────────

describe('waitForNavigation', () => {
  it('waits for load state when no URL provided', async () => {
    const page = makePage();
    await waitForNavigation(page);

    expect(page.waitForLoadState).toHaveBeenCalledWith('load', { timeout: 30_000 });
  });

  it('resolves immediately when current URL already matches', async () => {
    const page = makePage({ url: jest.fn().mockReturnValue('https://example.com/dashboard') });
    // Should not throw
    await waitForNavigation(page, 'https://example.com/dashboard');
  });

  it('resolves when URL matches a regexp', async () => {
    const page = makePage({ url: jest.fn().mockReturnValue('https://example.com/dashboard') });
    await waitForNavigation(page, /dashboard/);
  });

  it('rejects when URL never matches within timeout', async () => {
    const page = makePage({ url: jest.fn().mockReturnValue('https://example.com/') });
    await expect(
      waitForNavigation(page, 'https://example.com/dashboard', 50),
    ).rejects.toThrow(/did not match/);
  });
});

// ─── waitForTimeout ───────────────────────────────────────────────────────────

describe('waitForTimeout', () => {
  it('delegates to page.waitForTimeout', async () => {
    const page = makePage();
    await waitForTimeout(page, 200);
    expect(page.waitForTimeout).toHaveBeenCalledWith(200);
  });
});

// ─── waitForNetworkIdle ───────────────────────────────────────────────────────

describe('waitForNetworkIdle', () => {
  it('resolves quickly when there are no in-flight requests', async () => {
    const page = makePage();
    await expect(waitForNetworkIdle(page, 50, 500)).resolves.toBeUndefined();
  });

  it('resolves after requests complete and idle window elapses', async () => {
    const page = makePage() as Page & { _emit: (event: string, ...args: unknown[]) => void };

    const promise = waitForNetworkIdle(page, 100, 2_000);

    // Fire a request then a response after a short delay
    setTimeout(() => {
      (page as unknown as { _emit: (event: string) => void })._emit('request');
    }, 20);
    setTimeout(() => {
      (page as unknown as { _emit: (event: string) => void })._emit('response');
    }, 40);

    await expect(promise).resolves.toBeUndefined();
  });
});
