import { channels, connections, contacts, conversations, db, messages } from "@platform/db";
import { and, eq, sql } from "drizzle-orm";
import type { ChannelAdapter, NormalizedMessage } from "./adapter";
import {
  OutsideServiceWindowError,
  parseWhatsAppWebhook,
  sendWhatsAppMessage,
  type WhatsAppInboundEvent,
  whatsappCredentials,
} from "./meta";

// WhatsAppAdapter: normalizes WhatsApp Cloud API messages into the SAME
// Conversation/Message shape as web chat, email, and Instagram. The draft
// pipeline, autonomy engine, and approval flow never learn which channel a
// conversation came from (Decision 007).
//
// Credentials differ from every other Meta channel: WhatsApp uses a long-lived
// System User token for one Business Account, read from env, not a per-workspace
// Nango OAuth connection. Routing still goes through the `connections` row so
// that moving to per-customer numbers later (Embedded Signup) is a data change
// rather than a rewrite — see resolveWhatsAppChannel.

export const whatsappAdapter: ChannelAdapter = {
  type: "whatsapp",
  capabilities: { supportsRichText: false, replyWindowHours: 24 },
  async normalizeInbound(payload: unknown): Promise<NormalizedMessage[]> {
    return parseWhatsAppWebhook(payload).events.map((e) => ({
      channelType: "whatsapp" as const,
      direction: "inbound" as const,
      externalConversationRef: e.waId,
      externalMessageRef: e.mid,
      contact: { identity: e.waId },
      body: e.text,
      receivedAt: e.receivedAt,
    }));
  },
  async send() {
    throw new Error("Use deliverWhatsApp()/deliverOutbound()");
  },
};

export interface ResolvedWhatsAppChannel {
  channel: typeof channels.$inferSelect;
  connection: typeof connections.$inferSelect;
}

/**
 * Route an inbound webhook to a channel using the business phone number id.
 *
 * Deliberately keyed on the id from the PAYLOAD rather than the env var: today
 * one platform-owned number serves everyone, but when customers bring their own
 * numbers this same lookup keeps working — only the rows change.
 */
export async function resolveWhatsAppChannel(
  phoneNumberId: string,
): Promise<ResolvedWhatsAppChannel | null> {
  const rows = await db()
    .select({ channel: channels, connection: connections })
    .from(connections)
    .innerJoin(channels, eq(channels.connectionId, connections.id))
    .where(
      and(
        eq(connections.provider, "whatsapp"),
        eq(connections.providerAccountId, phoneNumberId),
        eq(channels.type, "whatsapp"),
        eq(channels.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export interface IngestedWhatsApp {
  conversationId: string;
  messageId: string;
  duplicate: boolean;
}

/**
 * Ingest one inbound WhatsApp message: upsert contact (by wa_id), get/create
 * the conversation (anchored on wa_id), insert the message.
 *
 * Idempotency matters more here than anywhere else: Meta retries webhooks
 * aggressively, and a duplicate inbound row means a duplicate draft, which for
 * an auto-send workspace means the customer gets answered twice. Two layers
 * guard it — a cheap pre-check, then `messages_conversation_client_idx`
 * (unique on conversation_id + client_message_id) catching anything that races
 * past it. Because the conversation is derived deterministically from wa_id,
 * concurrent retries always collide on that index rather than slipping through.
 */
export async function ingestWhatsAppMessage(
  channel: typeof channels.$inferSelect,
  event: WhatsAppInboundEvent,
): Promise<IngestedWhatsApp | null> {
  const seen = await db()
    .select({ id: messages.id, conversationId: messages.conversationId })
    .from(messages)
    .where(
      and(eq(messages.workspaceId, channel.workspaceId), eq(messages.clientMessageId, event.mid)),
    )
    .limit(1);
  if (seen[0]) {
    return {
      conversationId: seen[0].conversationId,
      messageId: seen[0].id,
      duplicate: true,
    };
  }

  const contact = await upsertWhatsAppContact(channel.workspaceId, event.waId, event.senderName);
  const conversation = await getOrCreateWhatsAppConversation(
    channel.workspaceId,
    channel.id,
    contact.id,
    event.waId,
  );

  const inserted = await db()
    .insert(messages)
    .values({
      workspaceId: channel.workspaceId,
      conversationId: conversation.id,
      direction: "inbound",
      body: event.text,
      clientMessageId: event.mid,
    })
    .onConflictDoNothing()
    .returning();
  // Lost the race with a concurrent redelivery — it already stored this one.
  if (!inserted[0]) return null;

  await db()
    .update(conversations)
    .set({ lastMessageAt: event.receivedAt })
    .where(eq(conversations.id, conversation.id));
  return { conversationId: conversation.id, messageId: inserted[0].id, duplicate: false };
}

export async function upsertWhatsAppContact(
  workspaceId: string,
  waId: string,
  displayName?: string,
) {
  const existing = await db()
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        sql`${contacts.identities} ->> 'whatsapp' = ${waId}`,
      ),
    )
    .limit(1);
  if (existing[0]) {
    // Backfill a name we didn't have on first contact; never overwrite one.
    if (displayName && !existing[0].displayName) {
      const updated = await db()
        .update(contacts)
        .set({ displayName })
        .where(eq(contacts.id, existing[0].id))
        .returning();
      return updated[0] ?? existing[0];
    }
    return existing[0];
  }
  const rows = await db()
    .insert(contacts)
    .values({ workspaceId, displayName, identities: { whatsapp: waId } })
    .returning();
  return rows[0]!;
}

export async function getOrCreateWhatsAppConversation(
  workspaceId: string,
  channelId: string,
  contactId: string,
  threadRef: string,
) {
  const existing = await db()
    .select()
    .from(conversations)
    .where(
      and(eq(conversations.channelId, channelId), eq(conversations.providerThreadRef, threadRef)),
    )
    .limit(1);
  if (existing[0]) return existing[0];
  const rows = await db()
    .insert(conversations)
    .values({ workspaceId, channelId, contactId, providerThreadRef: threadRef })
    .onConflictDoNothing()
    .returning();
  if (rows[0]) return rows[0];
  const retry = await db()
    .select()
    .from(conversations)
    .where(
      and(eq(conversations.channelId, channelId), eq(conversations.providerThreadRef, threadRef)),
    )
    .limit(1);
  if (!retry[0]) throw new Error("Failed to create WhatsApp conversation");
  return retry[0];
}

// ── Outbound delivery (called by the channel-agnostic deliverOutbound) ───────

/** Deliver an approved/auto-sent outbound message as a WhatsApp reply. */
export async function deliverWhatsApp(row: {
  message: typeof messages.$inferSelect;
  conversation: typeof conversations.$inferSelect;
  channel: typeof channels.$inferSelect;
}): Promise<void> {
  if (!row.conversation.providerThreadRef) {
    throw new Error("WhatsApp conversation missing recipient wa_id");
  }
  const creds = whatsappCredentials();
  if (!creds) {
    throw new Error(
      "WhatsApp is not configured: set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.",
    );
  }
  // Send from the number this conversation actually arrived on, so a future
  // multi-number setup can't reply from the wrong business identity.
  const conn = row.channel.connectionId
    ? (
        await db()
          .select()
          .from(connections)
          .where(eq(connections.id, row.channel.connectionId))
          .limit(1)
      )[0]
    : undefined;
  const phoneNumberId = conn?.providerAccountId ?? creds.phoneNumberId;

  await sendWhatsAppMessage(
    { ...creds, phoneNumberId },
    row.conversation.providerThreadRef,
    row.message.body,
  );
}

export { OutsideServiceWindowError };
