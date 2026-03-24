# claude-vitals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code statusline plugin that displays real-time session vitals with adaptive layout, reactive sections, and cost estimation.

**Architecture:** Short-lived TypeScript subprocess invoked every ~300ms. Receives JSON stdin from Claude Code, parses session transcript for tool/agent/todo state, renders ANSI-styled lines to stdout. Disk-cached transcript state for cross-cycle persistence. Zero npm dependencies.

**Tech Stack:** TypeScript (ES2022, NodeNext), Node.js 22+ (LTS), Node.js native test runner with `--experimental-strip-types`

---

## File Map

| File | Responsibility |
|---|---|
| `src/types.ts` | All TypeScript interfaces |
| `src/render/color.ts` | ANSI escape codes, named/hex/256 color parsing |
| `src/render/bar.ts` | Progress bar rendering with adaptive width |
| `src/stdin.ts` | Parse Claude Code JSON input, compute context %, token math |
| `src/config.ts` | Load/validate config from disk, merge with defaults |
| `src/cost.ts` | Token cost estimation by model |
| `src/git.ts` | Branch, dirty state, ahead/behind via execFile |
| `src/system.ts` | RAM usage, session duration |
| `src/transcript.ts` | Parse JSONL transcript, extract tools/agents/todos, disk cache |
| `src/render/elements.ts` | Individual HUD elements (identity, context, tools, agents, todos) |
| `src/render/index.ts` | Layout engine — adaptive expanded/compact/minimal |
| `src/index.ts` | Entry point — read stdin, orchestrate all modules, output |

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "claude-vitals",
  "version": "0.1.0",
  "description": "Claude Code statusline plugin — real-time session vitals",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "node --test tests/**/*.test.ts --experimental-strip-types",
    "test:coverage": "c8 node --test tests/**/*.test.ts --experimental-strip-types"
  },
  "keywords": ["claude-code", "statusline", "plugin"],
  "author": "ICXCNIKAanon",
  "license": "MIT",
  "devDependencies": {
    "typescript": "^5.7.0",
    "c8": "^10.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": false,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
*.tgz
.DS_Store
```

- [ ] **Step 4: Install dev dependencies and verify build**

Run: `cd ~/claude-vitals && npm install`
Expected: node_modules created, package-lock.json generated

Run: `mkdir -p src && echo 'console.log("vitals")' > src/index.ts && npm run build`
Expected: `dist/index.js` created

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore src/index.ts
git commit -m "feat: project scaffolding with TypeScript build"
```

---

### Task 2: Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write types.ts**

```typescript
// === Stdin from Claude Code ===

export interface StdinData {
  model: {
    id?: string;
    display_name?: string;
  };
  context_window: {
    context_window_size?: number;
    current_usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    used_percentage?: number;
    remaining_percentage?: number;
  };
  rate_limits?: {
    five_hour?: { used_percentage?: number; resets_at?: number };
    seven_day?: { used_percentage?: number; resets_at?: number };
  };
  transcript_path?: string;
  cwd?: string;
}

// === Parsed context state ===

export interface ContextHealth {
  percent: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  windowSize: number;
  model: string;
}

// === Transcript parsed state ===

export interface ToolEntry {
  id: string;
  name: string;
  target: string;
  status: 'running' | 'completed' | 'error';
  startTime: number;
  endTime?: number;
}

export interface AgentEntry {
  id: string;
  type: string;
  model?: string;
  description: string;
  status: 'running' | 'completed';
  startTime: number;
}

export interface TodoEntry {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface TranscriptState {
  tools: ToolEntry[];
  agents: AgentEntry[];
  todos: TodoEntry[];
  sessionStart?: number;
  sessionTitle?: string;
}

export interface TranscriptCache {
  mtime: number;
  size: number;
  state: TranscriptState;
}

// === Config ===

export type ColorValue = string; // 'green' | '#rrggbb' | '0-255'

export interface VitalsConfig {
  layout: 'expanded' | 'compact' | 'minimal' | 'auto';
  show: {
    contextBar: boolean;
    cost: boolean;
    git: boolean;
    tools: boolean;
    agents: boolean;
    todos: boolean;
    memory: boolean;
    speed: boolean;
    duration: boolean;
  };
  contextValue: 'percent' | 'tokens' | 'both';
  thresholds: {
    contextWarn: number;
    contextDanger: number;
    sevenDayShow: number;
  };
  colors: {
    healthy: ColorValue;
    warning: ColorValue;
    danger: ColorValue;
    accent: ColorValue;
    muted: ColorValue;
  };
  git: {
    showDirty: boolean;
    showAheadBehind: boolean;
    showFileStats: boolean;
  };
}

// === Git state ===

export interface GitState {
  branch: string;
  dirty: boolean;
  added: number;
  modified: number;
  deleted: number;
  untracked: number;
  ahead: number;
  behind: number;
}

// === Render output ===

export type LayoutMode = 'expanded' | 'compact' | 'minimal';

export interface RenderContext {
  stdin: StdinData;
  context: ContextHealth;
  transcript: TranscriptState;
  git: GitState | null;
  config: VitalsConfig;
  cost: number;
  sessionDuration: number;
  terminalWidth: number;
  layoutMode: LayoutMode;
  memoryUsage?: { used: number; total: number };
  speed?: number;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd ~/claude-vitals && npm run build`
Expected: Clean compilation, `dist/types.js` and `dist/types.d.ts` created

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add TypeScript interfaces for all data models"
```

---

### Task 3: ANSI Color Helpers

**Files:**
- Create: `src/render/color.ts`
- Create: `tests/color.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { c, stripAnsi, visibleLength } from '../src/render/color.js';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/claude-vitals && npm test 2>&1 | head -20`
Expected: FAIL — module not found

- [ ] **Step 3: Implement color.ts**

```typescript
const NAMED_COLORS: Record<string, string> = {
  black: '30', red: '31', green: '32', yellow: '33',
  blue: '34', magenta: '35', cyan: '36', white: '37',
  gray: '90', grey: '90',
};

interface ColorOpts {
  bold?: boolean;
  dim?: boolean;
}

export function c(color: string, text: string, opts?: ColorOpts): string {
  let prefix = '';
  if (opts?.bold) prefix += '\x1b[1m';
  if (opts?.dim) prefix += '\x1b[2m';

  let colorCode: string;

  if (NAMED_COLORS[color]) {
    colorCode = `\x1b[${NAMED_COLORS[color]}m`;
  } else if (color.startsWith('#') && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    colorCode = `\x1b[38;2;${r};${g};${b}m`;
  } else if (/^\d+$/.test(color) && parseInt(color) <= 255) {
    colorCode = `\x1b[38;5;${color}m`;
  } else {
    colorCode = '';
  }

  return `${prefix}${colorCode}${text}\x1b[0m`;
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

export function visibleLength(text: string): number {
  const plain = stripAnsi(text);
  let len = 0;
  for (const ch of plain) {
    const code = ch.codePointAt(0)!;
    if (isDoubleWidth(code)) {
      len += 2;
    } else {
      len += 1;
    }
  }
  return len;
}

function isDoubleWidth(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x2fa1f)
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/claude-vitals && npm test 2>&1`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/render/color.ts tests/color.test.ts
git commit -m "feat: ANSI color helpers with named/hex/256 support and width calculation"
```

---

### Task 4: Progress Bar Rendering

**Files:**
- Create: `src/render/bar.ts`
- Create: `tests/bar.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderBar, getAdaptiveBarWidth } from '../src/render/bar.js';
import { stripAnsi } from '../src/render/color.js';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/claude-vitals && npm test 2>&1 | head -10`
Expected: FAIL

- [ ] **Step 3: Implement bar.ts**

```typescript
import { c } from './color.js';

export function renderBar(
  percent: number,
  width: number,
  fillColor: string,
  emptyColor: string
): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;

  const fillStr = '█'.repeat(filled);
  const emptyStr = '░'.repeat(empty);

  return c(fillColor, fillStr) + c(emptyColor, emptyStr, { dim: true });
}

export function getAdaptiveBarWidth(terminalWidth: number): number {
  const minBar = 10;
  const maxBar = 20;
  const minTerm = 80;
  const maxTerm = 160;

  if (terminalWidth >= maxTerm) return maxBar;
  if (terminalWidth <= minTerm) return minBar;

  const ratio = (terminalWidth - minTerm) / (maxTerm - minTerm);
  return Math.round(minBar + ratio * (maxBar - minBar));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/claude-vitals && npm test 2>&1`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/render/bar.ts tests/bar.test.ts
git commit -m "feat: adaptive progress bar rendering"
```

---

### Task 5: Stdin Parser

**Files:**
- Create: `src/stdin.ts`
- Create: `tests/stdin.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseStdin, computeContextHealth } from '../src/stdin.js';

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
    // (50000 + 10000 + 5000 + 20000) / 200000 = 42.5 → 43
    assert.strictEqual(health.percent, 43);
  });

  it('returns 0% for missing data', () => {
    const health = computeContextHealth({ model: {}, context_window: {} });
    assert.strictEqual(health.percent, 0);
    assert.strictEqual(health.windowSize, 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/claude-vitals && npm test 2>&1 | head -10`
Expected: FAIL

- [ ] **Step 3: Implement stdin.ts**

```typescript
import type { StdinData, ContextHealth } from './types.js';

export function parseStdin(raw: string): StdinData {
  try {
    const data = JSON.parse(raw);
    return {
      model: data.model ?? {},
      context_window: data.context_window ?? {},
      rate_limits: data.rate_limits,
      transcript_path: data.transcript_path,
      cwd: data.cwd,
    };
  } catch {
    return { model: {}, context_window: {} };
  }
}

export function computeContextHealth(data: StdinData): ContextHealth {
  const cw = data.context_window;
  const usage = cw.current_usage;

  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const cacheCreationTokens = usage?.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = usage?.cache_read_input_tokens ?? 0;
  const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;
  const windowSize = cw.context_window_size ?? 0;

  let percent: number;
  if (cw.used_percentage != null) {
    percent = Math.round(cw.used_percentage);
  } else if (windowSize > 0) {
    percent = Math.round((totalTokens / windowSize) * 100);
  } else {
    percent = 0;
  }

  const model = data.model.display_name ?? data.model.id ?? 'Unknown';

  return {
    percent,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    totalTokens,
    windowSize,
    model,
  };
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/claude-vitals && npm test 2>&1`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/stdin.ts tests/stdin.test.ts
git commit -m "feat: stdin parser with context health computation"
```

---

### Task 6: Config System

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { loadConfig, DEFAULT_CONFIG, mergeConfig } from '../src/config.js';

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
    assert.strictEqual(merged.show.tools, true); // unchanged
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/claude-vitals && npm test 2>&1 | head -10`
Expected: FAIL

- [ ] **Step 3: Implement config.ts**

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { VitalsConfig } from './types.js';

export const DEFAULT_CONFIG: VitalsConfig = {
  layout: 'auto',
  show: {
    contextBar: true,
    cost: true,
    git: true,
    tools: true,
    agents: true,
    todos: true,
    memory: true,
    speed: true,
    duration: true,
  },
  contextValue: 'both',
  thresholds: {
    contextWarn: 70,
    contextDanger: 85,
    sevenDayShow: 80,
  },
  colors: {
    healthy: 'green',
    warning: 'yellow',
    danger: 'red',
    accent: 'cyan',
    muted: 'gray',
  },
  git: {
    showDirty: true,
    showAheadBehind: true,
    showFileStats: true,
  },
};

const VALID_LAYOUTS = ['expanded', 'compact', 'minimal', 'auto'] as const;

export function mergeConfig(partial: Record<string, any>): VitalsConfig {
  const config = structuredClone(DEFAULT_CONFIG);

  if (partial.layout && VALID_LAYOUTS.includes(partial.layout)) {
    config.layout = partial.layout;
  }

  if (partial.show && typeof partial.show === 'object') {
    for (const key of Object.keys(config.show) as (keyof VitalsConfig['show'])[]) {
      if (typeof partial.show[key] === 'boolean') {
        config.show[key] = partial.show[key];
      }
    }
  }

  if (partial.contextValue && ['percent', 'tokens', 'both'].includes(partial.contextValue)) {
    config.contextValue = partial.contextValue;
  }

  if (partial.thresholds && typeof partial.thresholds === 'object') {
    for (const key of Object.keys(config.thresholds) as (keyof VitalsConfig['thresholds'])[]) {
      if (typeof partial.thresholds[key] === 'number') {
        config.thresholds[key] = partial.thresholds[key];
      }
    }
  }

  if (partial.colors && typeof partial.colors === 'object') {
    for (const key of Object.keys(config.colors) as (keyof VitalsConfig['colors'])[]) {
      if (typeof partial.colors[key] === 'string') {
        config.colors[key] = partial.colors[key];
      }
    }
  }

  if (partial.git && typeof partial.git === 'object') {
    for (const key of Object.keys(config.git) as (keyof VitalsConfig['git'])[]) {
      if (typeof partial.git[key] === 'boolean') {
        config.git[key] = partial.git[key];
      }
    }
  }

  return config;
}

let cachedMtime = 0;
let cachedConfig: VitalsConfig = DEFAULT_CONFIG;

export function loadConfig(): VitalsConfig {
  const configPath = path.join(
    os.homedir(), '.claude', 'plugins', 'claude-vitals', 'config.json'
  );

  try {
    const stat = fs.statSync(configPath);
    if (stat.mtimeMs === cachedMtime) return cachedConfig;

    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    cachedMtime = stat.mtimeMs;
    cachedConfig = mergeConfig(parsed);
    return cachedConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/claude-vitals && npm test 2>&1`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: config system with smart defaults and deep merge"
```

---

### Task 7: Cost Estimation

**Files:**
- Create: `src/cost.ts`
- Create: `tests/cost.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { estimateCost } from '../src/cost.js';
import type { ContextHealth } from '../src/types.js';

describe('estimateCost', () => {
  it('calculates cost for Opus', () => {
    const health: ContextHealth = {
      percent: 50, model: 'Opus 4.6', windowSize: 200000,
      inputTokens: 50000, outputTokens: 10000,
      cacheCreationTokens: 5000, cacheReadTokens: 20000, totalTokens: 85000,
    };
    const cost = estimateCost(health);
    // input: 50000 * 15/1M = 0.75
    // output: 10000 * 75/1M = 0.75
    // cache_create: 5000 * 18.75/1M = 0.09375
    // cache_read: 20000 * 1.5/1M = 0.03
    // total: ~1.62
    assert.ok(cost > 1.5 && cost < 1.7, `Expected ~1.62, got ${cost}`);
  });

  it('calculates cost for Sonnet', () => {
    const health: ContextHealth = {
      percent: 50, model: 'Sonnet 4.6', windowSize: 200000,
      inputTokens: 100000, outputTokens: 20000,
      cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 120000,
    };
    const cost = estimateCost(health);
    // input: 100000 * 3/1M = 0.30, output: 20000 * 15/1M = 0.30
    assert.ok(cost > 0.55 && cost < 0.65, `Expected ~0.60, got ${cost}`);
  });

  it('returns 0 for unknown model', () => {
    const health: ContextHealth = {
      percent: 0, model: 'Unknown', windowSize: 0,
      inputTokens: 0, outputTokens: 0,
      cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 0,
    };
    assert.strictEqual(estimateCost(health), 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/claude-vitals && npm test 2>&1 | head -10`
Expected: FAIL

- [ ] **Step 3: Implement cost.ts**

```typescript
import type { ContextHealth } from './types.js';

interface ModelPricing {
  input: number;   // per million tokens
  output: number;  // per million tokens
}

const PRICING: Record<string, ModelPricing> = {
  'opus':   { input: 15,   output: 75 },
  'sonnet': { input: 3,    output: 15 },
  'haiku':  { input: 0.80, output: 4 },
};

const CACHE_CREATE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.10;

function matchModel(model: string): ModelPricing | null {
  const lower = model.toLowerCase();
  for (const [key, pricing] of Object.entries(PRICING)) {
    if (lower.includes(key)) return pricing;
  }
  return null;
}

export function estimateCost(health: ContextHealth): number {
  const pricing = matchModel(health.model);
  if (!pricing) return 0;

  const perM = 1_000_000;
  const inputCost = (health.inputTokens / perM) * pricing.input;
  const outputCost = (health.outputTokens / perM) * pricing.output;
  const cacheCreateCost = (health.cacheCreationTokens / perM) * pricing.input * CACHE_CREATE_MULTIPLIER;
  const cacheReadCost = (health.cacheReadTokens / perM) * pricing.input * CACHE_READ_MULTIPLIER;

  return inputCost + outputCost + cacheCreateCost + cacheReadCost;
}

export function formatCost(cost: number): string {
  if (cost < 0.01) return '';
  if (cost < 1) return `~$${cost.toFixed(2)}`;
  return `~$${cost.toFixed(2)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/claude-vitals && npm test 2>&1`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/cost.ts tests/cost.test.ts
git commit -m "feat: token cost estimation by model with cache pricing"
```

---

### Task 8: Git Integration

**Files:**
- Create: `src/git.ts`
- Create: `tests/git.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseGitStatus, parseAheadBehind } from '../src/git.js';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/claude-vitals && npm test 2>&1 | head -10`
Expected: FAIL

- [ ] **Step 3: Implement git.ts**

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import type { GitState } from './types.js';

const exec = promisify(execFile);
const GIT_TIMEOUT = 1000;
const GIT_TTL_MS = 5000;

interface GitCache {
  timestamp: number;
  cwd: string;
  state: GitState;
}

function getCachePath(): string {
  return path.join(os.homedir(), '.claude', 'plugins', 'claude-vitals', 'cache', 'git.json');
}

function readGitCache(cwd: string): GitState | null {
  try {
    const raw = fs.readFileSync(getCachePath(), 'utf-8');
    const cache: GitCache = JSON.parse(raw);
    if (cache.cwd === cwd && Date.now() - cache.timestamp < GIT_TTL_MS) {
      return cache.state;
    }
  } catch {}
  return null;
}

function writeGitCache(cwd: string, state: GitState): void {
  try {
    const cachePath = getCachePath();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ timestamp: Date.now(), cwd, state }));
  } catch {}
}

export function parseGitStatus(output: string): {
  dirty: boolean; added: number; modified: number; deleted: number; untracked: number;
} {
  let added = 0, modified = 0, deleted = 0, untracked = 0;

  for (const line of output.split('\n')) {
    if (!line || line.length < 2) continue;
    const index = line[0];
    const working = line[1];

    if (line.startsWith('??')) { untracked++; continue; }
    if (index === 'A') added++;
    if (index === 'D' || working === 'D') deleted++;
    if (index === 'M' || working === 'M' || index === 'R' || index === 'C') modified++;
  }

  const dirty = added + modified + deleted + untracked > 0;
  return { dirty, added, modified, deleted, untracked };
}

export function parseAheadBehind(output: string): { ahead: number; behind: number } {
  const trimmed = output.trim();
  if (!trimmed) return { ahead: 0, behind: 0 };
  const parts = trimmed.split('\t');
  // git rev-list --left-right --count @{upstream}...HEAD
  // outputs: <behind>\t<ahead>
  return {
    behind: parseInt(parts[0]) || 0,
    ahead: parseInt(parts[1]) || 0,
  };
}

export async function getGitState(cwd: string): Promise<GitState | null> {
  const cached = readGitCache(cwd);
  if (cached) return cached;

  try {
    const opts = { cwd, timeout: GIT_TIMEOUT };

    const [branchResult, statusResult] = await Promise.all([
      exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], opts),
      exec('git', ['--no-optional-locks', 'status', '--porcelain'], opts),
    ]);

    const branch = branchResult.stdout.trim();
    const { dirty, added, modified, deleted, untracked } = parseGitStatus(statusResult.stdout);

    let ahead = 0, behind = 0;
    try {
      const abResult = await exec(
        'git', ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], opts
      );
      ({ ahead, behind } = parseAheadBehind(abResult.stdout));
    } catch {}

    const state: GitState = { branch, dirty, added, modified, deleted, untracked, ahead, behind };
    writeGitCache(cwd, state);
    return state;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/claude-vitals && npm test 2>&1`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/git.ts tests/git.test.ts
git commit -m "feat: git integration with status parsing and TTL cache"
```

---

### Task 9: System Info (Memory, Duration)

**Files:**
- Create: `src/system.ts`
- Create: `tests/system.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getMemoryUsage, formatDuration } from '../src/system.js';

describe('getMemoryUsage', () => {
  it('returns used and total in GB', () => {
    const mem = getMemoryUsage();
    assert.ok(mem.total > 0);
    assert.ok(mem.used >= 0);
    assert.ok(mem.used <= mem.total);
  });
});

describe('formatDuration', () => {
  it('formats seconds', () => {
    assert.strictEqual(formatDuration(45), '45s');
  });

  it('formats minutes and seconds', () => {
    assert.strictEqual(formatDuration(125), '2m 5s');
  });

  it('formats hours', () => {
    assert.strictEqual(formatDuration(3661), '1h 1m');
  });

  it('returns 0s for zero', () => {
    assert.strictEqual(formatDuration(0), '0s');
  });

  it('returns 0s for negative', () => {
    assert.strictEqual(formatDuration(-5), '0s');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/claude-vitals && npm test 2>&1 | head -10`
Expected: FAIL

- [ ] **Step 3: Implement system.ts**

```typescript
import * as os from 'node:os';

export function getMemoryUsage(): { used: number; total: number } {
  const total = os.totalmem() / (1024 ** 3);
  const free = os.freemem() / (1024 ** 3);
  const used = total - free;
  return {
    used: Math.round(used * 10) / 10,
    total: Math.round(total * 10) / 10,
  };
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return `${tokens}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/claude-vitals && npm test 2>&1`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/system.ts tests/system.test.ts
git commit -m "feat: system info helpers — memory, duration, token formatting"
```

---

### Task 10: Transcript Parser

**Files:**
- Create: `src/transcript.ts`
- Create: `tests/transcript.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseTranscriptLines, extractToolTarget } from '../src/transcript.js';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/claude-vitals && npm test 2>&1 | head -10`
Expected: FAIL

- [ ] **Step 3: Implement transcript.ts**

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import type { TranscriptState, TranscriptCache, ToolEntry, AgentEntry, TodoEntry } from './types.js';

const MAX_TOOLS = 20;
const MAX_AGENTS = 10;

function getCacheDir(): string {
  return path.join(os.homedir(), '.claude', 'plugins', 'claude-vitals', 'cache');
}

function getCachePath(transcriptPath: string): string {
  const hash = crypto.createHash('md5').update(transcriptPath).digest('hex');
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

export function extractToolTarget(name: string, input: Record<string, any>): string {
  if (['Read', 'Write', 'Edit'].includes(name)) return input.file_path ?? '';
  if (['Glob', 'Grep'].includes(name)) return input.pattern ?? '';
  if (name === 'Bash') return input.command ?? '';
  if (name === 'WebFetch') return input.url ?? '';
  if (name === 'WebSearch') return input.query ?? '';
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/claude-vitals && npm test 2>&1`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/transcript.ts tests/transcript.test.ts
git commit -m "feat: transcript JSONL parser with tool/agent/todo extraction and disk cache"
```

---

### Task 11: Render Elements

**Files:**
- Create: `src/render/elements.ts`
- Create: `tests/render.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  renderIdentityLine,
  renderContextLine,
  renderToolsLine,
  renderAgentsLine,
  renderTodosLine,
} from '../src/render/elements.js';
import { stripAnsi } from '../src/render/color.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import type { RenderContext } from '../src/types.js';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/claude-vitals && npm test 2>&1 | head -10`
Expected: FAIL

- [ ] **Step 3: Implement elements.ts**

```typescript
import { c, visibleLength } from './color.js';
import { renderBar, getAdaptiveBarWidth } from './bar.js';
import { formatDuration, formatTokens } from '../system.js';
import { formatCost } from '../cost.js';
import type { RenderContext, ToolEntry } from '../types.js';

export function renderIdentityLine(ctx: RenderContext): string {
  const parts: string[] = [];

  // Model badge
  parts.push(c(ctx.config.colors.accent, `[${ctx.context.model}]`, { bold: true }));

  // Project path
  if (ctx.stdin.cwd) {
    const home = process.env.HOME ?? '';
    let display = ctx.stdin.cwd;
    if (home && display.startsWith(home)) {
      display = '~' + display.slice(home.length);
    }
    // Show last 2 path segments
    const segments = display.split('/');
    if (segments.length > 2) {
      display = segments.slice(-2).join('/');
    }
    parts.push(c(ctx.config.colors.muted, display));
  }

  // Git
  if (ctx.git && ctx.config.show.git) {
    let gitStr = c('magenta', ctx.git.branch);

    if (ctx.config.git.showDirty && ctx.git.dirty) {
      gitStr += c(ctx.config.colors.warning, ' \u2731');
    }

    if (ctx.config.git.showFileStats && ctx.git.dirty) {
      const stats: string[] = [];
      if (ctx.git.added > 0) stats.push(c('green', `+${ctx.git.added}`));
      if (ctx.git.modified > 0) stats.push(c('yellow', `~${ctx.git.modified}`));
      if (ctx.git.deleted > 0) stats.push(c('red', `-${ctx.git.deleted}`));
      if (stats.length) gitStr += ' ' + stats.join(' ');
    }

    if (ctx.config.git.showAheadBehind) {
      if (ctx.git.ahead > 0) gitStr += c('green', ` \u2191${ctx.git.ahead}`);
      if (ctx.git.behind > 0) gitStr += c('red', ` \u2193${ctx.git.behind}`);
    }

    parts.push(gitStr);
  }

  // Duration
  if (ctx.config.show.duration && ctx.sessionDuration > 0) {
    parts.push(c(ctx.config.colors.muted, `\u23F1 ${formatDuration(ctx.sessionDuration)}`));
  }

  return parts.join('  ');
}

export function renderContextLine(ctx: RenderContext): string {
  const parts: string[] = [];
  const percent = ctx.context.percent;
  const thresholds = ctx.config.thresholds;

  // Determine bar color
  let barColor: string;
  if (percent >= thresholds.contextDanger) {
    barColor = ctx.config.colors.danger;
  } else if (percent >= thresholds.contextWarn) {
    barColor = ctx.config.colors.warning;
  } else {
    barColor = ctx.config.colors.healthy;
  }

  // Progress bar
  const barWidth = getAdaptiveBarWidth(ctx.terminalWidth);
  parts.push(renderBar(percent, barWidth, barColor, ctx.config.colors.muted));

  // Percent / tokens
  const percentStr = `${percent}%`;
  if (ctx.config.contextValue === 'percent') {
    parts.push(c(barColor, percentStr, { bold: percent >= thresholds.contextDanger }));
  } else if (ctx.config.contextValue === 'tokens') {
    parts.push(c(barColor, `${formatTokens(ctx.context.totalTokens)} / ${formatTokens(ctx.context.windowSize)}`));
  } else {
    parts.push(c(barColor, percentStr, { bold: percent >= thresholds.contextDanger }));
    parts.push(c(ctx.config.colors.muted, `(${formatTokens(ctx.context.totalTokens)} / ${formatTokens(ctx.context.windowSize)})`));
  }

  // Autocompact warning
  if (percent >= 90) {
    parts.push(c(ctx.config.colors.danger, 'AUTOCOMPACT SOON', { bold: true }));
  }

  // Cost
  if (ctx.config.show.cost) {
    const costStr = formatCost(ctx.cost);
    if (costStr) {
      parts.push(c(ctx.config.colors.muted, costStr, { dim: true }));
    }
  }

  return parts.join('  ');
}

export function renderToolsLine(ctx: RenderContext): string {
  if (!ctx.config.show.tools) return '';

  const tools = ctx.transcript.tools;
  if (tools.length === 0) return '';

  const parts: string[] = [];

  // Running tools — show individually
  const running = tools.filter(t => t.status === 'running');
  for (const tool of running) {
    const target = tool.target ? `: ${truncate(tool.target, 30)}` : '';
    parts.push(c(ctx.config.colors.accent, `\u25D0 ${tool.name}${target}`));
  }

  // Completed tools — aggregate by name
  const completed = tools.filter(t => t.status === 'completed');
  const grouped = new Map<string, number>();
  for (const tool of completed) {
    grouped.set(tool.name, (grouped.get(tool.name) ?? 0) + 1);
  }
  for (const [name, count] of grouped) {
    const countStr = count > 1 ? ` \u00D7${count}` : '';
    parts.push(c('green', `\u2713 ${name}${countStr}`, { dim: true }));
  }

  // Errored tools
  const errored = tools.filter(t => t.status === 'error');
  for (const tool of errored) {
    parts.push(c('red', `\u2717 ${tool.name}`));
  }

  if (parts.length === 0) return '';
  return parts.join(c(ctx.config.colors.muted, ' \u2502 '));
}

export function renderAgentsLine(ctx: RenderContext): string {
  if (!ctx.config.show.agents) return '';

  const running = ctx.transcript.agents.filter(a => a.status === 'running');
  if (running.length === 0) return '';

  return running.map(agent => {
    const modelTag = agent.model ? c(ctx.config.colors.muted, ` [${agent.model}]`) : '';
    const desc = truncate(agent.description, 40);
    const elapsed = formatDuration(Math.floor((Date.now() - agent.startTime) / 1000));
    return c(ctx.config.colors.accent, `\u25D0 ${agent.type}`) +
      modelTag +
      c(ctx.config.colors.muted, `: ${desc} (${elapsed})`);
  }).join('  ');
}

export function renderTodosLine(ctx: RenderContext): string {
  if (!ctx.config.show.todos) return '';

  const todos = ctx.transcript.todos;
  if (todos.length === 0) return '';

  const completed = todos.filter(t => t.status === 'completed').length;
  const total = todos.length;
  const percent = Math.round((completed / total) * 100);

  const barWidth = Math.min(10, getAdaptiveBarWidth(ctx.terminalWidth));
  const color = completed === total ? ctx.config.colors.healthy : ctx.config.colors.accent;

  return c(color, `\u25B8 Tasks ${completed}/${total}`) +
    '  ' +
    renderBar(percent, barWidth, color, ctx.config.colors.muted);
}

export function renderMemoryLine(ctx: RenderContext): string {
  if (!ctx.config.show.memory || !ctx.memoryUsage) return '';
  const { used, total } = ctx.memoryUsage;
  return c(ctx.config.colors.muted, `RAM: ${used} / ${total} GB`, { dim: true });
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '\u2026';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/claude-vitals && npm test 2>&1`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/render/elements.ts tests/render.test.ts
git commit -m "feat: all HUD render elements — identity, context, tools, agents, todos, memory"
```

---

### Task 12: Layout Engine

**Files:**
- Create: `src/render/index.ts`
- Create: `tests/layout.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { render, detectLayoutMode } from '../src/render/index.js';
import { stripAnsi } from '../src/render/color.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import type { RenderContext } from '../src/types.js';

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
    assert.ok(!plain.includes('\u25D0')); // no spinner
    assert.ok(!plain.includes('\u2713')); // no checkmark
  });

  it('renders minimal mode as single line', () => {
    const ctx = makeCtx({ layoutMode: 'minimal', terminalWidth: 50 });
    const output = render(ctx);
    const lines = output.split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/claude-vitals && npm test 2>&1 | head -10`
Expected: FAIL

- [ ] **Step 3: Implement render/index.ts**

```typescript
import { c } from './color.js';
import {
  renderIdentityLine,
  renderContextLine,
  renderToolsLine,
  renderAgentsLine,
  renderTodosLine,
  renderMemoryLine,
} from './elements.js';
import type { RenderContext, LayoutMode } from '../types.js';

export function detectLayoutMode(
  terminalWidth: number,
  configLayout: string,
): LayoutMode {
  if (configLayout !== 'auto') return configLayout as LayoutMode;
  if (terminalWidth >= 100) return 'expanded';
  if (terminalWidth >= 60) return 'compact';
  return 'minimal';
}

export function render(ctx: RenderContext): string {
  switch (ctx.layoutMode) {
    case 'minimal':
      return renderMinimal(ctx);
    case 'compact':
      return renderCompact(ctx);
    case 'expanded':
    default:
      return renderExpanded(ctx);
  }
}

function renderExpanded(ctx: RenderContext): string {
  const lines: string[] = [];

  // Always show identity + context
  lines.push(renderIdentityLine(ctx));
  lines.push(renderContextLine(ctx));

  // Reactive lines — only show when relevant
  const toolsLine = renderToolsLine(ctx);
  if (toolsLine) lines.push(toolsLine);

  const agentsLine = renderAgentsLine(ctx);
  if (agentsLine) lines.push(agentsLine);

  const todosLine = renderTodosLine(ctx);
  if (todosLine) lines.push(todosLine);

  const memoryLine = renderMemoryLine(ctx);
  if (memoryLine) lines.push(memoryLine);

  return lines.join('\n');
}

function renderCompact(ctx: RenderContext): string {
  const lines: string[] = [];

  // Line 1: model + context % + git branch
  const parts: string[] = [];
  parts.push(c(ctx.config.colors.accent, `[${ctx.context.model}]`));
  parts.push(contextCompact(ctx));
  if (ctx.git) parts.push(c('magenta', ctx.git.branch));
  lines.push(parts.join('  '));

  // Line 2: activity summary (if any)
  const activityParts: string[] = [];

  const running = ctx.transcript.tools.filter(t => t.status === 'running');
  if (running.length > 0) {
    activityParts.push(c(ctx.config.colors.accent, `\u25D0 ${running.length} tools`));
  }

  const runningAgents = ctx.transcript.agents.filter(a => a.status === 'running');
  if (runningAgents.length > 0) {
    activityParts.push(c(ctx.config.colors.accent, `\u25D0 ${runningAgents.length} agents`));
  }

  const todos = ctx.transcript.todos;
  if (todos.length > 0) {
    const done = todos.filter(t => t.status === 'completed').length;
    activityParts.push(c(ctx.config.colors.muted, `\u25B8 ${done}/${todos.length}`));
  }

  if (activityParts.length > 0) {
    lines.push(activityParts.join('  '));
  }

  return lines.join('\n');
}

function renderMinimal(ctx: RenderContext): string {
  const percent = ctx.context.percent;
  let color = ctx.config.colors.healthy;
  if (percent >= ctx.config.thresholds.contextDanger) color = ctx.config.colors.danger;
  else if (percent >= ctx.config.thresholds.contextWarn) color = ctx.config.colors.warning;

  return c(ctx.config.colors.accent, `[${ctx.context.model}]`) +
    '  ' +
    c(color, `${percent}%`);
}

function contextCompact(ctx: RenderContext): string {
  const percent = ctx.context.percent;
  let color = ctx.config.colors.healthy;
  if (percent >= ctx.config.thresholds.contextDanger) color = ctx.config.colors.danger;
  else if (percent >= ctx.config.thresholds.contextWarn) color = ctx.config.colors.warning;
  return c(color, `${percent}%`, { bold: percent >= ctx.config.thresholds.contextDanger });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/claude-vitals && npm test 2>&1`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/render/index.ts tests/layout.test.ts
git commit -m "feat: adaptive layout engine — expanded/compact/minimal"
```

---

### Task 13: Main Entry Point

**Files:**
- Modify: `src/index.ts`
- Create: `tests/integration.test.ts`

- [ ] **Step 1: Write failing integration test**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { main } from '../src/index.js';
import { stripAnsi } from '../src/render/color.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/claude-vitals && npm test 2>&1 | head -10`
Expected: FAIL

- [ ] **Step 3: Implement src/index.ts**

```typescript
import { parseStdin, readStdin, computeContextHealth } from './stdin.js';
import { loadConfig } from './config.js';
import { estimateCost } from './cost.js';
import { getGitState } from './git.js';
import { getMemoryUsage } from './system.js';
import { parseTranscript } from './transcript.js';
import { render, detectLayoutMode } from './render/index.js';
import { c } from './render/color.js';
import type { RenderContext } from './types.js';

export async function main(
  stdinRaw: string,
  terminalWidth?: number,
): Promise<string> {
  try {
    const stdin = parseStdin(stdinRaw);
    const config = loadConfig();
    const context = computeContextHealth(stdin);
    const cost = estimateCost(context);

    const width = terminalWidth
      ?? process.stdout.columns
      ?? process.stderr.columns
      ?? parseInt(process.env.COLUMNS ?? '', 10)
      || 120;

    const layoutMode = detectLayoutMode(width, config.layout);

    // Transcript
    let transcript = { tools: [], agents: [], todos: [] } as RenderContext['transcript'];
    if (stdin.transcript_path) {
      transcript = parseTranscript(stdin.transcript_path);
    }

    // Session duration
    let sessionDuration = 0;
    if (transcript.sessionStart) {
      sessionDuration = Math.floor((Date.now() - transcript.sessionStart) / 1000);
    }

    // Git (async but with TTL cache)
    let git: RenderContext['git'] = null;
    if (config.show.git && stdin.cwd) {
      git = await getGitState(stdin.cwd);
    }

    // Memory
    const memoryUsage = config.show.memory ? getMemoryUsage() : undefined;

    const ctx: RenderContext = {
      stdin,
      context,
      transcript,
      git,
      config,
      cost,
      sessionDuration,
      terminalWidth: width,
      layoutMode,
      memoryUsage,
    };

    return render(ctx);
  } catch (err) {
    return c('red', 'vitals: error');
  }
}

// CLI entry point
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  readStdin().then(raw => main(raw)).then(output => {
    process.stdout.write(output);
  }).catch(() => {
    process.stdout.write('vitals: error');
  });
}
```

Note: the `import.meta.url` check above may not reliably detect "am I the entry point?" in all Node versions. A simpler approach — add a thin `bin.ts` wrapper:

Create `src/bin.ts`:
```typescript
import { readStdin } from './stdin.js';
import { main } from './index.js';

readStdin()
  .then(raw => main(raw))
  .then(output => process.stdout.write(output))
  .catch(() => process.stdout.write('vitals: error'));
```

Update `package.json` main to `"main": "dist/bin.js"`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/claude-vitals && npm test 2>&1`
Expected: All PASS

- [ ] **Step 5: Verify end-to-end manually**

Run: `cd ~/claude-vitals && npm run build && echo '{"model":{"display_name":"Opus 4.6"},"context_window":{"used_percentage":42,"context_window_size":200000,"current_usage":{"input_tokens":50000,"output_tokens":10000}},"cwd":"/Users/test/project"}' | node dist/bin.js`

Expected: Colored HUD output in terminal

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/bin.ts tests/integration.test.ts package.json
git commit -m "feat: main entry point with full orchestration and CLI bin"
```

---

### Task 14: Plugin Manifest & Commands

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `commands/configure.md`

- [ ] **Step 1: Create plugin.json**

```json
{
  "name": "claude-vitals",
  "version": "0.1.0",
  "description": "Real-time session vitals — context health, tools, agents, todos, cost",
  "statusline": {
    "command": "node",
    "args": ["dist/bin.js"]
  },
  "commands": ["commands/configure.md"],
  "links": {
    "repository": "https://github.com/ICXCNIKAanon/claude-vitals"
  }
}
```

- [ ] **Step 2: Create marketplace.json**

```json
{
  "categories": ["productivity", "developer-tools"],
  "screenshots": [],
  "featured": false
}
```

- [ ] **Step 3: Create commands/configure.md**

```markdown
---
name: configure-vitals
description: Open or create the claude-vitals config file for customization
---

Open the claude-vitals configuration file at `~/.claude/plugins/claude-vitals/config.json`.

If the file doesn't exist, create it with an empty object `{}` so the user can add overrides.

Show the user the available config options:
- `layout`: "auto" | "expanded" | "compact" | "minimal"
- `show`: Toggle individual elements (contextBar, cost, git, tools, agents, todos, memory, speed, duration)
- `contextValue`: "percent" | "tokens" | "both"
- `thresholds`: contextWarn (default 70), contextDanger (default 85), sevenDayShow (default 80)
- `colors`: healthy, warning, danger, accent, muted (named colors, hex, or 0-255)
- `git`: showDirty, showAheadBehind, showFileStats

All options are optional. Defaults are used for anything not specified.
```

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/ commands/
git commit -m "feat: plugin manifest and configure command"
```

---

### Task 15: CLAUDE.md & README

**Files:**
- Create: `CLAUDE.md`
- Create: `README.md`

- [ ] **Step 1: Create CLAUDE.md**

```markdown
# claude-vitals

Claude Code statusline plugin showing real-time session vitals.

## Build

```bash
npm install
npm run build    # tsc → dist/
```

## Test

```bash
npm test
```

## Architecture

- `src/bin.ts` — CLI entry, reads stdin, writes stdout
- `src/index.ts` — Orchestrator, wires all modules
- `src/stdin.ts` — Parse Claude Code JSON input
- `src/transcript.ts` — Parse session JSONL for tools/agents/todos
- `src/config.ts` — Config loading with smart defaults
- `src/cost.ts` — Token cost estimation
- `src/git.ts` — Git branch/status via execFile
- `src/system.ts` — Memory, duration, token formatting
- `src/render/` — Layout engine + element renderers

## Key Constraints

- Zero npm dependencies (Node.js built-ins only)
- Each render cycle must complete in <50ms
- Process is short-lived (spawned every ~300ms), disk cache required
- Never crash — all errors handled gracefully with fallbacks
```

- [ ] **Step 2: Create README.md**

```markdown
# claude-vitals

A Claude Code plugin that shows what's happening — context usage, active tools, running agents, todo progress, and cost estimation. Always visible below your input.

## Features

- **Context health** — progress bar with color-coded thresholds + token counts
- **Cost estimation** — approximate session cost based on model and token usage
- **Active tools** — see what Claude is doing right now (Read, Edit, Grep, etc.)
- **Running agents** — track subagent dispatches with type, model, and elapsed time
- **Todo progress** — visual progress bar for task completion
- **Git status** — branch, dirty state, ahead/behind, file stats
- **Adaptive layout** — auto-detects terminal width (expanded → compact → minimal)
- **Reactive sections** — lines appear/disappear based on relevance. No noise.
- **Autocompact warning** — alerts when context is about to be compressed
- **Zero config required** — works perfectly out of the box

## Install

```bash
# Via Claude Code plugin marketplace (coming soon)
# Or manually:
git clone https://github.com/ICXCNIKAanon/claude-vitals.git ~/.claude/plugins/claude-vitals
cd ~/.claude/plugins/claude-vitals
npm install && npm run build
```

## Configuration

Optional. Create `~/.claude/plugins/claude-vitals/config.json`:

```json
{
  "layout": "auto",
  "show": {
    "cost": true,
    "git": true,
    "tools": true,
    "agents": true,
    "todos": true,
    "memory": false
  },
  "contextValue": "both",
  "colors": {
    "healthy": "green",
    "warning": "yellow",
    "danger": "red"
  }
}
```

All options are optional — defaults are used for anything not specified.

## License

MIT
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: add CLAUDE.md and README.md"
```

---

### Task 16: GitHub Repo & Push

**Files:** None (git operations only)

- [ ] **Step 1: Create GitHub repo**

```bash
gh repo create ICXCNIKAanon/claude-vitals --private --description "Claude Code statusline plugin — real-time session vitals" --source ~/claude-vitals --push
```

- [ ] **Step 2: Verify repo**

```bash
gh repo view ICXCNIKAanon/claude-vitals
```

Expected: Repo visible with description and all commits pushed

- [ ] **Step 3: Add LICENSE file**

```bash
cd ~/claude-vitals
curl -sL https://opensource.org/licenses/MIT -o /dev/null
# Create MIT license manually
```

Create `LICENSE` file with MIT license text, commit and push.

---

## Dependency Graph

```
Task 1 (scaffolding)
  └── Task 2 (types)
       ├── Task 3 (color) ─── Task 4 (bar)
       ├── Task 5 (stdin)
       ├── Task 6 (config)
       ├── Task 7 (cost)
       ├── Task 8 (git)
       ├── Task 9 (system)
       └── Task 10 (transcript)
            └── Task 11 (elements)
                 └── Task 12 (layout)
                      └── Task 13 (entry point)
                           └── Task 14 (plugin manifest)
                                └── Task 15 (docs)
                                     └── Task 16 (GitHub)
```

Tasks 3-10 can be parallelized after Task 2 is complete. Tasks 11+ are sequential.
