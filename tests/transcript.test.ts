import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseTranscriptLines, extractToolTarget } from '../src/transcript.ts';

const makeToolUse = (id: string, name: string, input: Record<string, any> = {}) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: Date.now(),
    message: { content: [{ type: 'tool_use', id, name, input }] },
  });

const makeToolResult = (id: string, isError = false) =>
  JSON.stringify({
    type: 'tool_result',
    timestamp: Date.now(),
    message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError }] },
  });

const makeTodoWrite = () =>
  JSON.stringify({
    type: 'assistant',
    timestamp: Date.now(),
    message: {
      content: [{
        type: 'tool_use', id: 'todo1', name: 'TodoWrite',
        input: { todos: [
          { id: '1', content: 'Fix bug', status: 'completed' },
          { id: '2', content: 'Write tests', status: 'in_progress' },
          { id: '3', content: 'Deploy', status: 'pending' },
        ]},
      }],
    },
  });

const makeAgent = (id: string, desc: string) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: Date.now(),
    message: {
      content: [{
        type: 'tool_use', id, name: 'Agent',
        input: { subagent_type: 'Explore', model: 'haiku', description: desc },
      }],
    },
  });

describe('parseTranscriptLines', () => {
  it('parses tool_use and tool_result into completed tool', () => {
    const lines = [
      makeToolUse('t1', 'Read', { file_path: '/src/index.ts' }),
      makeToolResult('t1'),
    ];
    const state = parseTranscriptLines(lines);
    assert.strictEqual(state.tools.length, 1);
    assert.strictEqual(state.tools[0].name, 'Read');
    assert.strictEqual(state.tools[0].status, 'completed');
    assert.strictEqual(state.tools[0].target, '/src/index.ts');
  });

  it('marks tool as running when no result yet', () => {
    const lines = [makeToolUse('t1', 'Edit', { file_path: '/a.ts' })];
    const state = parseTranscriptLines(lines);
    assert.strictEqual(state.tools[0].status, 'running');
  });

  it('marks tool as error', () => {
    const lines = [makeToolUse('t1', 'Bash', { command: 'npm test' }), makeToolResult('t1', true)];
    const state = parseTranscriptLines(lines);
    assert.strictEqual(state.tools[0].status, 'error');
  });

  it('parses todos from TodoWrite', () => {
    const lines = [makeTodoWrite()];
    const state = parseTranscriptLines(lines);
    assert.strictEqual(state.todos.length, 3);
    assert.strictEqual(state.todos[0].status, 'completed');
  });

  it('parses agents', () => {
    const lines = [makeAgent('a1', 'Finding auth code')];
    const state = parseTranscriptLines(lines);
    assert.strictEqual(state.agents.length, 1);
    assert.strictEqual(state.agents[0].type, 'Explore');
    assert.strictEqual(state.agents[0].status, 'running');
  });

  it('keeps max 20 tools', () => {
    const lines: string[] = [];
    for (let i = 0; i < 25; i++) {
      lines.push(makeToolUse(`t${i}`, 'Read', { file_path: `/f${i}.ts` }));
      lines.push(makeToolResult(`t${i}`));
    }
    const state = parseTranscriptLines(lines);
    assert.strictEqual(state.tools.length, 20);
  });

  it('skips malformed lines', () => {
    const lines = ['not json', '{}', makeToolUse('t1', 'Read', { file_path: '/a.ts' })];
    const state = parseTranscriptLines(lines);
    assert.strictEqual(state.tools.length, 1);
  });

  it('extracts session start from first timestamp', () => {
    const ts = Date.now() - 60000;
    const line = JSON.stringify({ type: 'assistant', timestamp: ts, message: { content: [] } });
    const state = parseTranscriptLines([line]);
    assert.strictEqual(state.sessionStart, ts);
  });
});

describe('extractToolTarget', () => {
  it('extracts file_path for Read/Write/Edit', () => {
    assert.strictEqual(extractToolTarget('Read', { file_path: '/src/a.ts' }), '/src/a.ts');
  });

  it('extracts pattern for Glob/Grep', () => {
    assert.strictEqual(extractToolTarget('Grep', { pattern: 'TODO' }), 'TODO');
  });

  it('extracts command snippet for Bash', () => {
    assert.strictEqual(extractToolTarget('Bash', { command: 'npm run build && npm test' }), 'npm run build && npm test');
  });

  it('returns empty for unknown tools', () => {
    assert.strictEqual(extractToolTarget('Unknown', {}), '');
  });
});
