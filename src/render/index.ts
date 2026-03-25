import { c } from './color.ts';
import {
  renderIdentityLine,
  renderContextLine,
  renderToolsLine,
  renderAgentsLine,
  renderTodosLine,
  renderRateLimitsLine,
  renderMemoryLine,
  renderShipSafeLine,
} from './elements.ts';
import type { RenderContext, LayoutMode } from '../types.ts';

export function detectLayoutMode(
  terminalWidth: number,
  configLayout: string,
): LayoutMode {
  if (configLayout !== 'auto') return configLayout as LayoutMode;
  if (terminalWidth >= 100) return 'expanded';
  if (terminalWidth >= 60) return 'compact';
  return 'minimal';
}

export function render(ctx: RenderContext): string {
  switch (ctx.layoutMode) {
    case 'minimal':
      return renderMinimal(ctx);
    case 'compact':
      return renderCompact(ctx);
    case 'expanded':
    default:
      return renderExpanded(ctx);
  }
}

function renderExpanded(ctx: RenderContext): string {
  const lines: string[] = [];

  lines.push(renderIdentityLine(ctx));
  lines.push(renderContextLine(ctx));

  const toolsLine = renderToolsLine(ctx);
  if (toolsLine) lines.push(toolsLine);

  const agentsLine = renderAgentsLine(ctx);
  if (agentsLine) lines.push(agentsLine);

  const todosLine = renderTodosLine(ctx);
  if (todosLine) lines.push(todosLine);

  const rateLimitsLine = renderRateLimitsLine(ctx);
  if (rateLimitsLine) lines.push(rateLimitsLine);

  const memoryLine = renderMemoryLine(ctx);
  if (memoryLine) lines.push(memoryLine);

  const shipsafeLine = renderShipSafeLine(ctx.shipsafe ?? null);
  if (shipsafeLine) lines.push(shipsafeLine);

  return lines.join('\n');
}

function renderCompact(ctx: RenderContext): string {
  const lines: string[] = [];

  const parts: string[] = [];
  parts.push(c(ctx.config.colors.accent, `[${ctx.context.model}]`));
  parts.push(contextCompact(ctx));
  if (ctx.git) parts.push(c('magenta', ctx.git.branch));
  lines.push(parts.join('  '));

  const activityParts: string[] = [];

  const running = ctx.transcript.tools.filter(t => t.status === 'running');
  if (running.length > 0) {
    activityParts.push(c(ctx.config.colors.accent, `\u25D0 ${running.length} tools`));
  }

  const runningAgents = ctx.transcript.agents.filter(a => a.status === 'running');
  if (runningAgents.length > 0) {
    activityParts.push(c(ctx.config.colors.accent, `\u25D0 ${runningAgents.length} agents`));
  }

  const todos = ctx.transcript.todos;
  if (todos.length > 0) {
    const done = todos.filter(t => t.status === 'completed').length;
    activityParts.push(c(ctx.config.colors.muted, `\u25B8 ${done}/${todos.length}`));
  }

  if (activityParts.length > 0) {
    lines.push(activityParts.join('  '));
  }

  return lines.join('\n');
}

function renderMinimal(ctx: RenderContext): string {
  const percent = ctx.context.percent;
  let color = ctx.config.colors.healthy;
  if (percent >= ctx.config.thresholds.contextDanger) color = ctx.config.colors.danger;
  else if (percent >= ctx.config.thresholds.contextWarn) color = ctx.config.colors.warning;

  return c(ctx.config.colors.accent, `[${ctx.context.model}]`) +
    '  ' +
    c(color, `${percent}%`);
}

function contextCompact(ctx: RenderContext): string {
  const percent = ctx.context.percent;
  let color = ctx.config.colors.healthy;
  if (percent >= ctx.config.thresholds.contextDanger) color = ctx.config.colors.danger;
  else if (percent >= ctx.config.thresholds.contextWarn) color = ctx.config.colors.warning;
  return c(color, `${percent}%`, { bold: percent >= ctx.config.thresholds.contextDanger });
}
