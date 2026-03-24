import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DEFAULT_CONFIG, mergeConfig } from '../src/config.ts';

describe('DEFAULT_CONFIG', () => {
  it('has auto layout', () => {
    assert.strictEqual(DEFAULT_CONFIG.layout, 'auto');
  });

  it('shows everything by default', () => {
    for (const [key, val] of Object.entries(DEFAULT_CONFIG.show)) {
      assert.strictEqual(val, true, `show.${key} should be true`);
    }
  });

  it('has sensible thresholds', () => {
    assert.strictEqual(DEFAULT_CONFIG.thresholds.contextWarn, 70);
    assert.strictEqual(DEFAULT_CONFIG.thresholds.contextDanger, 85);
  });
});

describe('mergeConfig', () => {
  it('overrides specific values while keeping defaults', () => {
    const merged = mergeConfig({ layout: 'compact' });
    assert.strictEqual(merged.layout, 'compact');
    assert.strictEqual(merged.show.tools, true);
  });

  it('deep merges show object', () => {
    const merged = mergeConfig({ show: { cost: false } });
    assert.strictEqual(merged.show.cost, false);
    assert.strictEqual(merged.show.tools, true);
  });

  it('deep merges colors', () => {
    const merged = mergeConfig({ colors: { healthy: '#00ff00' } });
    assert.strictEqual(merged.colors.healthy, '#00ff00');
    assert.strictEqual(merged.colors.warning, 'yellow');
  });

  it('ignores invalid layout values', () => {
    const merged = mergeConfig({ layout: 'invalid' as any });
    assert.strictEqual(merged.layout, 'auto');
  });

  it('returns defaults for empty input', () => {
    const merged = mergeConfig({});
    assert.deepStrictEqual(merged, DEFAULT_CONFIG);
  });
});
