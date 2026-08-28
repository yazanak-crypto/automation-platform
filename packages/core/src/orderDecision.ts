import {
  businessProfiles,
  contacts,
  conversations,
  db,
  messages,
  orderItems,
  orders,
} from "@platform/db";
import { and, desc, eq } from "drizzle-orm";
import {
  pickAckLanguage,
  renderCancellation,
  renderConfirmation,
  type AckLanguage,
} from "./orderMessages";
import { renderOrderSummary } from "./orders";

// Confirming or cancelling an order, and telling the customer.
//
// The decision and the notification are SEPARATE facts that can disagree. The
// owner's decision is real the moment they make it; whether the customer heard
// about it is a different question with its own answer, and the tab shows both.

export interface OrderDetail {
  order: typeof orders.$inferSelect;
  items: (typeof orderItems.$inferSelect)[];
  contact: { id: string; displayName: string | null };
  summary: string;
  /**
   * The EXACT text that will be sent if the owner accepts the default.
   *
   * Rendered here, server-side, and handed to the dialog to display and edit.
   * The client never composes this itself — if it did, the preview and the sent
   * message would be two different renders that could drift apart, and the
   * owner would be approving text that is not what goes out.
   */
  defaultMessages: { confirm: string; cancel: string };
}

/** Resolve the frame language the same way the acknowledgement did. */
async function languageFor(
  order: typeof orders.$inferSelect,
  businessLanguages: string[],
): Promise<AckLanguage> {
  // The customer's own last inbound message drives it, so a decision reply
  // matches the language the conversation was actually held in.
  let isRtl = false;
  if (order.conversationId) {
    const rows = await db()
      .select({ body: messages.body })
      .from(messages)
      .where(and(eq(messages.conversationId, order.conversationId), eq(messages.direction, "inbound")))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    const body = rows[0]?.body ?? "";
    // Inlined rather than importing fieldDirection: brain depends on core, so
    // core cannot import brain. Same first-strong-character rule; the shared
    // implementation and its tests live in @platform/brain/catalog/rows.
    const rtl = body.search(/[֐-׿؀-ٟ٪-ۯۺ-ۿ܀-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/);
    const ltr = body.search(/[A-Za-zÀ-ɏ]/);
    isRtl = rtl !== -1 && (ltr === -1 || rtl < ltr);
  }
  return pickAckLanguage({ businessLanguages, customerMessageIsRtl: isRtl });
}

/** The business's own name and reply languages, read once. */
async function businessProfileFor(
  workspaceId: string,
): Promise<{ name: string; languages: string[] }> {
  const rows = await db()
    .select({ identity: businessProfiles.identity, answers: businessProfiles.answers })
    .from(businessProfiles)
    .where(eq(businessProfiles.workspaceId, workspaceId))
    .limit(1);
  const v = rows[0]?.answers?.values?.languages;
  return {
    // Falls back to a neutral noun rather than an empty string: a message
    // reading "  will confirm shortly" is worse than a slightly generic one.
    name: rows[0]?.identity?.businessName?.trim() || "The team",
    languages: Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [],
  };
}

export async function getOrderDetail(
  workspaceId: string,
  orderId: string,
): Promise<OrderDetail | null> {
  const rows = await db()
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.workspaceId, workspaceId)))
    .limit(1);
  const order = rows[0];
  if (!order) return null;

  const items = await db().select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const contactRows = await db()
    .select({ id: contacts.id, displayName: contacts.displayName })
    .from(contacts)
    .where(eq(contacts.id, order.contactId))
    .limit(1);

  const summary = renderOrderSummary(items);
  const profile = await businessProfileFor(workspaceId);
  const language = await languageFor(order, profile.languages);
  const args = { summary, businessName: profile.name, language };

  return {
    order,
    items,
    contact: contactRows[0] ?? { id: order.contactId, displayName: null },
    summary,
    defaultMessages: {
      confirm: renderConfirmation(args),
      cancel: renderCancellation(args),
    },
  };
}

export interface DecisionResult {
  status: "confirmed" | "cancelled";
  /** True only when the customer's message actually left. */
  notified: boolean;
  /** Present when the decision stuck but the notification did not. */
  notifyError?: string;
}

/**
 * Record the owner's decision, then tell the customer.
 *
 * The decision is committed FIRST and separately: it is the owner's, and it
 * stands whether or not a network call succeeds afterwards. What must never
 * happen is the reverse — the tab showing "confirmed" while the owner believes
 * a customer was notified who was not. So a failed send is written back onto
 * the order as `decision_notify_error`, with `decision_notified_at` left NULL,
 * and the tab renders that pairing as its own state.
 *
 * `messageBody` is sent VERBATIM. It is whatever the owner had in front of them
 * in the dialog — edited or not — so the approved text and the sent text cannot
 * diverge.
 */
export async function decideOrder(input: {
  workspaceId: string;
  orderId: string;
  userId: string;
  action: "confirm" | "cancel";
  messageBody: string;
  deliver: (messageId: string) => Promise<void>;
}): Promise<DecisionResult | null> {
  const detail = await getOrderDetail(input.workspaceId, input.orderId);
  if (!detail) return null;
  const status = input.action === "confirm" ? "confirmed" : "cancelled";

  // Decision + outbound message row in ONE transaction. The message exists in
  // the thread even if delivery later fails, so the owner can see exactly what
  // was meant to go out and retry it.
  const messageId = await db().transaction(async (tx) => {
    let createdMessageId: string | null = null;
    if (detail.order.conversationId) {
      const [m] = await tx
        .insert(messages)
        .values({
          workspaceId: input.workspaceId,
          conversationId: detail.order.conversationId,
          direction: "outbound",
          body: input.messageBody,
          aiGenerated: false,
          draftStatus: "approved",
          approvedBy: input.userId,
          approvedAt: new Date(),
          deliveryState: "visible",
        })
        .returning({ id: messages.id });
      createdMessageId = m?.id ?? null;
    }

    await tx
      .update(orders)
      .set({
        status,
        decidedBy: input.userId,
        decidedAt: new Date(),
        decisionMessageId: createdMessageId,
        // Explicitly cleared: a retry of a previously failed notification must
        // not leave the old error sitting next to a fresh success.
        decisionNotifyError: null,
        decisionNotifiedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, detail.order.id));

    if (detail.order.conversationId) {
      await tx
        .update(conversations)
        .set({ status: "open", attentionReason: null, lastMessageAt: new Date() })
        .where(eq(conversations.id, detail.order.conversationId));
    }
    return createdMessageId;
  });

  if (!messageId) {
    // No conversation to reply on. The decision stands; there is nobody to tell.
    await db()
      .update(orders)
      .set({ decisionNotifyError: "No conversation to reply on" })
      .where(eq(orders.id, detail.order.id));
    return { status, notified: false, notifyError: "No conversation to reply on" };
  }

  try {
    await input.deliver(messageId);
    await db()
      .update(orders)
      .set({ decisionNotifiedAt: new Date(), decisionNotifyError: null })
      .where(eq(orders.id, detail.order.id));
    return { status, notified: true };
  } catch (err) {
    const notifyError = err instanceof Error ? err.message : String(err);
    // Recorded on the ORDER, not only in the log. The owner is the person who
    // needs to know their customer was not told.
    await db()
      .update(orders)
      .set({ decisionNotifyError: notifyError })
      .where(eq(orders.id, detail.order.id));
    return { status, notified: false, notifyError };
  }
}
