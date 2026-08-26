import { db, knowledgeItems } from "@platform/db";
import type { CatalogAnswer, CatalogRow } from "../verticals/types";
import { CATALOG_MAX_ITEMS } from "../verticals/types";
import { bumpBrainVersion } from "../version";
import { ensureProfile } from "../service";
import { renderRowContent } from "./rows";

/**
 * Persist a reviewed catalog.
 *
 * Deliberately NOT `createKnowledge()` in a loop: that helper opens a
 * transaction and bumps the brain version per item, so a 300-row menu would be
 * 300 transactions and 300 version bumps — each one invalidating context-pack
 * caching for every conversation in flight. One import is one change, so it is
 * one transaction and one bump.
 *
 * Embeddings are NOT written here. The caller enqueues `brain.embed` per item
 * and the rows land `confirmed` immediately; retrieval has an ILIKE fallback,
 * so items are findable during the backfill rather than invisible until it
 * finishes.
 */
export async function confirmCatalog(
  workspaceId: string,
  rows: readonly CatalogRow[],
  actor: string,
  meta: { source: CatalogAnswer["source"]; sourceName?: string },
): Promise<{ answer: CatalogAnswer; itemIds: string[] }> {
  const usable = rows
    .filter((r) => r.name.trim())
    .slice(0, CATALOG_MAX_ITEMS)
    .map((r) => ({
      workspaceId,
      kind: "product" as const,
      title: r.name.trim().slice(0, 300),
      content: renderRowContent(r).slice(0, 10000),
      provenance: "user_provided" as const,
      status: "confirmed" as const,
      // Provenance the owner can recognise later in the Knowledge view.
      sourceRef: meta.sourceName ? `catalog:${meta.sourceName}` : "catalog:pasted",
    }));

  if (!usable.length) {
    return {
      answer: { count: 0, source: meta.source, sourceName: meta.sourceName, importedAt: new Date().toISOString() },
      itemIds: [],
    };
  }

  await ensureProfile(workspaceId);

  const itemIds = await db().transaction(async (tx) => {
    const inserted = await tx.insert(knowledgeItems).values(usable).returning({ id: knowledgeItems.id });
    await bumpBrainVersion(tx, workspaceId, {
      entity: "knowledge",
      entityId: inserted[0]!.id,
      changeKind: "create",
      // The diff records the shape of the import, not every row — the change
      // log is for "what happened", and the rows themselves are queryable.
      diff: { new: { imported: inserted.length, source: meta.source, sourceName: meta.sourceName } },
      actor,
    });
    return inserted.map((r) => r.id);
  });

  return {
    answer: {
      count: itemIds.length,
      source: meta.source,
      sourceName: meta.sourceName,
      importedAt: new Date().toISOString(),
    },
    itemIds,
  };
}
