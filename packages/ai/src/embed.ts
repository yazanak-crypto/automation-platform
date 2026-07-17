import { aiCalls, db } from "@platform/db";

// Embeddings via Voyage AI (voyage-3.5-lite, 1024 dims). Optional in dev:
// without VOYAGE_API_KEY we return null and knowledge stays unembedded
// (retrieval degrades gracefully; nothing breaks).

const EMBED_MODEL = "voyage-3.5-lite";
// $0.02 per MTok → 2 microcents per 1k tokens ≈ 0.002/token
const EMBED_MICROCENTS_PER_TOKEN = 2;

export async function embed(
  workspaceId: string,
  text: string,
): Promise<number[] | null> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) return null;

  const started = Date.now();
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: [text.slice(0, 16000)] }),
  });
  if (!res.ok) throw new Error(`Voyage embeddings failed: ${res.status}`);
  const data = (await res.json()) as {
    data: { embedding: number[] }[];
    usage: { total_tokens: number };
  };
  const tokens = data.usage.total_tokens;

  await db().insert(aiCalls).values({
    workspaceId,
    model: EMBED_MODEL,
    promptRef: "embed/knowledge",
    promptVersion: "v1",
    tokensIn: tokens,
    tokensOut: 0,
    estimatedCostMicrocents: Math.round(tokens * EMBED_MICROCENTS_PER_TOKEN),
    latencyMs: Date.now() - started,
    success: true,
  });

  return data.data[0]?.embedding ?? null;
}
