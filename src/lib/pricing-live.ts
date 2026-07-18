// Live model pricing — server only.
//
// No LLM provider exposes a pricing API (verified July 2026: OpenAI, Anthropic
// and Moonshot models endpoints carry no price fields), so live rates come from
// two community-maintained sources, cached for 24h via the Next.js data cache:
//   1. LiteLLM's price JSON — exact Anthropic model ids, $/token keys
//   2. OpenRouter /api/v1/models — broad OpenAI/Kimi coverage, aliased ids
// Anything unresolved falls back to the static table in src/lib/pricing.ts.
// Cost calculation NEVER blocks on the network: failures → static rates.

import { MODELS, staticRates, type ModelRates } from "./pricing";

const LITELLM_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/models";
const REVALIDATE_SECONDS = 86_400; // daily

/** our model id -> OpenRouter id prefix (OpenRouter appends dated suffixes). */
const OPENROUTER_ALIASES: Record<string, string> = {
  "claude-opus-4-8": "anthropic/claude-opus-4.8",
  "claude-sonnet-4-6": "anthropic/claude-sonnet-4.6",
  "claude-haiku-4-5": "anthropic/claude-haiku-4.5",
  "gpt-5.6-sol": "openai/gpt-5.6-sol",
  "gpt-5.6-terra": "openai/gpt-5.6-terra",
  "gpt-5.6-luna": "openai/gpt-5.6-luna",
  "kimi-k3": "moonshotai/kimi-k3",
  "kimi-k2.6": "moonshotai/kimi-k2.6",
  "kimi-k2.7-code": "moonshotai/kimi-k2.7-code",
};

export interface ResolvedRates extends ModelRates {
  /** where the numbers came from */
  source: "litellm" | "openrouter" | "static";
}

export type PricingTable = Record<string, ResolvedRates>;

function sane(r: ModelRates): boolean {
  const ok = (n: number) => Number.isFinite(n) && n > 0 && n < 1000;
  return ok(r.input) && ok(r.output) && r.cachedInput >= 0 && r.cachedInput < 1000;
}

async function fromLiteLlm(): Promise<Map<string, ModelRates>> {
  const out = new Map<string, ModelRates>();
  try {
    const res = await fetch(LITELLM_URL, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) return out;
    const data = (await res.json()) as Record<
      string,
      {
        input_cost_per_token?: number;
        output_cost_per_token?: number;
        cache_read_input_token_cost?: number;
      }
    >;
    for (const m of MODELS) {
      const entry = data[m.id];
      if (!entry?.input_cost_per_token || !entry?.output_cost_per_token) continue;
      const rates: ModelRates = {
        input: entry.input_cost_per_token * 1_000_000,
        output: entry.output_cost_per_token * 1_000_000,
        cachedInput: (entry.cache_read_input_token_cost ?? entry.input_cost_per_token * 0.1) * 1_000_000,
      };
      if (sane(rates)) out.set(m.id, rates);
    }
  } catch {
    // network failure → empty map, caller falls back
  }
  return out;
}

async function fromOpenRouter(): Promise<Map<string, ModelRates>> {
  const out = new Map<string, ModelRates>();
  try {
    const res = await fetch(OPENROUTER_URL, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) return out;
    const data = (await res.json()) as {
      data?: {
        id: string;
        pricing?: {
          prompt?: string;
          completion?: string;
          input_cache_read?: string;
        };
      }[];
    };
    const models = data.data ?? [];
    for (const [ourId, alias] of Object.entries(OPENROUTER_ALIASES)) {
      // Exact id first, then dated variants like "moonshotai/kimi-k3-20260715".
      const hit =
        models.find((m) => m.id === alias) ??
        models.find((m) => m.id.startsWith(`${alias}-`));
      const p = hit?.pricing;
      if (!p?.prompt || !p?.completion) continue;
      const input = parseFloat(p.prompt) * 1_000_000;
      const output = parseFloat(p.completion) * 1_000_000;
      const cachedRaw = p.input_cache_read ? parseFloat(p.input_cache_read) * 1_000_000 : NaN;
      const rates: ModelRates = {
        input,
        output,
        cachedInput: Number.isFinite(cachedRaw) && cachedRaw >= 0 ? cachedRaw : input * 0.1,
      };
      if (sane(rates)) out.set(ourId, rates);
    }
  } catch {
    // network failure → empty map, caller falls back
  }
  return out;
}

/**
 * Resolve the full pricing table: LiteLLM (exact ids, preferred) → OpenRouter
 * (aliased) → static fallback. Cached daily by the Next data cache.
 */
export async function getLivePricing(): Promise<PricingTable> {
  const [litellm, openrouter] = await Promise.all([fromLiteLlm(), fromOpenRouter()]);
  const table: PricingTable = {};
  for (const m of MODELS) {
    const ll = litellm.get(m.id);
    const or = openrouter.get(m.id);
    if (ll) table[m.id] = { ...ll, source: "litellm" };
    else if (or) table[m.id] = { ...or, source: "openrouter" };
    else table[m.id] = { ...staticRates(m.id), source: "static" };
  }
  return table;
}

/** Rates for one model — never throws, never blocks beyond the cached fetches. */
export async function getLiveRates(modelId: string): Promise<ResolvedRates> {
  try {
    const table = await getLivePricing();
    return table[modelId] ?? { ...staticRates(modelId), source: "static" };
  } catch {
    return { ...staticRates(modelId), source: "static" };
  }
}
