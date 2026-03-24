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
