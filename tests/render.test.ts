import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  renderIdentityLine,
  renderContextLine,
  renderToolsLine,
  renderAgentsLine,
  renderTodosLine,
} from '../src/render/elements.ts';
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
    git: { branch: 'main', dirty: true, added: 1, modified: 2, deleted: 0, untracked: 0, ahead: 0, behind: 0 },
    config: DEFAULT_CONFIG,
    cost: 0.47,
    sessionDuration: 754,
    terminalWidth: 120,
    layoutMode: 'expanded',
    ...overrides,
  };
}

describe('renderIdentityLine', () => {
  it('includes model name', () => {
    const line = renderIdentityLine(makeCtx());
    assert.ok(stripAnsi(line).includes('Opus 4.6'));
  });

  it('includes git branch', () => {
    const line = renderIdentityLine(makeCtx());
    assert.ok(stripAnsi(line).includes('main'));
  });

  it('includes duration', () => {
    const line = renderIdentityLine(makeCtx());
    assert.ok(stripAnsi(line).includes('12m'));
  });

  it('hides git when null', () => {
    const line = renderIdentityLine(makeCtx({ git: null }));
    assert.ok(!stripAnsi(line).includes('main'));
  });
});

describe('renderContextLine', () => {
  it('includes percent', () => {
    const line = renderContextLine(makeCtx());
    assert.ok(stripAnsi(line).includes('42%'));
  });

  it('includes cost when > $0.01', () => {
    const line = renderContextLine(makeCtx({ cost: 0.47 }));
    assert.ok(stripAnsi(line).includes('$0.47'));
  });

  it('hides cost when < $0.01', () => {
    const line = renderContextLine(makeCtx({ cost: 0.005 }));
    assert.ok(!stripAnsi(line).includes('$'));
  });

  it('shows AUTOCOMPACT SOON at 90%+', () => {
    const ctx = makeCtx();
    ctx.context.percent = 92;
    const line = renderContextLine(ctx);
    assert.ok(stripAnsi(line).includes('AUTOCOMPACT'));
  });
});

describe('renderToolsLine', () => {
  it('returns empty when no tools', () => {
    const line = renderToolsLine(makeCtx());
    assert.strictEqual(line, '');
  });

  it('aggregates completed tools by name', () => {
    const ctx = makeCtx({
      transcript: {
        tools: [
          { id: '1', name: 'Read', target: '/a.ts', status: 'completed', startTime: 0 },
          { id: '2', name: 'Read', target: '/b.ts', status: 'completed', startTime: 0 },
          { id: '3', name: 'Edit', target: '/c.ts', status: 'running', startTime: 0 },
        ],
        agents: [], todos: [],
      },
    });
    const line = renderToolsLine(ctx);
    const plain = stripAnsi(line);
    assert.ok(plain.includes('Read'));
    assert.ok(plain.includes('2'));
    assert.ok(plain.includes('Edit'));
  });
});

describe('renderAgentsLine', () => {
  it('returns empty when no agents', () => {
    assert.strictEqual(renderAgentsLine(makeCtx()), '');
  });

  it('shows running agent', () => {
    const ctx = makeCtx({
      transcript: {
        tools: [], todos: [],
        agents: [{
          id: 'a1', type: 'Explore', model: 'haiku',
          description: 'Finding auth code', status: 'running', startTime: Date.now() - 135000,
        }],
      },
    });
    const line = renderAgentsLine(ctx);
    const plain = stripAnsi(line);
    assert.ok(plain.includes('Explore'));
    assert.ok(plain.includes('Finding auth code'));
  });
});

describe('renderTodosLine', () => {
  it('returns empty when no todos', () => {
    assert.strictEqual(renderTodosLine(makeCtx()), '');
  });

  it('shows progress', () => {
    const ctx = makeCtx({
      transcript: {
        tools: [], agents: [],
        todos: [
          { id: '1', content: 'Fix bug', status: 'completed' },
          { id: '2', content: 'Write tests', status: 'in_progress' },
          { id: '3', content: 'Deploy', status: 'pending' },
        ],
      },
    });
    const line = renderTodosLine(ctx);
    const plain = stripAnsi(line);
    assert.ok(plain.includes('1/3') || plain.includes('1 / 3'));
  });
});
