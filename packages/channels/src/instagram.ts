import { channels, connections, contacts, conversations, db, messages } from "@platform/db";
import { and, eq, sql } from "drizzle-orm";
import type { ChannelAdapter, NormalizedMessage } from "./adapter";
import {
  type InstagramInboundEvent,
  metaAccessToken,
  parseInstagramWebhook,
  ReconnectRequiredError,
  sendInstagramMessage,
} from "./meta";

// InstagramAdapter: normalizes Instagram DMs into the SAME
// Conversation/Message shape as web chat and email. The draft pipeline,
// autonomy engine, and approval flow never know which channel a conversation
// came from (Decision 007). Instagram is webhook-driven: the public webhook
// route calls normalizeInbound → ingestInstagramMessage; outbound rides the
// channel-agnostic deliverOutbound().

export const instagramAdapter: ChannelAdapter = {
  type: "instagram",
  capabilities: { supportsRichText: false, replyWindowHours: 24 },
  async normalizeInbound(payload: unknown): Promise<NormalizedMessage[]> {
    return parseInstagramWebhook(payload).map((e) => ({
      channelType: "instagram" as const,
      direction: "inbound" as const,
      externalConversationRef: e.senderId,
      externalMessageRef: e.mid,
      contact: { identity: e.senderId },
      body: e.text,
      receivedAt: e.receivedAt,
    }));
  },
  async send() {
    throw new Error("Use deliverInstagram()/deliverOutbound()");
  },
};

export interface ResolvedInstagramChannel {
  channel: typeof channels.$inferSelect;
  connection: typeof connections.$inferSelect;
}

/** Route an inbound webhook (keyed on the IG business account id) to a channel. */
export async function resolveInstagramChannel(
  igAccountId: string,
): Promise<ResolvedInstagramChannel | null> {
  const rows = await db()
    .select({ channel: channels, connection: connections })
    .from(connections)
    .innerJoin(channels, eq(channels.connectionId, connections.id))
    .where(
      and(
        eq(connections.provider, "instagram"),
        eq(connections.providerAccountId, igAccountId),
        eq(channels.type, "instagram"),
        eq(channels.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export interface IngestedInstagram {
  conversationId: string;
  messageId: string;
  duplicate: boolean;
}

/**
 * Ingest one inbound Instagram DM: upsert contact (by IGSID), get/create the
 * conversation (thread anchored on the IGSID), insert the message. Idempotent
 * via (workspace, clientMessageId = provider mid) — Meta redelivers webhooks.
 */
export async function ingestInstagramMessage(
  channel: typeof channels.$inferSelect,
  event: InstagramInboundEvent,
): Promise<IngestedInstagram | null> {
  // Cheap pre-check: skip anything already stored (Meta retries webhooks).
  const seen = await db()
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.workspaceId, channel.workspaceId), eq(messages.clientMessageId, event.mid)))
    .limit(1);
  if (seen[0]) {
    const convo = await db()
      .select({ conversationId: messages.conversationId })
      .from(messages)
      .where(and(eq(messages.workspaceId, channel.workspaceId), eq(messages.clientMessageId, event.mid)))
      .limit(1);
    return convo[0]
      ? { conversationId: convo[0].conversationId, messageId: seen[0].id, duplicate: true }
      : null;
  }

  const contact = await upsertInstagramContact(channel.workspaceId, event.senderId);
  const conversation = await getOrCreateInstagramConversation(
    channel.workspaceId,
    channel.id,
    contact.id,
    event.senderId,
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
  if (!inserted[0]) return null;

  await db()
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, conversation.id));
  return { conversationId: conversation.id, messageId: inserted[0].id, duplicate: false };
}

export async function upsertInstagramContact(workspaceId: string, igsid: string) {
  // INSERT first, then read — same reasoning as upsertWhatsAppContact. Meta
  // retries webhooks aggressively, and a duplicate contact splits that
  // customer's durable record. `onConflictDoNothing` is only real because of
  // the partial unique index in migration 0020.
  const inserted = await db()
    .insert(contacts)
    .values({ workspaceId, identities: { instagram: igsid } })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];

  const existing = await db()
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        sql`${contacts.identities} ->> 'instagram' = ${igsid}`,
      ),
    )
    .limit(1);
  if (!existing[0]) throw new Error(`Failed to upsert Instagram contact ${igsid}`);
  return existing[0];
}

export async function getOrCreateInstagramConversation(
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
  if (!retry[0]) throw new Error("Failed to create Instagram conversation");
  return retry[0];
}

// ── Outbound delivery (called by the channel-agnostic deliverOutbound) ───────

/** Deliver an approved/auto-sent outbound message as an Instagram DM. */
export async function deliverInstagram(row: {
  message: typeof messages.$inferSelect;
  conversation: typeof conversations.$inferSelect;
  channel: typeof channels.$inferSelect;
}): Promise<void> {
  if (!row.channel.connectionId || !row.conversation.providerThreadRef) {
    throw new Error("Instagram channel missing connection or recipient ref");
  }
  const conn = await db()
    .select()
    .from(connections)
    .where(eq(connections.id, row.channel.connectionId))
    .limit(1);
  if (!conn[0]) throw new Error("Connection not found");
  if (conn[0].status !== "active") {
    throw new ReconnectRequiredError("Instagram connection needs reconnect");
  }
  const token = await metaAccessToken(conn[0].nangoConnectionId, "instagram");
  await sendInstagramMessage(token, row.conversation.providerThreadRef, row.message.body);
}
