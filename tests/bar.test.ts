import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderBar, getAdaptiveBarWidth } from '../src/render/bar.ts';
import { stripAnsi } from '../src/render/color.ts';

describe('renderBar', () => {
  it('renders a bar at 0%', () => {
    const bar = renderBar(0, 20, 'green', 'red');
    const plain = stripAnsi(bar);
    assert.strictEqual(plain, '░░░░░░░░░░░░░░░░░░░░');
  });

  it('renders a bar at 100%', () => {
    const bar = renderBar(100, 20, 'green', 'red');
    const plain = stripAnsi(bar);
    assert.strictEqual(plain, '████████████████████');
  });

  it('renders a bar at 50%', () => {
    const bar = renderBar(50, 20, 'green', 'red');
    const plain = stripAnsi(bar);
    assert.strictEqual(plain.length, 20);
    assert.ok(plain.includes('█'));
    assert.ok(plain.includes('░'));
  });

  it('clamps percent to 0-100', () => {
    const bar = renderBar(150, 10, 'green', 'red');
    const plain = stripAnsi(bar);
    assert.strictEqual(plain, '██████████');
  });
});

describe('getAdaptiveBarWidth', () => {
  it('returns 20 for wide terminals', () => {
    assert.strictEqual(getAdaptiveBarWidth(200), 20);
  });

  it('returns 10 for narrow terminals', () => {
    assert.strictEqual(getAdaptiveBarWidth(60), 10);
  });

  it('scales linearly between 10 and 20', () => {
    const width = getAdaptiveBarWidth(120);
    assert.ok(width >= 10 && width <= 20);
  });
});
