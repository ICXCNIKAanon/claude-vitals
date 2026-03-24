import type { ContextHealth } from './types.ts';

interface ModelPricing {
  input: number;
  output: number;
}

const PRICING: Record<string, ModelPricing> = {
  'opus':   { input: 15,   output: 75 },
  'sonnet': { input: 3,    output: 15 },
  'haiku':  { input: 0.80, output: 4 },
};

const CACHE_CREATE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.10;

function matchModel(model: string): ModelPricing | null {
  const lower = model.toLowerCase();
  for (const [key, pricing] of Object.entries(PRICING)) {
    if (lower.includes(key)) return pricing;
  }
  return null;
}

export function estimateCost(health: ContextHealth): number {
  const pricing = matchModel(health.model);
  if (!pricing) return 0;

  const perM = 1_000_000;
  const inputCost = (health.inputTokens / perM) * pricing.input;
  const outputCost = (health.outputTokens / perM) * pricing.output;
  const cacheCreateCost = (health.cacheCreationTokens / perM) * pricing.input * CACHE_CREATE_MULTIPLIER;
  const cacheReadCost = (health.cacheReadTokens / perM) * pricing.input * CACHE_READ_MULTIPLIER;

  return inputCost + outputCost + cacheCreateCost + cacheReadCost;
}

export function formatCost(cost: number): string {
  if (cost < 0.01) return '';
  return `~$${cost.toFixed(2)}`;
}
