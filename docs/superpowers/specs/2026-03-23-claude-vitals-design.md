# claude-vitals Design Spec

**Date:** 2026-03-23
**Repo:** ICXCNIKAanon/claude-vitals
**License:** MIT

## Overview

A Claude Code statusline plugin that displays real-time session vitals: context health, active tools, running agents, todo progress, git status, cost estimation, and more. Zero dependencies, pure TypeScript. Smart defaults that work perfectly out of the box with adaptive layout that responds to terminal width.

## Architecture

### Plugin Type

Claude Code statusline subprocess. Invoked every ~300ms. Receives JSON via stdin, outputs ANSI-styled lines to stdout.

```
Claude Code → stdin (JSON) → claude-vitals → stdout (ANSI lines) → statusline
```

### File Structure

```
claude-vitals/
├── src/
│   ├── index.ts          # Entry point — read stdin, orchestrate, output
│   ├── stdin.ts           # Parse Claude Code's JSON input, token math
│   ├── transcript.ts      # Parse session JSONL — tools, agents, todos
│   ├── git.ts             # Branch, dirty state, ahead/behind
│   ├── system.ts          # Memory, Claude Code version, session duration
│   ├── config.ts          # Load/validate config, smart defaults
│   ├── cost.ts            # Token cost estimation by model
│   ├── render/
│   │   ├── index.ts       # Layout engine — adaptive multi/single/minimal
│   │   ├── elements.ts    # Individual HUD elements (context, tools, etc.)
│   │   ├── bar.ts         # Progress bar rendering (context, usage)
│   │   └── color.ts       # ANSI color helpers, theme system
│   └── types.ts           # All TypeScript interfaces
├── tests/
│   ├── stdin.test.ts
│   ├── transcript.test.ts
│   ├── git.test.ts
│   ├── config.test.ts
│   ├── cost.test.ts
│   ├── render.test.ts
│   └── integration.test.ts
├── commands/
│   └── configure.md       # Plugin command for config wizard
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── package.json            # Zero dependencies
├── tsconfig.json
├── CLAUDE.md
└── README.md
```

~12 source files. Zero npm dependencies — Node.js built-ins only: `child_process`, `fs`, `readline`, `os`, `crypto`.

## Data Model

### Stdin (from Claude Code)

```typescript
interface StdinData {
  model: { id?: string; display_name?: string }
  context_window: {
    context_window_size?: number
    current_usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
    used_percentage?: number
    remaining_percentage?: number
  }
  rate_limits?: {
    five_hour?: { used_percentage?: number; resets_at?: number }
    seven_day?: { used_percentage?: number; resets_at?: number }
  }
  transcript_path?: string
  cwd?: string
}
```

### Transcript Parsed State

```typescript
interface ToolEntry {
  id: string
  name: string
  target: string        // file path, pattern, or command snippet
  status: 'running' | 'completed' | 'error'
  startTime: number
  endTime?: number
}

interface AgentEntry {
  id: string
  type: string          // 'Explore', 'Plan', etc.
  model?: string
  description: string
  status: 'running' | 'completed'
  startTime: number
}

interface TodoEntry {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}
```

### Transcript Caching

Hash transcript path → store parsed state in `~/.claude/plugins/claude-vitals/cache/`. Invalidate on file mtime or size change.

## Rendering

### Adaptive Layout (Auto-Detected)

| Terminal Width | Mode | What Shows |
|---|---|---|
| >=100 cols | Expanded | Multi-line, all elements, full progress bars |
| 60-99 cols | Compact | Two lines, abbreviated labels, short bars |
| <60 cols | Minimal | Single line, context % + model only |

### Expanded Mode Example

```
 [Opus 4.6]  ~/myproject  main * +2 ~1  ⏱ 12m 34s
 ████████░░░░░░░░░░░░  42%  (84k / 200k)  ~$0.47
 ◐ Edit: auth.ts │ ✓ Read ×3 │ ✓ Grep ×2
 ◐ Explore [haiku]: Finding auth patterns (2m 15s)
 ▸ Tasks 3/5 ██████░░░░
```

### Reactive Sections (Key Differentiator)

Lines auto-show/hide based on relevance:
- No agents running → agents line hidden
- No todos → todos line hidden
- Git clean → just branch name, no stats
- Context <85% → no token breakdown
- 7-day usage <80% → hidden
- Cost <$0.01 → hidden

### Visual Hierarchy

1. **Identity line** (always): Model badge + project + git + duration
2. **Health line** (always): Context bar (hero element) + cost
3. **Activity lines** (reactive): Tools, agents, todos — only when relevant

### Color Scheme

- Context health: green → yellow (70%) → red (85%)
- Autocompact approaching: bold/bright treatment
- Running tools: cyan spinner character
- Completed tools: dim green checkmark
- Errors: red ✗
- Cost: dim gray

### Progress Bars

Width-aware: scale 10-20 chars based on available terminal space after accounting for label text. Uses `█` (filled) and `░` (empty).

## Smart Features (Differentiators)

### 1. Cost Estimation

Per-session cost based on model + tokens:

| Model | Input $/M | Output $/M |
|---|---|---|
| Opus 4.6 | $15 | $75 |
| Sonnet 4.6 | $3 | $15 |
| Haiku 4.5 | $0.80 | $4 |

Cache reads at discounted rate. Shows `~$0.47` on context line. Hidden when <$0.01. Ballpark, not billing.

### 2. Autocompact Warning

Context bar shifts to yellow at ~80%, red + `AUTOCOMPACT SOON` at 90%+.

### 3. Session Duration

Parsed from first transcript timestamp. Shows `⏱ 5m 23s` on identity line.

### 4. Hot-Reload Config

Config re-read every render cycle. Stat mtime first, only re-parse if changed.

### 5. Reactive Sections

Auto-show/hide based on relevance (covered above).

## Configuration

**Path:** `~/.claude/plugins/claude-vitals/config.json`

**Philosophy:** Works perfectly with zero config. Every option exists to turn things off, not on.

```typescript
interface VitalsConfig {
  layout?: 'expanded' | 'compact' | 'minimal' | 'auto'  // default: 'auto'
  show?: {
    contextBar?: boolean    // default: true
    cost?: boolean          // default: true
    git?: boolean           // default: true
    tools?: boolean         // default: true
    agents?: boolean        // default: true
    todos?: boolean         // default: true
    memory?: boolean        // default: true
    speed?: boolean         // default: true
    duration?: boolean      // default: true
  }
  contextValue?: 'percent' | 'tokens' | 'both'  // default: 'both'
  thresholds?: {
    contextWarn?: number       // default: 70
    contextDanger?: number     // default: 85
    sevenDayShow?: number      // default: 80
  }
  colors?: {
    healthy?: string     // default: 'green'
    warning?: string     // default: 'yellow'
    danger?: string      // default: 'red'
    accent?: string      // default: 'cyan'
    muted?: string       // default: 'gray'
  }
  git?: {
    showDirty?: boolean         // default: true
    showAheadBehind?: boolean   // default: true
    showFileStats?: boolean     // default: true
  }
}
```

~15 config options vs the original's 30+. Invalid JSON silently falls back to defaults.

## Error Handling & Performance

### Performance

- Each render cycle <50ms (invoked every 300ms)
- Transcript caching avoids re-parsing
- Git: execFile with 1s timeout, fail silently
- Config: stat mtime before reading

### Error Strategy: Never Crash, Never Block

- Malformed stdin → "no data" state
- Corrupt transcript → last cached state, skip bad lines
- Git not installed → hide git section
- Config invalid → use defaults
- Any element throws → skip it, render the rest
- Cache write fails → re-parse next cycle

### Transcript Parsing

- Each JSONL line wrapped in try/catch
- Skip unparseable lines
- Keep last 20 tools, 10 agents
- Stream with readline

## Testing

- Unit tests for each module
- Snapshot tests for render output at each layout mode
- Edge cases: empty stdin, 1M context, zero tools, 100+ tools, emoji paths
- Node.js native test runner + c8 for coverage
