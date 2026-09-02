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

export function estimateCostMicrocents(
  tier: ModelTier,
  tokensIn: number,
  tokensOut: number,
): number {
  const p = MODELS[tier];
  return Math.round(
    tokensIn * p.inputMicrocentsPerToken + tokensOut * p.outputMicrocentsPerToken,
  );
}
