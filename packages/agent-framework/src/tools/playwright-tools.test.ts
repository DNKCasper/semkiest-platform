import { Locator, Page } from 'playwright';
import { SelfHealingFinder } from './self-healing';
import {
  ClickTool,
  EvaluateJSTool,
  GetPageContentTool,
  NavigateToTool,
  ScreenshotTool,
  TypeTool,
  WaitForSelectorTool,
  createPlaywrightTools,
} from './playwright-tools';

// ---------------------------------------------------------------------------
// Page / Locator mock factories
// ---------------------------------------------------------------------------

function makeLocator(found = true): Locator {
  return {
    waitFor: found
      ? jest.fn().mockResolvedValue(undefined)
      : jest.fn().mockRejectedValue(new Error('not found')),
    click: jest.fn().mockResolvedValue(undefined),
    fill: jest.fn().mockResolvedValue(undefined),
  } as unknown as Locator;
}

function makePage(overrides: Partial<{
  goto: jest.Mock;
  locator: jest.Mock;
  screenshot: jest.Mock;
  evaluate: jest.Mock;
  innerText: jest.Mock;
  getByText: jest.Mock;
  getByLabel: jest.Mock;
  getByRole: jest.Mock;
}>): Page {
  return {
    goto: overrides.goto ?? jest.fn().mockResolvedValue(undefined),
    locator: overrides.locator ?? jest.fn().mockReturnValue(makeLocator(true)),
    screenshot: overrides.screenshot ?? jest.fn().mockResolvedValue(Buffer.from('png')),
    evaluate: overrides.evaluate ?? jest.fn().mockResolvedValue(42),
    innerText: overrides.innerText ?? jest.fn().mockResolvedValue('page text'),
    getByText: overrides.getByText ?? jest.fn().mockReturnValue(makeLocator(false)),
    getByLabel: overrides.getByLabel ?? jest.fn().mockReturnValue(makeLocator(false)),
    getByRole: overrides.getByRole ?? jest.fn().mockReturnValue({ first: () => makeLocator(false) }),
  } as unknown as Page;
}

// ---------------------------------------------------------------------------
// NavigateToTool
// ---------------------------------------------------------------------------

describe('NavigateToTool', () => {
  it('navigates to the given URL and returns success', async () => {
    const goto = jest.fn().mockResolvedValue(undefined);
    const page = makePage({ goto });
    const tool = new NavigateToTool(page);

    const result = await tool.execute({ url: 'https://example.com' });
    expect(result.success).toBe(true);
    expect(goto).toHaveBeenCalledWith('https://example.com', { waitUntil: 'load' });
    expect(result.metadata?.duration).toBeGreaterThanOrEqual(0);
  });

  it('returns error result when navigation throws', async () => {
    const page = makePage({ goto: jest.fn().mockRejectedValue(new Error('net::ERR_NAME_NOT_RESOLVED')) });
    const tool = new NavigateToTool(page);

    const result = await tool.execute({ url: 'https://bad.url' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NAVIGATE_FAILED');
  });

  it('has correct name and description', () => {
    const tool = new NavigateToTool(makePage({}));
    expect(tool.name).toBe('navigateTo');
    expect(tool.description).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ClickTool
// ---------------------------------------------------------------------------

describe('ClickTool', () => {
  it('clicks the element found by selector', async () => {
    const locator = makeLocator(true);
    const page = makePage({ locator: jest.fn().mockReturnValue(locator) });
    const tool = new ClickTool(page);

    const result = await tool.execute({ selector: '#btn' });
    expect(result.success).toBe(true);
    expect(locator.click).toHaveBeenCalled();
  });

  it('returns error when element cannot be found', async () => {
    const page = makePage({ locator: jest.fn().mockReturnValue(makeLocator(false)) });
    const tool = new ClickTool(page);

    const result = await tool.execute({ selector: '#missing' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('CLICK_FAILED');
  });

  it('includes healing events in metadata when healing occurs', async () => {
    const locator = makeLocator(true);
    const finder = new SelfHealingFinder({ timeout: 100 });
    // Simulate a healing event by pre-populating via a real healing scenario
    const page = makePage({
      locator: jest.fn().mockReturnValue(makeLocator(false)),
      getByText: jest.fn().mockReturnValue(locator),
    });
    const tool = new ClickTool(page, finder);

    const result = await tool.execute({ selector: '[data-testid="save-button"]' });
    expect(result.success).toBe(true);
    expect(result.metadata?.healingEvents).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// TypeTool
// ---------------------------------------------------------------------------

describe('TypeTool', () => {
  it('fills the element with the given text', async () => {
    const locator = makeLocator(true);
    const page = makePage({ locator: jest.fn().mockReturnValue(locator) });
    const tool = new TypeTool(page);

    const result = await tool.execute({ selector: 'input[name="email"]', text: 'user@example.com' });
    expect(result.success).toBe(true);
    expect(locator.fill).toHaveBeenCalledWith('user@example.com');
  });

  it('returns error when element cannot be found', async () => {
    const page = makePage({ locator: jest.fn().mockReturnValue(makeLocator(false)) });
    const tool = new TypeTool(page);

    const result = await tool.execute({ selector: '#missing', text: 'hello' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('TYPE_FAILED');
  });
});

// ---------------------------------------------------------------------------
// ScreenshotTool
// ---------------------------------------------------------------------------

describe('ScreenshotTool', () => {
  it('returns a base64-encoded screenshot string', async () => {
    const png = Buffer.from('\x89PNG');
    const page = makePage({ screenshot: jest.fn().mockResolvedValue(png) });
    const tool = new ScreenshotTool(page);

    const result = await tool.execute({});
    expect(result.success).toBe(true);
    expect(typeof result.output).toBe('string');
    expect(Buffer.from(result.output as string, 'base64').toString()).toContain('PNG');
  });

  it('returns error result on screenshot failure', async () => {
    const page = makePage({ screenshot: jest.fn().mockRejectedValue(new Error('screenshot error')) });
    const tool = new ScreenshotTool(page);

    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SCREENSHOT_FAILED');
  });
});

// ---------------------------------------------------------------------------
// WaitForSelectorTool
// ---------------------------------------------------------------------------

describe('WaitForSelectorTool', () => {
  it('succeeds when element is found within timeout', async () => {
    const page = makePage({ locator: jest.fn().mockReturnValue(makeLocator(true)) });
    const tool = new WaitForSelectorTool(page);

    const result = await tool.execute({ selector: '.spinner', timeout: 500 });
    expect(result.success).toBe(true);
  });

  it('returns error when element is not found within timeout', async () => {
    const page = makePage({ locator: jest.fn().mockReturnValue(makeLocator(false)) });
    const tool = new WaitForSelectorTool(page);

    const result = await tool.execute({ selector: '.ghost', timeout: 100 });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('WAIT_FOR_SELECTOR_FAILED');
  });
});

// ---------------------------------------------------------------------------
// EvaluateJSTool
// ---------------------------------------------------------------------------

describe('EvaluateJSTool', () => {
  it('returns the result of the evaluated script', async () => {
    const page = makePage({ evaluate: jest.fn().mockResolvedValue(7) });
    const tool = new EvaluateJSTool(page);

    const result = await tool.execute({ script: 'return 3 + 4;' });
    expect(result.success).toBe(true);
    expect(result.output).toBe(7);
  });

  it('returns error result when script throws', async () => {
    const page = makePage({ evaluate: jest.fn().mockRejectedValue(new Error('syntax error')) });
    const tool = new EvaluateJSTool(page);

    const result = await tool.execute({ script: '[[[ invalid' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('EVALUATE_JS_FAILED');
  });
});

// ---------------------------------------------------------------------------
// GetPageContentTool
// ---------------------------------------------------------------------------

describe('GetPageContentTool', () => {
  it('returns visible text content of the page', async () => {
    const page = makePage({ innerText: jest.fn().mockResolvedValue('Hello, world!') });
    const tool = new GetPageContentTool(page);

    const result = await tool.execute({});
    expect(result.success).toBe(true);
    expect(result.output).toBe('Hello, world!');
  });

  it('returns error result on failure', async () => {
    const page = makePage({ innerText: jest.fn().mockRejectedValue(new Error('DOM error')) });
    const tool = new GetPageContentTool(page);

    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('GET_PAGE_CONTENT_FAILED');
  });
});

// ---------------------------------------------------------------------------
// createPlaywrightTools factory
// ---------------------------------------------------------------------------

describe('createPlaywrightTools()', () => {
  it('returns all 7 expected tools', () => {
    const page = makePage({});
    const tools = createPlaywrightTools(page);
    const names = tools.map((t) => t.name);
    expect(names).toEqual([
      'navigateTo',
      'click',
      'type',
      'screenshot',
      'waitForSelector',
      'evaluateJS',
      'getPageContent',
    ]);
  });

  it('all tools have non-empty descriptions', () => {
    const page = makePage({});
    const tools = createPlaywrightTools(page);
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('accepts a shared SelfHealingFinder instance', () => {
    const page = makePage({});
    const finder = new SelfHealingFinder();
    const tools = createPlaywrightTools(page, finder);
    expect(tools).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// ToolResult metadata shape
// ---------------------------------------------------------------------------

describe('ToolResult metadata', () => {
  it('includes duration and timestamp on success', async () => {
    const page = makePage({});
    const tool = new NavigateToTool(page);
    const before = Date.now();
    const result = await tool.execute({ url: 'https://example.com' });
    const after = Date.now();

    expect(result.metadata?.duration).toBeGreaterThanOrEqual(0);
    const ts = (result.metadata?.timestamp as Date).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('includes duration and timestamp on failure', async () => {
    const page = makePage({ goto: jest.fn().mockRejectedValue(new Error('fail')) });
    const tool = new NavigateToTool(page);
    const result = await tool.execute({ url: 'bad' });

    expect(result.metadata?.duration).toBeGreaterThanOrEqual(0);
    expect(result.metadata?.timestamp).toBeInstanceOf(Date);
  });
});
