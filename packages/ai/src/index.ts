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
  /**
   * Multimodal content. When present it is sent INSTEAD of `prompt`, so a
   * caller passing images still routes through this gateway and still lands in
   * `ai_calls` (Decisions 003/005/011 — no code path may reach a provider
   * directly). `prompt` stays required as the text fallback and for logging.
   */
  content?: Array<Anthropic.ContentBlockParam>;
  /**
   * Cache the system prompt across calls.
   *
   * Only worth it for a system prompt that is byte-identical call to call — a
   * prompt-version constant, not anything interpolated per request. A cache
   * WRITE costs 1.25x, so caching a prefix used once is a small loss; the win
   * comes from reads at 0.1x.
   *
   * Silently does nothing if the prompt is under the model's minimum cacheable
   * length (MIN_CACHEABLE_TOKENS). That is why the returned usage carries the
   * cache counts and they are stored on ai_calls: "is caching actually working"
   * must be answerable from data rather than assumed.
   */
  cacheSystem?: boolean;
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
  /** Tokens written to the cache on this call (a miss). */
  cacheWriteTokens: number;
  /** Tokens served from the cache on this call (a hit). */
  cacheReadTokens: number;
  estimatedCostMicrocents: number;
  latencyMs: number;
}

/** Thrown when no AI provider is configured — callers degrade gracefully. */
export class AiNotConfiguredError extends Error {
  constructor() {
    super("No AI provider configured (set ANTHROPIC_API_KEY)");
  }
}

/**
 * BYOK seam: the single place an API key is chosen for a workspace. Today it
 * returns the platform key from env; customer-owned keys later plug in here
 * (workspace → stored key) without touching any caller.
 */
export function resolveAiKey(_workspaceId?: string): string | null {
  return process.env.ANTHROPIC_API_KEY ?? null;
}

/** Whether AI features are available at all (platform key or, later, BYOK). */
export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const _clients = new Map<string, Anthropic>();
function clientFor(apiKey: string): Anthropic {
  let c = _clients.get(apiKey);
  if (!c) {
    c = new Anthropic({ apiKey });
    _clients.set(apiKey, c);
  }
  return c;
}

/**
 * The single entry point for every LLM call on the platform.
 * Records model, tokens, estimated cost, latency, and workspace/run
 * attribution to `ai_calls` — including on failure. No other code path
 * may talk to an LLM provider (Decisions 003/005/011).
 */
export async function callAi(call: GatewayCall): Promise<GatewayResult> {
  const apiKey = resolveAiKey(call.workspaceId);
  if (!apiKey) throw new AiNotConfiguredError();
  const { model } = MODELS[call.tier];
  const started = Date.now();
  try {
    // The system prompt becomes a single cacheable block when asked for.
    // Array form is required to attach cache_control at all — a plain string
    // has nowhere to put it.
    const system =
      call.cacheSystem && call.system
        ? [{ type: "text" as const, text: call.system, cache_control: { type: "ephemeral" as const } }]
        : call.system;

    const res = await clientFor(apiKey).messages.create({
      model,
      max_tokens: call.maxTokens ?? 1024,
      system,
      messages: [{ role: "user", content: call.content ?? call.prompt }],
    });
    const latencyMs = Date.now() - started;
    const tokensIn = res.usage.input_tokens;
    const tokensOut = res.usage.output_tokens;
    // Disjoint from tokensIn — the API excludes cached tokens from it.
    const cacheWriteTokens = res.usage.cache_creation_input_tokens ?? 0;
    const cacheReadTokens = res.usage.cache_read_input_tokens ?? 0;
    const cost = estimateCostMicrocents(call.tier, tokensIn, tokensOut, {
      writeTokens: cacheWriteTokens,
      readTokens: cacheReadTokens,
    });
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
      cacheWriteTokens,
      cacheReadTokens,
      estimatedCostMicrocents: cost,
      latencyMs,
      success: true,
    });

    return {
      text,
      model,
      tokensIn,
      tokensOut,
      cacheWriteTokens,
      cacheReadTokens,
      estimatedCostMicrocents: cost,
      latencyMs,
    };
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
