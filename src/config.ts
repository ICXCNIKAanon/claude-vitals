import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { VitalsConfig } from './types.ts';

export const DEFAULT_CONFIG: VitalsConfig = {
  layout: 'auto',
  show: {
    contextBar: true, cost: true, git: true, tools: true,
    agents: true, todos: true, memory: false, speed: true, duration: true,
  },
  contextValue: 'both',
  thresholds: { contextWarn: 70, contextDanger: 85, sevenDayShow: 80 },
  colors: {
    healthy: 'green', warning: 'yellow', danger: 'red',
    accent: 'cyan', muted: 'gray',
  },
  git: { showDirty: true, showAheadBehind: true, showFileStats: true },
};

const VALID_LAYOUTS = ['expanded', 'compact', 'minimal', 'auto'] as const;

export function mergeConfig(partial: Record<string, any>): VitalsConfig {
  const config = structuredClone(DEFAULT_CONFIG);

  if (partial.layout && VALID_LAYOUTS.includes(partial.layout)) {
    config.layout = partial.layout;
  }

  if (partial.show && typeof partial.show === 'object') {
    for (const key of Object.keys(config.show) as (keyof VitalsConfig['show'])[]) {
      if (typeof partial.show[key] === 'boolean') {
        config.show[key] = partial.show[key];
      }
    }
  }

  if (partial.contextValue && ['percent', 'tokens', 'both'].includes(partial.contextValue)) {
    config.contextValue = partial.contextValue;
  }

  if (partial.thresholds && typeof partial.thresholds === 'object') {
    for (const key of Object.keys(config.thresholds) as (keyof VitalsConfig['thresholds'])[]) {
      if (typeof partial.thresholds[key] === 'number') {
        config.thresholds[key] = partial.thresholds[key];
      }
    }
  }

  if (partial.colors && typeof partial.colors === 'object') {
    for (const key of Object.keys(config.colors) as (keyof VitalsConfig['colors'])[]) {
      if (typeof partial.colors[key] === 'string') {
        config.colors[key] = partial.colors[key];
      }
    }
  }

  if (partial.git && typeof partial.git === 'object') {
    for (const key of Object.keys(config.git) as (keyof VitalsConfig['git'])[]) {
      if (typeof partial.git[key] === 'boolean') {
        config.git[key] = partial.git[key];
      }
    }
  }

  return config;
}

let cachedMtime = 0;
let cachedConfig: VitalsConfig = DEFAULT_CONFIG;

export function loadConfig(): VitalsConfig {
  const configPath = path.join(
    os.homedir(), '.claude', 'plugins', 'claude-vitals', 'config.json'
  );

  try {
    const stat = fs.statSync(configPath);
    if (stat.mtimeMs === cachedMtime) return cachedConfig;

    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    cachedMtime = stat.mtimeMs;
    cachedConfig = mergeConfig(parsed);
    return cachedConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}
