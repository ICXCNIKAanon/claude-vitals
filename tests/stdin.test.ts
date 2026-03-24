import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseStdin, computeContextHealth } from '../src/stdin.ts';

const SAMPLE_STDIN = {
  model: { id: 'claude-opus-4-6', display_name: 'Opus 4.6' },
  context_window: {
    context_window_size: 200000,
    current_usage: {
      input_tokens: 50000,
      output_tokens: 10000,
      cache_creation_input_tokens: 5000,
      cache_read_input_tokens: 20000,
    },
    used_percentage: 42,
    remaining_percentage: 58,
  },
  transcript_path: '/tmp/session.jsonl',
  cwd: '/Users/test/myproject',
};

describe('parseStdin', () => {
  it('parses valid JSON', () => {
    const result = parseStdin(JSON.stringify(SAMPLE_STDIN));
    assert.strictEqual(result.model.display_name, 'Opus 4.6');
    assert.strictEqual(result.cwd, '/Users/test/myproject');
  });

  it('returns empty defaults for malformed JSON', () => {
    const result = parseStdin('not json{{{');
    assert.deepStrictEqual(result.model, {});
    assert.deepStrictEqual(result.context_window, {});
  });

  it('returns empty defaults for empty string', () => {
    const result = parseStdin('');
    assert.deepStrictEqual(result.model, {});
  });
});

describe('computeContextHealth', () => {
  it('uses native used_percentage when available', () => {
    const health = computeContextHealth(SAMPLE_STDIN);
    assert.strictEqual(health.percent, 42);
    assert.strictEqual(health.model, 'Opus 4.6');
    assert.strictEqual(health.windowSize, 200000);
  });

  it('calculates percent from tokens when native not available', () => {
    const data = {
      ...SAMPLE_STDIN,
      context_window: {
        ...SAMPLE_STDIN.context_window,
        used_percentage: undefined,
        remaining_percentage: undefined,
      },
    };
    const health = computeContextHealth(data);
    assert.strictEqual(health.percent, 43);
  });

  it('returns 0% for missing data', () => {
    const health = computeContextHealth({ model: {}, context_window: {} });
    assert.strictEqual(health.percent, 0);
    assert.strictEqual(health.windowSize, 0);
  });
});
