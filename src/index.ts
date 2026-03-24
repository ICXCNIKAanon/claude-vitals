import { parseStdin, computeContextHealth } from './stdin.ts';
import { loadConfig } from './config.ts';
import { estimateCost } from './cost.ts';
import { getGitState } from './git.ts';
import { getMemoryUsage } from './system.ts';
import { parseTranscript } from './transcript.ts';
import { render, detectLayoutMode } from './render/index.ts';
import { c } from './render/color.ts';
import type { RenderContext } from './types.ts';

export async function main(
  stdinRaw: string,
  terminalWidth?: number,
): Promise<string> {
  try {
    const stdin = parseStdin(stdinRaw);
    const config = loadConfig();
    const context = computeContextHealth(stdin);
    const cost = estimateCost(context);

    const width = (terminalWidth
      ?? process.stdout.columns
      ?? process.stderr.columns
      ?? parseInt(process.env.COLUMNS ?? '', 10))
      || 120;

    const layoutMode = detectLayoutMode(width, config.layout);

    let transcript = { tools: [], agents: [], todos: [] } as RenderContext['transcript'];
    if (stdin.transcript_path) {
      transcript = parseTranscript(stdin.transcript_path);
    }

    let sessionDuration = 0;
    if (transcript.sessionStart) {
      const currentTimeMs = performance.timeOrigin + performance.now();
      sessionDuration = Math.floor((currentTimeMs - transcript.sessionStart) / 1000);
    }

    let git: RenderContext['git'] = null;
    if (config.show.git && stdin.cwd) {
      git = await getGitState(stdin.cwd);
    }

    const memoryUsage = config.show.memory ? getMemoryUsage() : undefined;

    const ctx: RenderContext = {
      stdin, context, transcript, git, config, cost,
      sessionDuration, terminalWidth: width, layoutMode, memoryUsage,
    };

    return render(ctx);
  } catch {
    return c('red', 'vitals: error');
  }
}
