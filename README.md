# claude-vitals

Real-time session vitals for Claude Code. Context health, active tools, running agents, cost, rate limits — always visible below your input.

![claude-vitals demo](demo.svg)

## What You See

```
[Opus 4.6 (1M context)]  ~/myproject  main ✱ ~2  ⏱ 12m 34s
████████░░░░░░░░  42%  (420k / 1.0M)  ~$9.20
◐ Bash: npm run build │ ✓ Read ×3 │ ✓ Grep │ ✓ Edit ×2 │ ✓ Bash
◐ AGENT: Explore [sonnet]: Searching for security vulnerabilities (2m 15s)
▸ Tasks 2/5 ████░░░░░░
5h: █░░░░░░░  12% resets in 4h 0m  7d: ███░░░░░  39% resets Fri 10:00 AM
```

**Line 1** — Model, project path, git branch + dirty state, session duration

**Line 2** — Context window health bar with color thresholds (green < 70% < yellow < 85% < red) + token counts + estimated cost

**Line 3** — Active tools (running shown individually, completed aggregated by name, errors in red)

**Line 4** — Running agents with type, model, description, and elapsed time

**Line 5** — Task progress with bar

**Line 6** — Rate limits (5-hour session + 7-day weekly) with reset times

Every line is **reactive** — it only appears when relevant. No agents running? Line hidden. No todos? Line hidden. Git clean? Just branch name. No noise.

## Features

- **Context health** — progress bar with color-coded thresholds + token counts
- **Cost estimation** — approximate session cost based on model and token usage
- **Active tools** — see what Claude is doing right now (Read, Edit, Grep, Bash, etc.)
- **Running agents** — track subagent dispatches with type, model, and elapsed time
- **Todo progress** — visual progress bar for task completion
- **Git status** — branch, dirty state, ahead/behind, file stats
- **Rate limits** — 5-hour and 7-day usage with reset countdown
- **Autocompact warning** — bold red alert when context hits 90%+
- **Adaptive layout** — auto-detects terminal width (expanded / compact / minimal)
- **Reactive sections** — lines appear/disappear based on relevance
- **Zero config** — works perfectly out of the box
- **Zero dependencies** — pure Node.js built-ins, nothing to install

## Install

```bash
# 1. Clone and build
git clone https://github.com/ICXCNIKAanon/claude-vitals.git ~/claude-vitals
cd ~/claude-vitals
npm install && npm run build

# 2. Add to Claude Code settings (~/.claude/settings.json)
# Add this to your settings.json:
```

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /path/to/claude-vitals/dist/bin.js"
  }
}
```

```bash
# 3. Restart Claude Code — vitals appear immediately
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
  "thresholds": {
    "contextWarn": 70,
    "contextDanger": 85
  },
  "colors": {
    "healthy": "green",
    "warning": "yellow",
    "danger": "red",
    "accent": "cyan",
    "muted": "gray"
  }
}
```

All options are optional — defaults are used for anything not specified.

Colors support named colors, hex (`#ff0000`), and 256-color indices (`196`).

## Requirements

- Node.js 22+
- Claude Code 2.1+

## License

MIT
