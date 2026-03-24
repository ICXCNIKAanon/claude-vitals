import { describe, it } from 'node:test';
import assert from 'node:assert';
import { c, stripAnsi, visibleLength } from '../src/render/color.ts';

describe('color', () => {
  it('wraps text with named color', () => {
    const result = c('green', 'hello');
    assert.ok(result.includes('hello'));
    assert.ok(result.includes('\x1b['));
    assert.ok(result.endsWith('\x1b[0m'));
  });

  it('supports bold', () => {
    const result = c('red', 'warn', { bold: true });
    assert.ok(result.includes('\x1b[1m'));
  });

  it('supports dim', () => {
    const result = c('gray', 'muted', { dim: true });
    assert.ok(result.includes('\x1b[2m'));
  });

  it('handles hex colors', () => {
    const result = c('#ff0000', 'red');
    assert.ok(result.includes('\x1b[38;2;'));
  });

  it('handles 256-color index', () => {
    const result = c('196', 'red');
    assert.ok(result.includes('\x1b[38;5;196m'));
  });
});

describe('stripAnsi', () => {
  it('removes ANSI escape codes', () => {
    const colored = c('green', 'hello');
    assert.strictEqual(stripAnsi(colored), 'hello');
  });

  it('returns plain text unchanged', () => {
    assert.strictEqual(stripAnsi('hello'), 'hello');
  });
});

describe('visibleLength', () => {
  it('calculates visible length ignoring ANSI', () => {
    const colored = c('green', 'hello');
    assert.strictEqual(visibleLength(colored), 5);
  });

  it('counts CJK characters as double width', () => {
    assert.strictEqual(visibleLength('日本語'), 6);
  });

  it('counts emoji as double width', () => {
    assert.strictEqual(visibleLength('🚀'), 2);
  });
});
