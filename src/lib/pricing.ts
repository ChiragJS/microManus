// Model catalog + pricing (USD per 1M tokens). Verified July 2026.
// Cost is computed from the model selected when the API key was added.

export type Provider = "openai" | "anthropic" | "kimi" | "custom";

export interface ModelInfo {
  id: string;
  name: string;
  provider: Provider;
  /** USD per 1M uncached input tokens */
  input: number;
  /** USD per 1M output tokens */
  output: number;
  /** USD per 1M cached/cache-read input tokens */
  cachedInput: number;
}

export const PROVIDERS: Record<
  Provider,
  { name: string; baseUrl: string; keyPlaceholder: string; keyUrl: string }
> = {
  openai: {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    keyPlaceholder: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    keyPlaceholder: "sk-ant-...",
    keyUrl: "https://platform.claude.com/settings/keys",
  },
  kimi: {
    name: "Kimi (Moonshot AI)",
    baseUrl: "https://api.moonshot.ai/v1",
    keyPlaceholder: "sk-...",
    keyUrl: "https://platform.moonshot.ai/console/api-keys",
  },
  custom: {
    name: "Custom (OpenAI-compatible)",
    baseUrl: "",
    keyPlaceholder: "sk-...",
    keyUrl: "",
  },
};

export const MODELS: ModelInfo[] = [
  // Anthropic — native Messages API with prompt caching
  { id: "claude-opus-4-8", name: "Claude Opus 4.8", provider: "anthropic", input: 5, output: 25, cachedInput: 0.5 },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "anthropic", input: 3, output: 15, cachedInput: 0.3 },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "anthropic", input: 1, output: 5, cachedInput: 0.1 },
  // OpenAI — automatic prompt caching, cached tokens in usage.prompt_tokens_details
  { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", provider: "openai", input: 5, output: 30, cachedInput: 0.5 },
  { id: "gpt-5.6-terra", name: "GPT-5.6 Terra", provider: "openai", input: 2.5, output: 15, cachedInput: 0.25 },
  { id: "gpt-5.6-luna", name: "GPT-5.6 Luna", provider: "openai", input: 1, output: 6, cachedInput: 0.1 },
  // Kimi / Moonshot — automatic context caching, OpenAI-compatible
  { id: "kimi-k3", name: "Kimi K3", provider: "kimi", input: 3, output: 15, cachedInput: 0.3 },
  { id: "kimi-k2.6", name: "Kimi K2.6", provider: "kimi", input: 0.95, output: 4, cachedInput: 0.16 },
  { id: "kimi-k2.7-code", name: "Kimi K2.7 Code", provider: "kimi", input: 0.72, output: 3.5, cachedInput: 0.18 },
];

export function modelsForProvider(provider: Provider): ModelInfo[] {
  if (provider === "custom") return MODELS;
  return MODELS.filter((m) => m.provider === provider);
}

export function getModel(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}

export interface TokenUsage {
  inputTokens: number; // uncached input tokens
  outputTokens: number;
  cachedTokens: number; // cache-read input tokens
}

/** USD per 1M tokens for one model — static default or live-resolved. */
export interface ModelRates {
  input: number;
  output: number;
  cachedInput: number;
}

/** Static rates for a model (fallback when no live rates are supplied). */
export function staticRates(modelId: string): ModelRates {
  const m = getModel(modelId);
  const input = m?.input ?? 1;
  return {
    input,
    output: m?.output ?? 5,
    cachedInput: m?.cachedInput ?? input * 0.1,
  };
}

/**
 * Cost in USD for a usage record. Pass `rates` (from src/lib/pricing-live.ts)
 * to price with live data; omitted → static table.
 */
export function calcCost(modelId: string, usage: TokenUsage, rates?: ModelRates): number {
  const r = rates ?? staticRates(modelId);
  return (
    (usage.inputTokens * r.input +
      usage.outputTokens * r.output +
      usage.cachedTokens * r.cachedInput) /
    1_000_000
  );
}

export function costBreakdown(modelId: string, usage: TokenUsage, rates?: ModelRates) {
  const r = rates ?? staticRates(modelId);
  return {
    inputCost: (usage.inputTokens * r.input) / 1_000_000,
    outputCost: (usage.outputTokens * r.output) / 1_000_000,
    cachedCost: (usage.cachedTokens * r.cachedInput) / 1_000_000,
    total: calcCost(modelId, usage, rates),
  };
}
