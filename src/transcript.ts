import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { TranscriptState, TranscriptCache, ToolEntry, AgentEntry, TodoEntry } from './types.ts';

const MAX_TOOLS = 20;
const MAX_AGENTS = 10;

// Simple non-cryptographic hash for stable cache file naming
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function getCacheDir(): string {
  return path.join(os.homedir(), '.claude', 'plugins', 'claude-vitals', 'cache');
}

function getCachePath(transcriptPath: string): string {
  const hash = fnv1a(transcriptPath);
  return path.join(getCacheDir(), `transcript-${hash}.json`);
}

function readCache(transcriptPath: string): TranscriptCache | null {
  try {
    const raw = fs.readFileSync(getCachePath(transcriptPath), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(transcriptPath: string, cache: TranscriptCache): void {
  try {
    const cacheDir = getCacheDir();
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(getCachePath(transcriptPath), JSON.stringify(cache));
  } catch {}
}

type ToolInput = { [key: string]: unknown };

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function extractToolTarget(name: string, input: ToolInput): string {
  if (['Read', 'Write', 'Edit'].includes(name)) return str(input.file_path);
  if (['Glob', 'Grep'].includes(name)) return str(input.pattern);
  if (name === 'Bash') return str(input.command);
  if (name === 'WebFetch') return str(input.url);
  if (name === 'WebSearch') return str(input.query);
  return '';
}

export function parseTranscriptLines(lines: string[]): TranscriptState {
  const toolMap = new Map<string, ToolEntry>();
  const agentMap = new Map<string, AgentEntry>();
  let todos: TodoEntry[] = [];
  let sessionStart: number | undefined;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (!entry || typeof entry !== 'object') continue;

      if (entry.timestamp && sessionStart === undefined) {
        sessionStart = entry.timestamp;
      }

      const contents = entry.message?.content;
      if (!Array.isArray(contents)) continue;

      for (const block of contents) {
        if (block.type === 'tool_use') {
          const { id, name, input } = block;
          if (!id || !name) continue;

          if (name === 'TodoWrite' && input?.todos) {
            todos = input.todos.map((t: any) => ({
              id: t.id ?? '',
              content: t.content ?? '',
              status: t.status ?? 'pending',
            }));
            continue;
          }

          if (name === 'TaskCreate' && input) {
            todos.push({
              id: id,
              content: input.subject ?? input.description ?? '',
              status: 'pending',
            });
            continue;
          }

          if (name === 'TaskUpdate' && input?.taskId) {
            const existing = todos.find(t => t.id === input.taskId);
            if (existing && input.status) {
              existing.status = input.status;
            }
            continue;
          }

          if (name === 'Agent') {
            agentMap.set(id, {
              id,
              type: input?.subagent_type ?? 'general',
              model: input?.model,
              description: input?.description ?? '',
              status: 'running',
              startTime: entry.timestamp ?? Date.now(),
            });
            continue;
          }

          toolMap.set(id, {
            id,
            name,
            target: extractToolTarget(name, input ?? {}),
            status: 'running',
            startTime: entry.timestamp ?? Date.now(),
          });
        }

        if (block.type === 'tool_result') {
          const toolId = block.tool_use_id;
          if (!toolId) continue;

          const tool = toolMap.get(toolId);
          if (tool) {
            tool.status = block.is_error ? 'error' : 'completed';
            tool.endTime = entry.timestamp ?? Date.now();
          }

          const agent = agentMap.get(toolId);
          if (agent) {
            agent.status = 'completed';
          }
        }
      }
    } catch {
      continue;
    }
  }

  const tools = [...toolMap.values()].slice(-MAX_TOOLS);
  const agents = [...agentMap.values()].slice(-MAX_AGENTS);

  return { tools, agents, todos, sessionStart };
}

export function parseTranscript(transcriptPath: string): TranscriptState {
  const emptyState: TranscriptState = { tools: [], agents: [], todos: [] };

  try {
    const stat = fs.statSync(transcriptPath);
    const cache = readCache(transcriptPath);
    if (cache && cache.mtime === stat.mtimeMs && cache.size === stat.size) {
      return cache.state;
    }

    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const state = parseTranscriptLines(lines);

    writeCache(transcriptPath, { mtime: stat.mtimeMs, size: stat.size, state });
    return state;
  } catch {
    return emptyState;
  }
}
