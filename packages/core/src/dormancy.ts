import { db, messages, orders, runs } from "@platform/db";
import {
  DEFAULT_DORMANCY_SETTINGS,
  dormancySettingsSchema,
  type DormancySettings,
} from "@platform/schemas";
import { and, desc, eq, sql } from "drizzle-orm";

// Dormant items: things the BUSINESS owes a response on.
//
// Every query here is SELECT-only. Nothing in this module calls a model, sends
// a message, or writes a row — surfacing a backlog must not itself cost credits
// or contact a customer.

/** Read the dormancy block out of `workspaces.autonomySettings`, safely. */
export function resolveDormancySettings(autonomySettings: unknown): DormancySettings {
  const raw = (autonomySettings as { dormancy?: unknown } | null | undefined)?.dormancy;
  if (!raw) return DEFAULT_DORMANCY_SETTINGS;
  const parsed = dormancySettingsSchema.safeParse(raw);
  // A malformed blob falls back to the defaults rather than to "never dormant",
  // which would hide the backlog it exists to show.
  return parsed.success ? parsed.data : DEFAULT_DORMANCY_SETTINGS;
}

export interface DormantDraft {
  kind: "draft";
  conversationId: string;
  since: Date;
  preview: string;
  category: string | null;
}

export interface DormantOrder {
  kind: "order";
  orderId: string;
  conversationId: string | null;
  since: Date;
  customerName: string | null;
  pendingReason: string | null;
}

export interface DormantEscalation {
  kind: "escalation";
  conversationId: string;
  since: Date;
  reason: string | null;
  category: string | null;
  /**
   * The owner closed the conversation without ever replying.
   *
   * Still counted — the customer was told a human would follow up, and that
   * did not happen — but labelled distinctly, because "I closed it knowingly"
   * and "I forgot" deserve different words in front of an owner.
   */
  closedWithoutReply: boolean;
}

export type DormantItem = DormantDraft | DormantOrder | DormantEscalation;

/**
 * A human replied.
 *
 * TWO ways to satisfy it, and the second is the subtle one: an approved AI
 * draft is `ai_generated = true` with `approved_by` set. The AI wrote the
 * words, but a person read them and decided to send — that is answering the
 * customer, so it clears the obligation. Requiring a hand-typed message would
 * mark most resolved conversations as neglected.
 *
 * The escalation holding line ("I've passed this to the owner") is
 * ai_generated with NO approver, so it correctly does NOT count. That message
 * is the promise, not the fulfilment.
 */
const HUMAN_REPLIED_SINCE = (conversationCol: string, sinceCol: string) => sql`
  EXISTS (
    SELECT 1 FROM messages m
    WHERE m.conversation_id = ${sql.raw(conversationCol)}
      AND m.direction = 'outbound'
      AND (m.ai_generated = false OR m.approved_by IS NOT NULL)
      AND m.created_at > ${sql.raw(sinceCol)}
  )`;

export async function findDormantItems(
  workspaceId: string,
  settings: DormancySettings,
  limitPerSource = 25,
): Promise<DormantItem[]> {
  const [draftRows, orderRows, escalationRows] = await Promise.all([
    // 1. Drafts queued past the threshold. `pending_approval` is a real state,
    //    so no inference is needed.
    db()
      .select({
        conversationId: messages.conversationId,
        since: messages.createdAt,
        preview: messages.body,
        category: sql<string | null>`(
          SELECT r.category FROM runs r
          WHERE r.conversation_id = ${messages.conversationId}
          ORDER BY r.started_at DESC LIMIT 1)`,
      })
      .from(messages)
      .where(
        and(
          eq(messages.workspaceId, workspaceId),
          eq(messages.draftStatus, "pending_approval"),
          sql`${messages.createdAt} < now() - make_interval(hours => ${settings.draftHours})`,
        ),
      )
      .orderBy(messages.createdAt)
      .limit(limitPerSource),

    // 2. Orders still pending. The DB check constraint on status means no junk
    //    value can hide a row from this filter.
    db()
      .select({
        orderId: orders.id,
        conversationId: orders.conversationId,
        since: orders.createdAt,
        customerName: orders.customerName,
        pendingReason: orders.pendingReason,
      })
      .from(orders)
      .where(
        and(
          eq(orders.workspaceId, workspaceId),
          eq(orders.status, "pending"),
          sql`${orders.createdAt} < now() - make_interval(hours => ${settings.orderHours})`,
        ),
      )
      .orderBy(orders.createdAt)
      .limit(limitPerSource),

    // 3. Escalated, and no human has answered since.
    //
    //    Keyed on `runs`, not `conversations.status`: status is CURRENT state
    //    and gets overwritten by the next event, so escalations vanish from it.
    //    Production shows 13 escalated runs against 1 conversation still marked
    //    waiting_approval. `runs` is the append-only record of what happened,
    //    which is what "we promised and did not deliver" needs.
    db()
      .select({
        conversationId: runs.conversationId,
        since: runs.startedAt,
        reason: sql<string | null>`${runs.outcomeMetrics} ->> 'escalationReason'`,
        category: runs.category,
        closedWithoutReply: sql<boolean>`EXISTS (
          SELECT 1 FROM conversations cv
          WHERE cv.id = ${runs.conversationId} AND cv.status = 'closed')`,
      })
      .from(runs)
      .where(
        and(
          eq(runs.workspaceId, workspaceId),
          eq(runs.action, "escalated"),
          sql`${runs.conversationId} IS NOT NULL`,
          sql`${runs.startedAt} < now() - make_interval(hours => ${settings.escalationHours})`,
          sql`NOT ${HUMAN_REPLIED_SINCE(`runs.conversation_id`, `runs.started_at`)}`,
        ),
      )
      .orderBy(desc(runs.startedAt))
      .limit(limitPerSource),
  ]);

  // One escalated conversation can have several escalated runs; the owner owes
  // one reply, not one per run. Collapse to the OLDEST unanswered escalation,
  // because that is when the promise was made.
  const byConversation = new Map<string, (typeof escalationRows)[number]>();
  for (const r of escalationRows) {
    if (!r.conversationId) continue;
    const seen = byConversation.get(r.conversationId);
    if (!seen || r.since < seen.since) byConversation.set(r.conversationId, r);
  }

  return [
    ...draftRows.map((r) => ({
      kind: "draft" as const,
      conversationId: r.conversationId,
      since: r.since,
      preview: r.preview.slice(0, 200),
      category: r.category,
    })),
    ...orderRows.map((r) => ({
      kind: "order" as const,
      orderId: r.orderId,
      conversationId: r.conversationId,
      since: r.since,
      customerName: r.customerName,
      pendingReason: r.pendingReason,
    })),
    ...[...byConversation.values()].map((r) => ({
      kind: "escalation" as const,
      conversationId: r.conversationId!,
      since: r.since,
      reason: r.reason,
      category: r.category,
      closedWithoutReply: r.closedWithoutReply,
    })),
  ].sort((a, b) => a.since.getTime() - b.since.getTime());
}

/**
 * Which category accounts for most of the dormant backlog.
 *
 * Naming the category is more actionable than "raise autonomy" in general: an
 * owner can turn ONE category auto without loosening anything else. Returns
 * null when nothing dominates, so the banner stays quiet rather than pointing
 * at a category responsible for two items out of twenty.
 */
export function dominantCategory(
  items: readonly DormantItem[],
  minShare = 0.4,
): { category: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const item of items) {
    const category = "category" in item ? item.category : null;
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  let best: { category: string; count: number } | null = null;
  for (const [category, count] of counts) {
    if (!best || count > best.count) best = { category, count };
  }
  if (!best || items.length === 0) return null;
  return best.count / items.length >= minShare ? best : null;
}
