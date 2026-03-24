import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getMemoryUsage, formatDuration, formatTokens } from '../src/system.ts';

describe('getMemoryUsage', () => {
  it('returns used and total in GB', () => {
    const mem = getMemoryUsage();
    assert.ok(mem.total > 0);
    assert.ok(mem.used >= 0);
    assert.ok(mem.used <= mem.total);
  });
});

describe('formatDuration', () => {
  it('formats seconds', () => {
    assert.strictEqual(formatDuration(45), '45s');
  });

  it('formats minutes and seconds', () => {
    assert.strictEqual(formatDuration(125), '2m 5s');
  });

  it('formats hours', () => {
    assert.strictEqual(formatDuration(3661), '1h 1m');
  });

  it('returns 0s for zero', () => {
    assert.strictEqual(formatDuration(0), '0s');
  });

  it('returns 0s for negative', () => {
    assert.strictEqual(formatDuration(-5), '0s');
  });
});

describe('formatTokens', () => {
  it('formats millions', () => {
    assert.strictEqual(formatTokens(1_500_000), '1.5M');
  });

  it('formats thousands', () => {
    assert.strictEqual(formatTokens(85000), '85k');
  });

  it('formats small numbers', () => {
    assert.strictEqual(formatTokens(500), '500');
  });
});
