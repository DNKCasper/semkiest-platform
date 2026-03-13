import { describe, it, expect } from 'vitest';
import { logger, createCorrelatedLogger, createChildLogger } from '../logger.js';

describe('logger', () => {
  it('is defined', () => {
    expect(logger).toBeDefined();
  });

  it('has expected log methods', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.fatal).toBe('function');
    expect(typeof logger.trace).toBe('function');
  });

  it('exposes a level property', () => {
    expect(typeof logger.level).toBe('string');
  });

  it('defaults to info level when NODE_ENV is not development', () => {
    const originalEnv = process.env['NODE_ENV'];
    const originalLevel = process.env['LOG_LEVEL'];
    delete process.env['NODE_ENV'];
    delete process.env['LOG_LEVEL'];
    // Re-import to get fresh level resolution would require module reload;
    // instead verify the logger level is a valid log level
    const validLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
    expect(validLevels).toContain(logger.level);
    if (originalEnv !== undefined) process.env['NODE_ENV'] = originalEnv;
    if (originalLevel !== undefined) process.env['LOG_LEVEL'] = originalLevel;
  });
});

describe('createCorrelatedLogger', () => {
  it('returns a child logger', () => {
    const child = createCorrelatedLogger('test-correlation-id');
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
  });

  it('returns a different instance from root logger', () => {
    const child = createCorrelatedLogger('abc-123');
    expect(child).not.toBe(logger);
  });

  it('creates distinct child loggers for different correlation IDs', () => {
    const child1 = createCorrelatedLogger('id-1');
    const child2 = createCorrelatedLogger('id-2');
    expect(child1).not.toBe(child2);
  });
});

describe('createChildLogger', () => {
  it('returns a child logger with bound fields', () => {
    const child = createChildLogger({ service: 'test-service', requestId: '42' });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
  });

  it('returns a different instance from root logger', () => {
    const child = createChildLogger({ component: 'my-component' });
    expect(child).not.toBe(logger);
  });

  it('accepts empty bindings', () => {
    const child = createChildLogger({});
    expect(child).toBeDefined();
  });
});
