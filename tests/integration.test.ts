import { describe, it } from 'node:test';
import assert from 'node:assert';
import { main } from '../src/index.ts';
import { stripAnsi } from '../src/render/color.ts';

const SAMPLE_STDIN = JSON.stringify({
  model: { id: 'claude-opus-4-6', display_name: 'Opus 4.6' },
  context_window: {
    context_window_size: 200000,
    current_usage: {
      input_tokens: 50000, output_tokens: 10000,
      cache_creation_input_tokens: 5000, cache_read_input_tokens: 20000,
    },
    used_percentage: 42,
  },
  cwd: '/Users/test/myproject',
});

describe('main', () => {
  it('returns rendered output for valid stdin', async () => {
    const output = await main(SAMPLE_STDIN, 120);
    assert.ok(output.length > 0);
    const plain = stripAnsi(output);
    assert.ok(plain.includes('Opus 4.6'));
    assert.ok(plain.includes('42%'));
  });

  it('returns fallback for empty stdin', async () => {
    const output = await main('', 120);
    assert.ok(output.length > 0);
  });

  it('returns fallback for garbage stdin', async () => {
    const output = await main('{{{not json', 120);
    assert.ok(output.length > 0);
  });
});
