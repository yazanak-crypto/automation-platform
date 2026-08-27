import { boundaries, businessProfiles, db, knowledgeItems, orderItems, orders } from "@platform/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { renderAnswerFacts } from "./verticals/facts";

// Context assembly (Decision 008 read protocol). Consumers (the AI gateway
// callers) request needs; we return the pack + the brain version it reflects.
// Only CONFIRMED knowledge and ACTIVE boundaries ever enter a pack.

export type ContextNeed =
  | "voice"
  | "identity"
  | "policies"
  | "boundaries"
  | "faq_retrieval"
  | "order_history";

/** One past order, rendered for the prompt. Compact by design — see below. */
export interface OrderHistoryEntry {
  /** The model may cite this in `modifiesOrderId`; the server re-checks it. */
  id: string;
  date: string;
  status: string;
  items: string;
  requestedFor?: string;
}

/**
 * Raised when order history is asked for but cannot be produced.
 *
 * Deliberately a THROW rather than an empty result. An absent key and an empty
 * list must stay distinguishable from a wiring bug: this platform has already
 * shipped a version where dropped facts looked exactly like no facts
 * (answers.vertical resolving to OTHER), and it went unnoticed for weeks
 * because nothing anywhere said "I was asked for this and could not do it".
 */
/** Throws; typed `never` so a guard can PRODUCE a value instead of only asserting one. */
export function contextUnavailable(need: ContextNeed, reason: string): never {
  throw new ContextUnavailableError(need, reason);
}

export class ContextUnavailableError extends Error {
  constructor(need: ContextNeed, reason: string) {
    super(`Context need "${need}" was requested but could not be fulfilled: ${reason}`);
    this.name = "ContextUnavailableError";
  }
}

export interface ContextPack {
  identity?: unknown;
  voice?: unknown;
  policies?: unknown;
  /**
   * This customer's recent orders.
   *
   * THREE STATES, all distinguishable, on purpose:
   *   undefined  — order_history was not requested by this automation
   *   []         — requested, and this customer has none (a first-time buyer)
   *   [ ... ]    — requested and found
   * A throw is the fourth: requested but unfulfillable. Collapsing "asked and
   * got nothing" into "never asked" is exactly how a silently dropped context
   * need hides.
   */
  orderHistory?: OrderHistoryEntry[];
  /** Owner-stated facts from guided setup. Same standing as a confirmed FAQ. */
  businessFacts?: string[];
  boundaries?: string[];
  knowledge?: { title: string; content: string; sourceRef?: string | null }[];
}

export async function getContextPack(
  workspaceId: string,
  needs: ContextNeed[],
  opts: {
    queryText?: string;
    knowledgeLimit?: number;
    /** REQUIRED when "order_history" is among the needs. */
    contactId?: string;
    orderHistoryLimit?: number;
  } = {},
): Promise<{ pack: ContextPack; brainVersion: number }> {
  // Validate the needs/opts contract BEFORE touching the database. A caller
  // that forgot to thread contactId through has a wiring bug, and it should
  // surface as an immediate, named failure rather than after a round of
  // queries — or, worse, as an empty history that reads exactly like a
  // first-time buyer for every customer forever.
  const orderHistoryContactId = needs.includes("order_history")
    ? (opts.contactId ?? contextUnavailable("order_history", "no contactId was supplied"))
    : null;

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

  // Guided-setup answers. Rendered once and split two ways: statements of fact
  // ride with `policies` (an owner's stated hours are exactly that), while
  // "what should your AI never do" becomes a boundary, because it is a rule to
  // obey rather than information to quote. Attached to the EXISTING needs so
  // every automation benefits without editing its contextNeeds.
  const answerFacts = profile.answers ? renderAnswerFacts(profile.answers) : null;
  if (answerFacts?.facts.length && needs.includes("policies")) {
    pack.businessFacts = answerFacts.facts;
  }

  if (needs.includes("boundaries")) {
    const rows = await db()
      .select({ ruleText: boundaries.ruleText })
      .from(boundaries)
      .where(and(eq(boundaries.workspaceId, workspaceId), eq(boundaries.active, true)));
    pack.boundaries = [...rows.map((r) => r.ruleText), ...(answerFacts?.rules ?? [])];
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


  if (needs.includes("order_history")) {
    // Bounded and contact-scoped. Three orders is enough to resolve "same as
    // last time" and "the usual"; the whole table would blow up every prompt.
    const limit = opts.orderHistoryLimit ?? 3;
    const rows = await db()
      .select({
        id: orders.id,
        createdAt: orders.createdAt,
        status: orders.status,
        requestedForText: orders.requestedForText,
      })
      .from(orders)
      .where(and(eq(orders.workspaceId, workspaceId), eq(orders.contactId, orderHistoryContactId!)))
      .orderBy(desc(orders.createdAt))
      .limit(limit);

    const lines = await Promise.all(
      rows.map(async (o) => {
        const items = await db()
          .select({ nameText: orderItems.nameText, quantity: orderItems.quantity })
          .from(orderItems)
          .where(eq(orderItems.orderId, o.id));
        const entry: OrderHistoryEntry = {
          id: o.id,
          date: o.createdAt.toISOString().slice(0, 10),
          status: o.status,
          items: items.map((i) => `${i.quantity}× ${i.nameText}`).join(", "),
        };
        if (o.requestedForText) entry.requestedFor = o.requestedForText;
        return entry;
      }),
    );

    // ALWAYS set, even when empty. The empty array is the signal that the need
    // was honoured and this customer simply has no history.
    pack.orderHistory = lines;
  }

  return { pack, brainVersion: profile.brainVersion };
}
