# claude-vitals

Claude Code statusline plugin showing real-time session vitals.

## Build

```bash
npm install
npm run build
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
