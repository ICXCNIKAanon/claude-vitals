import { describe, it } from 'node:test';
import assert from 'node:assert';
import { estimateCost, formatCost } from '../src/cost.ts';
import type { ContextHealth } from '../src/types.ts';

describe('estimateCost', () => {
  it('calculates cost for Opus', () => {
    const health: ContextHealth = {
      percent: 50, model: 'Opus 4.6', windowSize: 200000,
      inputTokens: 50000, outputTokens: 10000,
      cacheCreationTokens: 5000, cacheReadTokens: 20000, totalTokens: 85000,
    };
    const cost = estimateCost(health);
    // input: 50000 * 15/1M = 0.75
    // output: 10000 * 75/1M = 0.75
    // cache_create: 5000 * 15 * 1.25/1M = 0.09375
    // cache_read: 20000 * 15 * 0.10/1M = 0.03
    // total: ~1.62
    assert.ok(cost > 1.5 && cost < 1.7, `Expected ~1.62, got ${cost}`);
  });

  it('calculates cost for Sonnet', () => {
    const health: ContextHealth = {
      percent: 50, model: 'Sonnet 4.6', windowSize: 200000,
      inputTokens: 100000, outputTokens: 20000,
      cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 120000,
    };
    const cost = estimateCost(health);
    assert.ok(cost > 0.55 && cost < 0.65, `Expected ~0.60, got ${cost}`);
  });

  it('returns 0 for unknown model', () => {
    const health: ContextHealth = {
      percent: 0, model: 'Unknown', windowSize: 0,
      inputTokens: 0, outputTokens: 0,
      cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 0,
    };
    assert.strictEqual(estimateCost(health), 0);
  });
});

describe('formatCost', () => {
  it('returns empty for tiny costs', () => {
    assert.strictEqual(formatCost(0.005), '');
  });

  it('formats small costs', () => {
    assert.strictEqual(formatCost(0.47), '~$0.47');
  });

  it('formats larger costs', () => {
    assert.strictEqual(formatCost(2.50), '~$2.50');
  });
});
