import { c } from './color.ts';
import { renderBar, getAdaptiveBarWidth } from './bar.ts';
import { formatDuration, formatTokens } from '../system.ts';
import { formatCost } from '../cost.ts';
import type { RenderContext, ToolEntry } from '../types.ts';
import type { ShipSafeState } from '../shipsafe.ts';

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

  // Update available
  if (ctx.updateAvailable) {
    parts.push(c(ctx.config.colors.warning, '\u2191 update available', { dim: true }));
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
    parts.push(c(ctx.config.colors.accent, `\u25D0 ${shortToolName(tool.name)}${target}`));
  }

  const completed = tools.filter(t => t.status === 'completed');
  const grouped = new Map<string, number>();
  for (const tool of completed) {
    grouped.set(shortToolName(tool.name), (grouped.get(shortToolName(tool.name)) ?? 0) + 1);
  }
  // Sort by count descending, show top 5, collapse rest
  const sorted = [...grouped.entries()].sort((a, b) => b[1] - a[1]);
  const MAX_TOOL_GROUPS = 5;
  const shown = sorted.slice(0, MAX_TOOL_GROUPS);
  const overflow = sorted.slice(MAX_TOOL_GROUPS);
  for (const [name, count] of shown) {
    const countStr = count > 1 ? ` \u00D7${count}` : '';
    parts.push(c('green', `\u2713 ${name}${countStr}`, { dim: true }));
  }
  if (overflow.length > 0) {
    const overflowTotal = overflow.reduce((sum, [, n]) => sum + n, 0);
    parts.push(c(ctx.config.colors.muted, `+${overflowTotal} more`, { dim: true }));
  }

  const errored = tools.filter(t => t.status === 'error');
  for (const tool of errored) {
    parts.push(c('red', `\u2717 ${shortToolName(tool.name)}`));
  }

  if (parts.length === 0) return '';
  return parts.join(c(ctx.config.colors.muted, ' \u2502 '));
}

export function renderAgentsLine(ctx: RenderContext): string {
  if (!ctx.config.show.agents) return '';

  const running = ctx.transcript.agents.filter(a => a.status === 'running');
  if (running.length === 0) return '';

  const parts: string[] = [];

  // Show count when multiple agents running
  if (running.length > 1) {
    parts.push(c(ctx.config.colors.accent, `${running.length} agents`, { bold: true }));
  }

  // Show each running agent with details
  for (const agent of running) {
    const modelTag = agent.model ? c(ctx.config.colors.muted, ` [${agent.model}]`) : '';
    const desc = truncate(agent.description, 40);
    const now = performance.timeOrigin + performance.now();
    const elapsed = formatDuration(Math.max(0, Math.floor((now - agent.startTime) / 1000)));
    parts.push(c(ctx.config.colors.accent, `\u25D0 AGENT: ${agent.type}`) +
      modelTag +
      c(ctx.config.colors.muted, `: ${desc} (${elapsed})`));
  }

  return parts.join(c(ctx.config.colors.muted, ' \u2502 '));
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

export function renderRateLimitsLine(ctx: RenderContext): string {
  const limits = ctx.stdin.rate_limits;
  if (!limits) return '';

  const parts: string[] = [];

  // 5-hour session limit
  if (limits.five_hour && limits.five_hour.used_percentage != null) {
    const pct = Math.round(limits.five_hour.used_percentage);
    const color = pct >= 90 ? ctx.config.colors.danger :
                  pct >= 75 ? 'magenta' : 'blue';
    const resetStr = limits.five_hour.resets_at ? formatResetTime(limits.five_hour.resets_at) : '';
    const barWidth = 8;
    parts.push(
      c(ctx.config.colors.muted, '5h: ') +
      renderBar(pct, barWidth, color, ctx.config.colors.muted) +
      '  ' + c(color, `${pct}%`) +
      (resetStr ? c(ctx.config.colors.muted, ` resets ${resetStr}`, { dim: true }) : '')
    );
  }

  // 7-day weekly limit
  if (limits.seven_day && limits.seven_day.used_percentage != null) {
    const pct = Math.round(limits.seven_day.used_percentage);
    if (pct > 0) {
      const color = pct >= 90 ? ctx.config.colors.danger :
                    pct >= 75 ? 'magenta' : 'blue';
      const resetStr = limits.seven_day.resets_at ? formatResetTime(limits.seven_day.resets_at) : '';
      const barWidth = 8;
      parts.push(
        c(ctx.config.colors.muted, '7d: ') +
        renderBar(pct, barWidth, color, ctx.config.colors.muted) +
        '  ' + c(color, `${pct}%`) +
        (resetStr ? c(ctx.config.colors.muted, ` resets ${resetStr}`, { dim: true }) : '')
      );
    }
  }

  if (parts.length === 0) return '';
  return parts.join('  ');
}

function formatResetTime(timestamp: number): string {
  // Claude Code sends resets_at as Unix seconds, not milliseconds
  const tsMs = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  const now = Date.now();
  const diff = tsMs - now;

  if (diff <= 0) return 'soon';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours >= 24) {
    const date = new Date(tsMs);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = dayNames[date.getDay()];
    const h = date.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${day} ${h12}:${String(date.getMinutes()).padStart(2, '0')} ${ampm}`;
  }

  if (hours > 0) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}

export function renderMemoryLine(ctx: RenderContext): string {
  if (!ctx.config.show.memory || !ctx.memoryUsage) return '';
  const { used, total } = ctx.memoryUsage;
  return c(ctx.config.colors.muted, `RAM: ${used} / ${total} GB`, { dim: true });
}

export function renderShipSafeLine(state: ShipSafeState | null): string {
  if (!state || !state.installed) return '';

  // ShipSafe installed but no scan results yet
  if (!state.score) {
    return c('cyan', '\u26F5 ShipSafe') + '  ' + c('white', 'run', { dim: true }) + ' ' + c('cyan', 'shipsafe scan');
  }

  const scoreColors: Record<string, string> = {
    'A': 'green',
    'B': 'green',
    'C': 'yellow',
    'D': 'red',
    'F': 'red',
  };

  const color = scoreColors[state.score] ?? 'white';
  const parts: string[] = [];

  parts.push(c('cyan', '\u26F5'));
  parts.push(c(color, state.score, { bold: true }));

  if (state.findingsCount !== undefined) {
    if (state.findingsCount === 0) {
      parts.push(c('green', 'clean'));
    } else {
      const counts: string[] = [];
      if (state.critical && state.critical > 0) counts.push(c('red', `${state.critical} crit`));
      if (state.high && state.high > 0) counts.push(c('red', `${state.high} high`));
      if (counts.length === 0) counts.push(c('yellow', `${state.findingsCount} findings`));
      parts.push(counts.join(' '));
    }
  }

  if (state.autoFixable && state.autoFixable > 0) {
    parts.push(c('cyan', `${state.autoFixable} fixable`));
  }

  return parts.join('  ');
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '\u2026';
}

function shortToolName(name: string): string {
  // mcp__chrome-devtools__evaluate_script → evaluate_script
  // mcp__shipsafe__shipsafe_scan → shipsafe_scan
  if (name.startsWith('mcp__')) {
    const parts = name.split('__');
    return parts[parts.length - 1];
  }
  return name;
}
