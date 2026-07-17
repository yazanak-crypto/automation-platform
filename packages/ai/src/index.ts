import Anthropic from "@anthropic-ai/sdk";
import { aiCalls, db } from "@platform/db";
import { estimateCostMicrocents, MODELS, type ModelTier } from "./pricing";

export * from "./pricing";
export * from "./embed";

export interface GatewayCall {
  workspaceId: string;
  runId?: string;
  promptRef: string;
  promptVersion: string;
  tier: ModelTier;
  system?: string;
  prompt: string;
  maxTokens?: number;
  /** Business Brain context injected by the assembler (Decision 008). Logged verbatim. */
  contextPack?: Record<string, unknown>;
  /** Brain version the context pack was assembled from (Decision 011 refinement). */
  brainVersion?: number;
}

export interface GatewayResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  estimatedCostMicrocents: number;
  latencyMs: number;
}

let _client: Anthropic | undefined;
function client() {
  _client ??= new Anthropic();
  return _client;
}

/**
 * The single entry point for every LLM call on the platform.
 * Records model, tokens, estimated cost, latency, and workspace/run
 * attribution to `ai_calls` — including on failure. No other code path
 * may talk to an LLM provider (Decisions 003/005/011).
 */
export async function callAi(call: GatewayCall): Promise<GatewayResult> {
  const { model } = MODELS[call.tier];
  const started = Date.now();
  try {
    const res = await client().messages.create({
      model,
      max_tokens: call.maxTokens ?? 1024,
      system: call.system,
      messages: [{ role: "user", content: call.prompt }],
    });
    const latencyMs = Date.now() - started;
    const tokensIn = res.usage.input_tokens;
    const tokensOut = res.usage.output_tokens;
    const cost = estimateCostMicrocents(call.tier, tokensIn, tokensOut);
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    await db().insert(aiCalls).values({
      workspaceId: call.workspaceId,
      runId: call.runId,
      model,
      promptRef: call.promptRef,
      promptVersion: call.promptVersion,
      contextPack: call.contextPack,
      brainVersion: call.brainVersion,
      tokensIn,
      tokensOut,
      estimatedCostMicrocents: cost,
      latencyMs,
      success: true,
    });

    return { text, model, tokensIn, tokensOut, estimatedCostMicrocents: cost, latencyMs };
  } catch (err) {
    await db()
      .insert(aiCalls)
      .values({
        workspaceId: call.workspaceId,
        runId: call.runId,
        model,
        promptRef: call.promptRef,
        promptVersion: call.promptVersion,
        contextPack: call.contextPack,
        brainVersion: call.brainVersion,
        tokensIn: 0,
        tokensOut: 0,
        estimatedCostMicrocents: 0,
        latencyMs: Date.now() - started,
        success: false,
        errorSummary: err instanceof Error ? err.message : String(err),
      })
      .catch(() => {
        // Ledger write failing must not mask the original error.
      });
    throw err;
  }
}
