import { boundaries, businessProfiles, db, knowledgeItems } from "@platform/db";
import { and, desc, eq, sql } from "drizzle-orm";

// Context assembly (Decision 008 read protocol). Consumers (the AI gateway
// callers) request needs; we return the pack + the brain version it reflects.
// Only CONFIRMED knowledge and ACTIVE boundaries ever enter a pack.

export type ContextNeed = "voice" | "identity" | "policies" | "boundaries" | "faq_retrieval";

export interface ContextPack {
  identity?: unknown;
  voice?: unknown;
  policies?: unknown;
  boundaries?: string[];
  knowledge?: { title: string; content: string; sourceRef?: string | null }[];
}

export async function getContextPack(
  workspaceId: string,
  needs: ContextNeed[],
  opts: { queryText?: string; knowledgeLimit?: number } = {},
): Promise<{ pack: ContextPack; brainVersion: number }> {
  const profileRows = await db()
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.workspaceId, workspaceId))
    .limit(1);
  const profile = profileRows[0];
  if (!profile) throw new Error(`No business profile for workspace ${workspaceId}`);

  const pack: ContextPack = {};
  if (needs.includes("identity")) pack.identity = profile.identity ?? undefined;
  if (needs.includes("voice")) pack.voice = profile.voice ?? undefined;
  if (needs.includes("policies")) pack.policies = profile.policies ?? undefined;

  if (needs.includes("boundaries")) {
    const rows = await db()
      .select({ ruleText: boundaries.ruleText })
      .from(boundaries)
      .where(and(eq(boundaries.workspaceId, workspaceId), eq(boundaries.active, true)));
    pack.boundaries = rows.map((r) => r.ruleText);
  }

  if (needs.includes("faq_retrieval")) {
    const limit = opts.knowledgeLimit ?? 6;
    const confirmed = and(
      eq(knowledgeItems.workspaceId, workspaceId),
      eq(knowledgeItems.status, "confirmed"),
    );
    let rows: { title: string; content: string; sourceRef: string | null }[];
    if (opts.queryText) {
      // Embedding retrieval when the query has been embedded upstream is a
      // step-7 concern; at step 2 we use recency + plain text match fallback.
      rows = await db()
        .select({
          title: knowledgeItems.title,
          content: knowledgeItems.content,
          sourceRef: knowledgeItems.sourceRef,
        })
        .from(knowledgeItems)
        .where(confirmed)
        .orderBy(
          sql`(${knowledgeItems.title} ILIKE ${"%" + opts.queryText + "%"} OR ${knowledgeItems.content} ILIKE ${"%" + opts.queryText + "%"}) DESC`,
          desc(knowledgeItems.updatedAt),
        )
        .limit(limit);
    } else {
      rows = await db()
        .select({
          title: knowledgeItems.title,
          content: knowledgeItems.content,
          sourceRef: knowledgeItems.sourceRef,
        })
        .from(knowledgeItems)
        .where(confirmed)
        .orderBy(desc(knowledgeItems.updatedAt))
        .limit(limit);
    }
    pack.knowledge = rows;
  }

  return { pack, brainVersion: profile.brainVersion };
}
