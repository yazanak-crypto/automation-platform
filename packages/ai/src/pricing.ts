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
