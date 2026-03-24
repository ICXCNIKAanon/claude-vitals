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
