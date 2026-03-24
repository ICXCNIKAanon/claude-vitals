import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseGitStatus, parseAheadBehind } from '../src/git.ts';

describe('parseGitStatus', () => {
  it('parses clean status', () => {
    const result = parseGitStatus('');
    assert.strictEqual(result.dirty, false);
    assert.strictEqual(result.modified, 0);
    assert.strictEqual(result.added, 0);
  });

  it('parses modified files', () => {
    const result = parseGitStatus(' M src/index.ts\n M src/config.ts\n');
    assert.strictEqual(result.dirty, true);
    assert.strictEqual(result.modified, 2);
  });

  it('parses mixed status', () => {
    const result = parseGitStatus('A  new.ts\n M mod.ts\n D del.ts\n?? untracked.ts\n');
    assert.strictEqual(result.added, 1);
    assert.strictEqual(result.modified, 1);
    assert.strictEqual(result.deleted, 1);
    assert.strictEqual(result.untracked, 1);
  });
});

describe('parseAheadBehind', () => {
  it('parses ahead/behind counts', () => {
    // git rev-list --left-right --count @{upstream}...HEAD
    // outputs: <behind>\t<ahead>
    const { ahead, behind } = parseAheadBehind('3\t1\n');
    assert.strictEqual(behind, 3);
    assert.strictEqual(ahead, 1);
  });

  it('returns 0 for empty', () => {
    const { ahead, behind } = parseAheadBehind('');
    assert.strictEqual(ahead, 0);
    assert.strictEqual(behind, 0);
  });
});
