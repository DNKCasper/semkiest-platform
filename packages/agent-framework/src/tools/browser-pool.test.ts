import { Browser } from 'playwright';
import { BrowserPool } from './browser-pool';

// ---------------------------------------------------------------------------
// Mock Playwright's chromium.launch so tests do not spin up real browsers.
// ---------------------------------------------------------------------------

const mockBrowserClose = jest.fn().mockResolvedValue(undefined);

const createMockBrowser = (): Browser =>
  ({ close: mockBrowserClose } as unknown as Browser);

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn(() => Promise.resolve(createMockBrowser())),
  },
}));

import { chromium } from 'playwright';
const mockLaunch = chromium.launch as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BrowserPool', () => {
  describe('acquire()', () => {
    it('launches a new browser when pool is empty', async () => {
      const pool = new BrowserPool({ maxSize: 2 });
      const browser = await pool.acquire();
      expect(mockLaunch).toHaveBeenCalledTimes(1);
      expect(browser).toBeDefined();
      expect(pool.size).toBe(1);
      expect(pool.inUse).toBe(1);
      expect(pool.available).toBe(0);
    });

    it('reuses a released browser instead of launching a new one', async () => {
      const pool = new BrowserPool({ maxSize: 2 });
      const browser1 = await pool.acquire();
      pool.release(browser1);
      const browser2 = await pool.acquire();
      expect(mockLaunch).toHaveBeenCalledTimes(1); // only one launch
      expect(browser2).toBe(browser1);
    });

    it('launches up to maxSize browsers concurrently', async () => {
      const pool = new BrowserPool({ maxSize: 2 });
      const b1 = await pool.acquire();
      const b2 = await pool.acquire();
      expect(mockLaunch).toHaveBeenCalledTimes(2);
      expect(b1).not.toBe(b2);
      expect(pool.size).toBe(2);
      expect(pool.inUse).toBe(2);
    });

    it('blocks when pool is at capacity and unblocks on release', async () => {
      const pool = new BrowserPool({ maxSize: 1 });
      const browser = await pool.acquire();

      // Schedule a release after 150 ms (> the 100 ms polling interval)
      setTimeout(() => pool.release(browser), 150);

      const browser2 = await pool.acquire();
      expect(browser2).toBe(browser);
      expect(mockLaunch).toHaveBeenCalledTimes(1);
    });

    it('throws when pool is shutting down', async () => {
      const pool = new BrowserPool({ maxSize: 1 });
      await pool.shutdown();
      await expect(pool.acquire()).rejects.toThrow('shutting down');
    });
  });

  describe('release()', () => {
    it('marks a browser as available', async () => {
      const pool = new BrowserPool({ maxSize: 1 });
      const browser = await pool.acquire();
      expect(pool.available).toBe(0);
      pool.release(browser);
      expect(pool.available).toBe(1);
      expect(pool.inUse).toBe(0);
    });

    it('silently ignores browsers not in the pool', () => {
      const pool = new BrowserPool({ maxSize: 1 });
      const stranger = createMockBrowser();
      expect(() => pool.release(stranger)).not.toThrow();
    });
  });

  describe('shutdown()', () => {
    it('closes all browser instances and empties the pool', async () => {
      const pool = new BrowserPool({ maxSize: 2 });
      await pool.acquire();
      await pool.acquire();
      expect(pool.size).toBe(2);
      await pool.shutdown();
      expect(mockBrowserClose).toHaveBeenCalledTimes(2);
      expect(pool.size).toBe(0);
    });
  });

  describe('size / available / inUse getters', () => {
    it('reflect correct counts through the lifecycle', async () => {
      const pool = new BrowserPool({ maxSize: 3 });
      expect(pool.size).toBe(0);
      expect(pool.available).toBe(0);
      expect(pool.inUse).toBe(0);

      const b1 = await pool.acquire();
      const b2 = await pool.acquire();
      expect(pool.size).toBe(2);
      expect(pool.inUse).toBe(2);
      expect(pool.available).toBe(0);

      pool.release(b1);
      expect(pool.inUse).toBe(1);
      expect(pool.available).toBe(1);

      pool.release(b2);
      expect(pool.inUse).toBe(0);
      expect(pool.available).toBe(2);
    });
  });
});
