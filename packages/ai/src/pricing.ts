// Versioned pricing table (Decision 011). Costs in microcents (1e-8 USD)
// per token to avoid float drift; update alongside provider price changes.

export type ModelTier = "fast" | "frontier";

export interface ModelPricing {
  model: string;
  inputMicrocentsPerToken: number;
  outputMicrocentsPerToken: number;
}

// USD per million tokens → microcents per token: $/MTok * 1e8 / 1e6 = $/MTok * 100
//
// ⚠️ Rows in ai_calls written BEFORE this version use the OLD rates. Sonnet 5
// was priced here at $3/$15 from the beginning until 2026-09-02, when it was
// corrected to its actual list price of $2/$10 — so every stored
// estimated_cost_microcents for a frontier-tier call before that date is
// inflated by exactly 1.5x.
//
// Those rows are deliberately NOT backfilled. They are a ledger of what we
// believed a call cost when we made it, and rewriting them to match a later
// price table would erase the only record that the error happened. When
// querying historical cost: divide a pre-correction frontier row by 1.5, and
// never average across the boundary without splitting on created_at.
export const PRICING_VERSION = "2026-09-02";

export const MODELS: Record<ModelTier, ModelPricing> = {
  // Haiku 4.5: $1 in / $5 out per MTok
  fast: {
    model: "claude-haiku-4-5-20251001",
    inputMicrocentsPerToken: 100,
    outputMicrocentsPerToken: 500,
  },
  // Sonnet 5: $2 in / $10 out per MTok
  frontier: {
    model: "claude-sonnet-5",
    inputMicrocentsPerToken: 200,
    outputMicrocentsPerToken: 1000,
  },
};

/**
 * Prompt-cache multipliers, applied to the tier's INPUT rate.
 *
 * Writing a cache entry costs 25% more than sending the tokens normally;
 * reading one costs 10% of normal. So caching is a loss on a prefix used once
 * and a large win on one reused — which is why it is applied to the system
 * prompt (byte-identical on every call for a prompt version) and nothing else.
 */
export const CACHE_WRITE_MULTIPLIER = 1.25;
export const CACHE_READ_MULTIPLIER = 0.1;

export interface TokenUsage {
  tokensIn: number;
  tokensOut: number;
  /** Tokens written into the cache on this call, billed at 1.25x input. */
  cacheWriteTokens?: number;
  /** Tokens served from cache on this call, billed at 0.1x input. */
  cacheReadTokens?: number;
}

/**
 * Cost of one call.
 *
 * `tokensIn` from the API EXCLUDES anything served from or written to the
 * cache — the three counts are disjoint, so they are summed rather than
 * reconciled. Getting that wrong would double-count the system prompt on every
 * cached call and make caching look like it increased cost.
 */
export function estimateCostMicrocents(
  tier: ModelTier,
  tokensIn: number,
  tokensOut: number,
  cache?: { writeTokens?: number; readTokens?: number },
): number {
  const p = MODELS[tier];
  const write = cache?.writeTokens ?? 0;
  const read = cache?.readTokens ?? 0;
  return Math.round(
    tokensIn * p.inputMicrocentsPerToken +
      write * p.inputMicrocentsPerToken * CACHE_WRITE_MULTIPLIER +
      read * p.inputMicrocentsPerToken * CACHE_READ_MULTIPLIER +
      tokensOut * p.outputMicrocentsPerToken,
  );
}

/**
 * Smallest prefix Anthropic will cache, per model family. Below this the
 * cache_control marker is accepted and silently does nothing — which is the
 * failure mode worth knowing about, because it looks exactly like success.
 */
export const MIN_CACHEABLE_TOKENS: Record<ModelTier, number> = {
  // Haiku 4.5 is 4096, not the 2048 this said — the minimum is NOT monotonic
  // across model generations, so it cannot be inferred from the tier's age.
  // At 2048 a 3K-token prefix looked cacheable on the fast tier and would have
  // been silently ignored: exactly the failure this table exists to prevent.
  fast: 4096, // Haiku 4.5
  frontier: 1024, // Sonnet 5
};
