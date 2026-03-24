import type { StdinData, ContextHealth } from './types.ts';

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
    percent, inputTokens, outputTokens, cacheCreationTokens,
    cacheReadTokens, totalTokens, windowSize, model,
  };
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}
