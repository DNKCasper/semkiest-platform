import { Page } from 'playwright';
import { SelfHealingFinder } from './self-healing';
import {
  ClickParams,
  EvaluateJSParams,
  NavigateToParams,
  PageContentOutput,
  ScreenshotOutput,
  Tool,
  ToolError,
  ToolParameter,
  ToolResult,
  TypeParams,
  WaitForSelectorParams,
} from './types';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeError(code: string, err: unknown): ToolError {
  const message = err instanceof Error ? err.message : String(err);
  return { code, message, details: err };
}

function wrapResult<T>(
  output: T,
  startTime: number,
  healingEvents: ReturnType<SelfHealingFinder['getHealingEvents']> = [],
): ToolResult<T> {
  return {
    success: true,
    output,
    metadata: {
      duration: Date.now() - startTime,
      timestamp: new Date(),
      healingEvents,
    },
  };
}

function wrapError<T>(
  output: T,
  error: ToolError,
  startTime: number,
): ToolResult<T> {
  return {
    success: false,
    output,
    error,
    metadata: {
      duration: Date.now() - startTime,
      timestamp: new Date(),
    },
  };
}

// ---------------------------------------------------------------------------
// navigateTo
// ---------------------------------------------------------------------------

/**
 * Navigate the page to the specified URL and wait until load.
 */
export class NavigateToTool implements Tool<NavigateToParams, null> {
  readonly name = 'navigateTo';
  readonly description = 'Navigate the browser to a URL and wait for the page to load.';
  readonly parameters: ToolParameter[] = [
    { name: 'url', type: 'string', description: 'The URL to navigate to', required: true },
  ];

  constructor(private readonly page: Page) {}

  async execute(params: NavigateToParams): Promise<ToolResult<null>> {
    const start = Date.now();
    try {
      await this.page.goto(params.url, { waitUntil: 'load' });
      return wrapResult(null, start);
    } catch (err) {
      return wrapError(null, makeError('NAVIGATE_FAILED', err), start);
    }
  }
}

// ---------------------------------------------------------------------------
// click
// ---------------------------------------------------------------------------

/**
 * Click an element identified by a CSS selector, with self-healing fallback.
 */
export class ClickTool implements Tool<ClickParams, null> {
  readonly name = 'click';
  readonly description = 'Click a page element, using self-healing strategies when the selector fails.';
  readonly parameters: ToolParameter[] = [
    { name: 'selector', type: 'string', description: 'CSS selector for the target element', required: true },
  ];

  private readonly finder: SelfHealingFinder;

  constructor(private readonly page: Page, finder?: SelfHealingFinder) {
    this.finder = finder ?? new SelfHealingFinder();
  }

  async execute(params: ClickParams): Promise<ToolResult<null>> {
    const start = Date.now();
    this.finder.clearHealingEvents();
    try {
      const locator = await this.finder.findElement(this.page, params.selector);
      await locator.click();
      return wrapResult(null, start, this.finder.getHealingEvents());
    } catch (err) {
      return wrapError(null, makeError('CLICK_FAILED', err), start);
    }
  }
}

// ---------------------------------------------------------------------------
// type
// ---------------------------------------------------------------------------

/**
 * Type text into an element identified by a CSS selector, with self-healing.
 */
export class TypeTool implements Tool<TypeParams, null> {
  readonly name = 'type';
  readonly description = 'Type text into a form element, using self-healing strategies when the selector fails.';
  readonly parameters: ToolParameter[] = [
    { name: 'selector', type: 'string', description: 'CSS selector for the input element', required: true },
    { name: 'text', type: 'string', description: 'Text to type', required: true },
  ];

  private readonly finder: SelfHealingFinder;

  constructor(private readonly page: Page, finder?: SelfHealingFinder) {
    this.finder = finder ?? new SelfHealingFinder();
  }

  async execute(params: TypeParams): Promise<ToolResult<null>> {
    const start = Date.now();
    this.finder.clearHealingEvents();
    try {
      const locator = await this.finder.findElement(this.page, params.selector);
      await locator.fill(params.text);
      return wrapResult(null, start, this.finder.getHealingEvents());
    } catch (err) {
      return wrapError(null, makeError('TYPE_FAILED', err), start);
    }
  }
}

// ---------------------------------------------------------------------------
// screenshot
// ---------------------------------------------------------------------------

/**
 * Capture a full-page screenshot and return it as a base64-encoded PNG string.
 */
export class ScreenshotTool implements Tool<Record<string, never>, ScreenshotOutput> {
  readonly name = 'screenshot';
  readonly description = 'Take a full-page screenshot and return it as a base64-encoded PNG.';
  readonly parameters: ToolParameter[] = [];

  constructor(private readonly page: Page) {}

  async execute(_params: Record<string, never>): Promise<ToolResult<ScreenshotOutput>> {
    const start = Date.now();
    try {
      const buffer = await this.page.screenshot({ fullPage: true });
      const base64 = buffer.toString('base64');
      return wrapResult(base64, start);
    } catch (err) {
      return wrapError('', makeError('SCREENSHOT_FAILED', err), start);
    }
  }
}

// ---------------------------------------------------------------------------
// waitForSelector
// ---------------------------------------------------------------------------

/**
 * Wait until a CSS selector appears in the DOM (with self-healing fallback).
 */
export class WaitForSelectorTool implements Tool<WaitForSelectorParams, null> {
  readonly name = 'waitForSelector';
  readonly description = 'Wait for an element matching the selector to appear, with self-healing fallback.';
  readonly parameters: ToolParameter[] = [
    { name: 'selector', type: 'string', description: 'CSS selector to wait for', required: true },
    { name: 'timeout', type: 'number', description: 'Maximum wait time in milliseconds (default: 30000)', required: false },
  ];

  private readonly finder: SelfHealingFinder;

  constructor(private readonly page: Page, finder?: SelfHealingFinder) {
    this.finder = finder ?? new SelfHealingFinder();
  }

  async execute(params: WaitForSelectorParams): Promise<ToolResult<null>> {
    const start = Date.now();
    this.finder.clearHealingEvents();
    const timeout = params.timeout ?? 30000;
    try {
      const finderWithTimeout = new SelfHealingFinder({ timeout });
      await finderWithTimeout.findElement(this.page, params.selector);
      return wrapResult(null, start, finderWithTimeout.getHealingEvents());
    } catch (err) {
      return wrapError(null, makeError('WAIT_FOR_SELECTOR_FAILED', err), start);
    }
  }
}

// ---------------------------------------------------------------------------
// evaluateJS
// ---------------------------------------------------------------------------

/**
 * Execute arbitrary JavaScript in the page context and return the result.
 */
export class EvaluateJSTool implements Tool<EvaluateJSParams, unknown> {
  readonly name = 'evaluateJS';
  readonly description = 'Execute a JavaScript expression in the browser page context and return the result.';
  readonly parameters: ToolParameter[] = [
    { name: 'script', type: 'string', description: 'JavaScript code to evaluate in the page context', required: true },
  ];

  constructor(private readonly page: Page) {}

  async execute(params: EvaluateJSParams): Promise<ToolResult<unknown>> {
    const start = Date.now();
    try {
      // eslint-disable-next-line no-new-func
      const result = await this.page.evaluate(new Function(params.script) as () => unknown);
      return wrapResult(result, start);
    } catch (err) {
      return wrapError(null, makeError('EVALUATE_JS_FAILED', err), start);
    }
  }
}

// ---------------------------------------------------------------------------
// getPageContent
// ---------------------------------------------------------------------------

/**
 * Return the visible text content of the current page.
 */
export class GetPageContentTool implements Tool<Record<string, never>, PageContentOutput> {
  readonly name = 'getPageContent';
  readonly description = 'Return the visible text content of the current page.';
  readonly parameters: ToolParameter[] = [];

  constructor(private readonly page: Page) {}

  async execute(_params: Record<string, never>): Promise<ToolResult<PageContentOutput>> {
    const start = Date.now();
    try {
      const content = await this.page.innerText('body');
      return wrapResult(content, start);
    } catch (err) {
      return wrapError('', makeError('GET_PAGE_CONTENT_FAILED', err), start);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the standard Playwright tool set bound to a specific page instance.
 *
 * @param page  - Playwright Page to bind tools to
 * @param finder - Optional shared SelfHealingFinder; a new one is created if omitted
 */
export function createPlaywrightTools(
  page: Page,
  finder?: SelfHealingFinder,
): [
  NavigateToTool,
  ClickTool,
  TypeTool,
  ScreenshotTool,
  WaitForSelectorTool,
  EvaluateJSTool,
  GetPageContentTool,
] {
  const sharedFinder = finder ?? new SelfHealingFinder();
  return [
    new NavigateToTool(page),
    new ClickTool(page, sharedFinder),
    new TypeTool(page, sharedFinder),
    new ScreenshotTool(page),
    new WaitForSelectorTool(page, sharedFinder),
    new EvaluateJSTool(page),
    new GetPageContentTool(page),
  ];
}
