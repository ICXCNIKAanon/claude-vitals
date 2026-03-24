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
