import { describe, it, expect } from 'vitest';
import * as utils from '../index.js';

describe('index barrel exports', () => {
  it('exports formatDate', () => {
    expect(typeof utils.formatDate).toBe('function');
  });

  it('exports generateId', () => {
    expect(typeof utils.generateId).toBe('function');
  });

  it('exports retry', () => {
    expect(typeof utils.retry).toBe('function');
  });

  it('exports logger', () => {
    expect(utils.logger).toBeDefined();
  });
});
