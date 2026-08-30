// Versioned pricing table (Decision 011). Costs in microcents (1e-8 USD)
// per token to avoid float drift; update alongside provider price changes.

export type ModelTier = "fast" | "frontier";

export interface ModelPricing {
  model: string;
  inputMicrocentsPerToken: number;
  outputMicrocentsPerToken: number;
}

// USD per million tokens → microcents per token: $/MTok * 1e8 / 1e6 = $/MTok * 100
export const PRICING_VERSION = "2026-07-18";

export const MODELS: Record<ModelTier, ModelPricing> = {
  // Haiku 4.5: $1 in / $5 out per MTok
  fast: {
    model: "claude-haiku-4-5-20251001",
    inputMicrocentsPerToken: 100,
    outputMicrocentsPerToken: 500,
  },
  // Sonnet 5: $3 in / $15 out per MTok
  frontier: {
    model: "claude-sonnet-5",
    inputMicrocentsPerToken: 300,
    outputMicrocentsPerToken: 1500,
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
  fast: 2048, // Haiku
  frontier: 1024, // Sonnet
};
