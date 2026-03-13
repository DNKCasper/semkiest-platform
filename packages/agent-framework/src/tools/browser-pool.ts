import { Browser, chromium, LaunchOptions } from 'playwright';

/** Configuration options for the BrowserPool. */
export interface BrowserPoolOptions {
  /** Maximum number of concurrent browser instances */
  maxSize: number;
  /** Options forwarded to chromium.launch() */
  launchOptions?: LaunchOptions;
}

interface PoolEntry {
  browser: Browser;
  inUse: boolean;
  createdAt: Date;
}

/**
 * Manages a pool of Playwright browser instances, reusing them across executions
 * to avoid the overhead of launching a new browser for every task.
 *
 * Usage:
 *   const pool = new BrowserPool({ maxSize: 3 });
 *   const browser = await pool.acquire();
 *   // ... use browser ...
 *   pool.release(browser);
 *   await pool.shutdown(); // on application exit
 */
export class BrowserPool {
  private readonly pool: PoolEntry[] = [];
  private readonly maxSize: number;
  private readonly launchOptions: LaunchOptions;
  private shuttingDown = false;

  constructor(options: BrowserPoolOptions) {
    this.maxSize = options.maxSize;
    this.launchOptions = options.launchOptions ?? {};
  }

  /**
   * Acquire a browser from the pool. If a free instance exists it is returned
   * immediately; if the pool has capacity a new browser is launched; otherwise
   * the call blocks until an instance is released.
   */
  async acquire(): Promise<Browser> {
    if (this.shuttingDown) {
      throw new Error('BrowserPool is shutting down — cannot acquire new browsers');
    }

    const available = this.pool.find((entry) => !entry.inUse);
    if (available) {
      available.inUse = true;
      return available.browser;
    }

    if (this.pool.length < this.maxSize) {
      const browser = await chromium.launch(this.launchOptions);
      const entry: PoolEntry = { browser, inUse: true, createdAt: new Date() };
      this.pool.push(entry);
      return browser;
    }

    return this.waitForAvailable();
  }

  /**
   * Return a browser to the pool so it can be reused by other callers.
   * The browser is kept open — call shutdown() to close all instances.
   */
  release(browser: Browser): void {
    const entry = this.pool.find((e) => e.browser === browser);
    if (entry) {
      entry.inUse = false;
    }
  }

  /**
   * Close all browser instances and clear the pool. Should be called once
   * on application shutdown to release OS resources.
   */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    await Promise.all(this.pool.map((entry) => entry.browser.close()));
    this.pool.length = 0;
  }

  /** Total number of browsers currently in the pool (busy + free). */
  get size(): number {
    return this.pool.length;
  }

  /** Number of browsers currently available for acquisition. */
  get available(): number {
    return this.pool.filter((entry) => !entry.inUse).length;
  }

  /** Number of browsers currently in use. */
  get inUse(): number {
    return this.pool.filter((entry) => entry.inUse).length;
  }

  /** Poll every 100 ms until a free entry is available. */
  private waitForAvailable(): Promise<Browser> {
    return new Promise<Browser>((resolve, reject) => {
      const interval = setInterval(() => {
        if (this.shuttingDown) {
          clearInterval(interval);
          reject(new Error('BrowserPool shut down while waiting for available browser'));
          return;
        }
        const freeEntry = this.pool.find((e) => !e.inUse);
        if (freeEntry) {
          clearInterval(interval);
          freeEntry.inUse = true;
          resolve(freeEntry.browser);
        }
      }, 100);
    });
  }
}
