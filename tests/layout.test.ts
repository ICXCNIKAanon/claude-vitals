import { describe, it } from 'node:test';
import assert from 'node:assert';
import { render, detectLayoutMode } from '../src/render/index.ts';
import { stripAnsi } from '../src/render/color.ts';
import { DEFAULT_CONFIG } from '../src/config.ts';
import type { RenderContext } from '../src/types.ts';

function makeCtx(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    stdin: { model: { display_name: 'Opus 4.6' }, context_window: {} },
    context: {
      percent: 42, model: 'Opus 4.6', windowSize: 200000,
      inputTokens: 50000, outputTokens: 10000,
      cacheCreationTokens: 5000, cacheReadTokens: 20000, totalTokens: 85000,
    },
    transcript: { tools: [], agents: [], todos: [] },
    git: { branch: 'main', dirty: false, added: 0, modified: 0, deleted: 0, untracked: 0, ahead: 0, behind: 0 },
    config: DEFAULT_CONFIG,
    cost: 0.47,
    sessionDuration: 754,
    terminalWidth: 120,
    layoutMode: 'expanded',
    ...overrides,
  };
}

describe('detectLayoutMode', () => {
  it('returns expanded for wide terminals', () => {
    assert.strictEqual(detectLayoutMode(120, 'auto'), 'expanded');
  });

  it('returns compact for medium terminals', () => {
    assert.strictEqual(detectLayoutMode(80, 'auto'), 'compact');
  });

  it('returns minimal for narrow terminals', () => {
    assert.strictEqual(detectLayoutMode(50, 'auto'), 'minimal');
  });

  it('respects manual override', () => {
    assert.strictEqual(detectLayoutMode(200, 'compact'), 'compact');
  });
});

describe('render', () => {
  it('returns non-empty output in expanded mode', () => {
    const output = render(makeCtx());
    assert.ok(output.length > 0);
  });

  it('always includes identity and context lines', () => {
    const output = render(makeCtx());
    const lines = output.split('\n').filter(Boolean);
    assert.ok(lines.length >= 2);
    const plain = lines.map(stripAnsi);
    assert.ok(plain[0].includes('Opus 4.6'));
    assert.ok(plain[1].includes('42%'));
  });

  it('omits tools line when no tools', () => {
    const output = render(makeCtx());
    const plain = stripAnsi(output);
    assert.ok(!plain.includes('\u25D0'));
    assert.ok(!plain.includes('\u2713'));
  });

  it('renders minimal mode as single line', () => {
    const ctx = makeCtx({ layoutMode: 'minimal', terminalWidth: 50 });
    const output = render(ctx);
    const lines = output.split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 1);
  });
});
