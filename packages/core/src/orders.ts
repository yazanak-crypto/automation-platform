import { db, knowledgeItems, orderItems, orders } from "@platform/db";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { OrderCapture } from "@platform/schemas";

// Order capture: turn an extracted capture into rows, matching the catalog
// SERVER-SIDE. The model never emits ids — a hallucinated uuid would point at
// another workspace's row or at nothing, and neither fails loudly.

export interface CaptureContext {
  workspaceId: string;
  contactId: string;
  conversationId: string;
  sourceMessageId: string;
  captureConfidence: number | null;
}

export interface CapturedOrder {
  orderId: string;
  itemCount: number;
  /** Lines that matched a catalog product. Drives the auto-confirm gate. */
  linkedCount: number;
  /** What the customer will be told was captured, rendered from the SAVED rows. */
  summary: string;
}

/**
 * Match one free-text item name to a catalog product.
 *
 * ILIKE only, deliberately. The catalog lives in knowledge_items with an
 * embedding, but semantic nearest-neighbour will always return SOMETHING — for
 * "a bottle of water" it would happily return the closest dish. A wrong link is
 * worse than no link here, because a linked line is treated as priced and feeds
 * the auto-confirm ceiling. An unmatched line is visible to the owner and
 * blocks auto-confirm; a confidently wrong one is invisible.
 */
async function matchCatalogItem(
  workspaceId: string,
  name: string,
): Promise<{ id: string; title: string; content: string } | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const rows = await db()
    .select({ id: knowledgeItems.id, title: knowledgeItems.title, content: knowledgeItems.content })
    .from(knowledgeItems)
    .where(
      and(
        eq(knowledgeItems.workspaceId, workspaceId),
        eq(knowledgeItems.kind, "product"),
        eq(knowledgeItems.status, "confirmed"),
        or(ilike(knowledgeItems.title, trimmed), ilike(knowledgeItems.title, `%${trimmed}%`)),
      ),
    )
    // Exact title first, then shortest — "Margherita" should beat
    // "Margherita family platter" for the input "margherita".
    .orderBy(sql`lower(${knowledgeItems.title}) = lower(${trimmed}) DESC`, sql`length(${knowledgeItems.title}) ASC`)
    .limit(1);
  return rows[0] ?? null;
}

/** Pull the price line back out of a catalog item's rendered content. */
function priceFromContent(content: string): string | null {
  const line = content.split("\n").find((l) => l.startsWith("Price: "));
  return line ? line.slice("Price: ".length).trim() || null : null;
}

/**
 * Write an order and its items in ONE transaction.
 *
 * Throws on failure — it must never resolve to a half-written order, because
 * the customer acknowledgement is rendered FROM the rows this returns. No rows,
 * no summary, no acknowledgement. That ordering is the whole safety property:
 * a customer can only be told "noted" for an order that demonstrably exists.
 */
export async function captureOrder(
  ctx: CaptureContext,
  capture: OrderCapture,
): Promise<CapturedOrder> {
  const matched = await Promise.all(
    capture.items.map(async (item) => {
      const hit = await matchCatalogItem(ctx.workspaceId, item.name);
      return {
        // The customer's own words are kept even when a catalog row matched —
        // the owner needs to see what was actually said, not our resolution.
        nameText: item.name.trim(),
        quantity: item.quantity,
        notes: item.notes ?? null,
        knowledgeItemId: hit?.id ?? null,
        unitPriceText: hit ? priceFromContent(hit.content) : null,
      };
    }),
  );

  const orderId = await db().transaction(async (tx) => {
    const [row] = await tx
      .insert(orders)
      .values({
        workspaceId: ctx.workspaceId,
        contactId: ctx.contactId,
        conversationId: ctx.conversationId,
        sourceMessageId: ctx.sourceMessageId,
        status: "pending",
        customerName: capture.customerName ?? null,
        requestedForText: capture.requestedForText ?? null,
        notes: capture.notes ?? null,
        captureConfidence: ctx.captureConfidence,
        // total_estimate stays NULL in v1. Catalog prices are free-form strings,
        // and a parse that sometimes fails must read as "unknown" — which the
        // auto-confirm gate treats as a refusal — never as zero.
        totalEstimate: null,
      })
      .returning({ id: orders.id });
    if (!row) throw new Error("Order insert returned no row");

    await tx.insert(orderItems).values(matched.map((m) => ({ orderId: row.id, ...m })));
    return row.id;
  });

  return {
    orderId,
    itemCount: matched.length,
    linkedCount: matched.filter((m) => m.knowledgeItemId).length,
    summary: renderOrderSummary(matched),
  };
}

/** "2× فتوش, 1× Margherita" — built from the persisted lines, never from the model. */
export function renderOrderSummary(
  items: readonly { nameText: string; quantity: number }[],
): string {
  return items.map((i) => `${i.quantity}× ${i.nameText}`).join(", ");
}

/**
 * Apply a quantity change to an order already in flight.
 *
 * Ownership is re-checked here rather than trusted from the model: the id came
 * out of an LLM, and an id that addresses another contact's order would be a
 * cross-customer write. Returns null when the id does not belong to this
 * contact, so the caller can treat it as "no modification" instead of failing.
 */
export async function findModifiableOrder(
  workspaceId: string,
  contactId: string,
  orderId: string,
): Promise<{ id: string; status: string } | null> {
  const rows = await db()
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.workspaceId, workspaceId),
        eq(orders.contactId, contactId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** This contact's orders, newest first. Used by the read path and the tab. */
export async function recentOrdersForContact(contactId: string, limit = 3) {
  return db()
    .select()
    .from(orders)
    .where(eq(orders.contactId, contactId))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}
