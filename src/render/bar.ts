import { c } from './color.ts';

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
