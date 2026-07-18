import { aiConfigured, callAi } from "@platform/ai";
import { businessProfiles, db, knowledgeItems } from "@platform/db";
import { draftProfileOutputSchema, type DraftProfileOutput } from "@platform/schemas";
import { eq } from "drizzle-orm";
import {
  DRAFT_PROFILE_PROMPT_REF,
  DRAFT_PROFILE_PROMPT_VERSION,
  DRAFT_PROFILE_SYSTEM,
  draftProfileUserPrompt,
} from "./prompts";
import { scrapeSite } from "./scrape";
import { ensureProfile } from "./service";
import { bumpBrainVersion } from "./version";

export interface IngestResult {
  outcome: "drafted" | "nothing_found";
  pagesRead: number;
  faqsSuggested: number;
  productsSuggested: number;
}

function parseModelJson(text: string): DraftProfileOutput | null {
  const raw = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return draftProfileOutputSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * brain.ingest job body (plan §3). Everything the model produces lands as
 * ai_inferred/suggested or as a draft_ready profile the user must review —
 * this function is structurally incapable of confirming anything.
 */
export async function runIngest(workspaceId: string, url: string): Promise<IngestResult> {
  await ensureProfile(workspaceId);

  // AI optional: without a provider we skip drafting entirely — the user
  // fills the brain manually (same soft path as an unreadable site).
  if (!aiConfigured()) {
    await db()
      .update(businessProfiles)
      .set({ identity: { url }, onboardingStatus: "draft_ready", updatedAt: new Date() })
      .where(eq(businessProfiles.workspaceId, workspaceId));
    return { outcome: "nothing_found", pagesRead: 0, faqsSuggested: 0, productsSuggested: 0 };
  }

  const pages = await scrapeSite(url);
  const usable = pages.filter((p) => p.text.length > 100);

  if (usable.length === 0) {
    // Soft outcome: user fills the brain manually (AC-1.6 path).
    await db()
      .update(businessProfiles)
      .set({
        identity: { url },
        onboardingStatus: "draft_ready",
        updatedAt: new Date(),
      })
      .where(eq(businessProfiles.workspaceId, workspaceId));
    return { outcome: "nothing_found", pagesRead: 0, faqsSuggested: 0, productsSuggested: 0 };
  }

  const { brainVersion } = await currentVersion(workspaceId);
  const res = await callAi({
    workspaceId,
    promptRef: DRAFT_PROFILE_PROMPT_REF,
    promptVersion: DRAFT_PROFILE_PROMPT_VERSION,
    tier: "frontier",
    system: DRAFT_PROFILE_SYSTEM,
    prompt: draftProfileUserPrompt(usable),
    maxTokens: 4096,
    brainVersion,
  });

  let draft = parseModelJson(res.text);
  if (!draft) {
    // One repair attempt (plan §5).
    const repair = await callAi({
      workspaceId,
      promptRef: DRAFT_PROFILE_PROMPT_REF,
      promptVersion: `${DRAFT_PROFILE_PROMPT_VERSION}-repair`,
      tier: "frontier",
      system: "Return ONLY the corrected JSON object. No prose, no code fences.",
      prompt: `This JSON failed validation. Fix it to match the required schema:\n\n${res.text}`,
      maxTokens: 4096,
      brainVersion,
    });
    draft = parseModelJson(repair.text);
  }
  if (!draft) {
    throw new Error("Draft profile output failed validation after repair attempt");
  }
  const parsed = draft;

  await db().transaction(async (tx) => {
    await tx
      .update(businessProfiles)
      .set({
        identity: { ...parsed.identity, url },
        voice: parsed.voice,
        policies: parsed.policies,
        onboardingStatus: "draft_ready",
        updatedAt: new Date(),
      })
      .where(eq(businessProfiles.workspaceId, workspaceId));

    const items = [
      ...parsed.faqs.map((f) => ({
        workspaceId,
        kind: "faq" as const,
        title: f.question,
        content: f.answer,
        sourceRef: f.sourceUrl ?? url,
      })),
      ...parsed.products.map((p) => ({
        workspaceId,
        kind: "product" as const,
        title: p.name,
        content: p.description,
        sourceRef: p.sourceUrl ?? url,
      })),
    ].map((i) => ({ ...i, provenance: "ai_inferred" as const, status: "suggested" as const }));

    if (items.length > 0) await tx.insert(knowledgeItems).values(items);

    await bumpBrainVersion(tx, workspaceId, {
      entity: "profile",
      changeKind: "update",
      diff: {
        new: {
          source: "ingest",
          url,
          pagesRead: usable.length,
          faqsSuggested: parsed.faqs.length,
          productsSuggested: parsed.products.length,
        },
      },
      actor: "system:ingest",
    });
  });

  return {
    outcome: "drafted",
    pagesRead: usable.length,
    faqsSuggested: parsed.faqs.length,
    productsSuggested: parsed.products.length,
  };
}

async function currentVersion(workspaceId: string) {
  const rows = await db()
    .select({ brainVersion: businessProfiles.brainVersion })
    .from(businessProfiles)
    .where(eq(businessProfiles.workspaceId, workspaceId))
    .limit(1);
  return { brainVersion: rows[0]?.brainVersion ?? 1 };
}
