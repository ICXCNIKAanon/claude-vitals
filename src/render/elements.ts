import { c, visibleLength } from './color.ts';
import { renderBar, getAdaptiveBarWidth } from './bar.ts';
import { formatDuration, formatTokens } from '../system.ts';
import { formatCost } from '../cost.ts';
import type { RenderContext, ToolEntry } from '../types.ts';

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

  let barColor: string;
  if (percent >= thresholds.contextDanger) {
    barColor = ctx.config.colors.danger;
  } else if (percent >= thresholds.contextWarn) {
    barColor = ctx.config.colors.warning;
  } else {
    barColor = ctx.config.colors.healthy;
  }

  const barWidth = getAdaptiveBarWidth(ctx.terminalWidth);
  parts.push(renderBar(percent, barWidth, barColor, ctx.config.colors.muted));

  const percentStr = `${percent}%`;
  if (ctx.config.contextValue === 'percent') {
    parts.push(c(barColor, percentStr, { bold: percent >= thresholds.contextDanger }));
  } else if (ctx.config.contextValue === 'tokens') {
    parts.push(c(barColor, `${formatTokens(ctx.context.totalTokens)} / ${formatTokens(ctx.context.windowSize)}`));
  } else {
    parts.push(c(barColor, percentStr, { bold: percent >= thresholds.contextDanger }));
    parts.push(c(ctx.config.colors.muted, `(${formatTokens(ctx.context.totalTokens)} / ${formatTokens(ctx.context.windowSize)})`));
  }

  if (percent >= 90) {
    parts.push(c(ctx.config.colors.danger, 'AUTOCOMPACT SOON', { bold: true }));
  }

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

  const running = tools.filter(t => t.status === 'running');
  for (const tool of running) {
    const target = tool.target ? `: ${truncate(tool.target, 30)}` : '';
    parts.push(c(ctx.config.colors.accent, `\u25D0 ${tool.name}${target}`));
  }

  const completed = tools.filter(t => t.status === 'completed');
  const grouped = new Map<string, number>();
  for (const tool of completed) {
    grouped.set(tool.name, (grouped.get(tool.name) ?? 0) + 1);
  }
  for (const [name, count] of grouped) {
    const countStr = count > 1 ? ` \u00D7${count}` : '';
    parts.push(c('green', `\u2713 ${name}${countStr}`, { dim: true }));
  }

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
