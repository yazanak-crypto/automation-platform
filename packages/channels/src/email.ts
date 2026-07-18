import {
  channels,
  connections,
  contacts,
  conversations,
  db,
  messages,
} from "@platform/db";
import { and, desc, eq, sql } from "drizzle-orm";
import type { ChannelAdapter } from "./adapter";
import {
  extractBody,
  getMessage,
  header,
  listRecentInboxIds,
  nangoAccessToken,
  parseAddress,
  ReconnectRequiredError,
  sendReply,
  buildReplyMime,
} from "./gmail";

// EmailAdapter: normalizes Gmail into the SAME Conversation/Message shape as
// web chat. The draft pipeline, autonomy engine, and approval flow never know
// which channel a conversation came from (Decision 007).

export const emailAdapter: ChannelAdapter = {
  type: "email",
  capabilities: { supportsRichText: false },
  async normalizeInbound() {
    throw new Error("Email ingests via the worker poll, not webhooks (M1)");
  },
  async send() {
    throw new Error("Use deliverOutbound()");
  },
};

export interface IngestedEmail {
  conversationId: string;
  messageId: string;
  duplicate: boolean;
}

/**
 * Poll one email channel: fetch recent inbox messages, normalize each into
 * contact/conversation/message. Idempotent via (conversation, clientMessageId
 * = gmail message id) and the per-channel thread index.
 */
export async function pollEmailChannel(channel: {
  id: string;
  workspaceId: string;
  connectionId: string | null;
  config: Record<string, unknown>;
}): Promise<IngestedEmail[]> {
  if (!channel.connectionId) return [];
  const conn = await db()
    .select()
    .from(connections)
    .where(eq(connections.id, channel.connectionId))
    .limit(1);
  if (!conn[0] || conn[0].status !== "active") return [];

  let token: string;
  try {
    token = await nangoAccessToken(conn[0].nangoConnectionId);
  } catch (err) {
    if (err instanceof ReconnectRequiredError) {
      await db()
        .update(connections)
        .set({ status: "needs_reconnect" })
        .where(eq(connections.id, conn[0].id));
      return [];
    }
    throw err;
  }

  const selfEmail = (conn[0].externalAccountLabel ?? "").toLowerCase();
  const ids = await listRecentInboxIds(token);
  const results: IngestedEmail[] = [];

  for (const id of ids) {
    // Cheap pre-check: skip anything we've already stored (any conversation).
    const seen = await db()
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.workspaceId, channel.workspaceId), eq(messages.clientMessageId, id)))
      .limit(1);
    if (seen[0]) continue;

    const full = await getMessage(token, id);
    const from = parseAddress(header(full, "From"));
    if (!from || (selfEmail && from.email === selfEmail)) continue; // own mail
    if (/no-?reply|mailer-daemon|postmaster/i.test(from.email)) continue;
    const body = extractBody(full.payload);
    if (!body) continue;
    const subject = header(full, "Subject") ?? "(no subject)";

    const contact = await upsertEmailContact(channel.workspaceId, from.email, from.name);
    const conversation = await getOrCreateEmailConversation(
      channel.workspaceId,
      channel.id,
      contact.id,
      full.threadId,
    );

    const inserted = await db()
      .insert(messages)
      .values({
        workspaceId: channel.workspaceId,
        conversationId: conversation.id,
        direction: "inbound",
        body: `Subject: ${subject}\n\n${body}`,
        clientMessageId: id,
      })
      .onConflictDoNothing()
      .returning();
    if (!inserted[0]) continue;
    await db()
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, conversation.id));
    results.push({ conversationId: conversation.id, messageId: inserted[0].id, duplicate: false });
  }
  return results;
}

export async function upsertEmailContact(workspaceId: string, email: string, name?: string) {
  const existing = await db()
    .select()
    .from(contacts)
    .where(
      and(eq(contacts.workspaceId, workspaceId), sql`${contacts.identities} ->> 'email' = ${email}`),
    )
    .limit(1);
  if (existing[0]) return existing[0];
  const rows = await db()
    .insert(contacts)
    .values({ workspaceId, displayName: name, identities: { email } })
    .returning();
  return rows[0]!;
}

export async function getOrCreateEmailConversation(
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
  if (!retry[0]) throw new Error("Failed to create email conversation");
  return retry[0];
}

// ── Channel-agnostic outbound delivery ──────────────────────────────────────

/**
 * Deliver an approved/auto-sent outbound message on whatever channel the
 * conversation lives on. Web chat: no-op (widget polls). Email: threaded
 * Gmail reply. Callers never branch on channel type — this does.
 */
export async function deliverOutbound(messageId: string): Promise<void> {
  const rows = await db()
    .select({ message: messages, conversation: conversations, channel: channels })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(channels, eq(channels.id, conversations.channelId))
    .where(eq(messages.id, messageId))
    .limit(1);
  const row = rows[0];
  if (!row) return;
  if (row.channel.type !== "email") return; // web_chat delivers via widget poll

  try {
    if (!row.channel.connectionId || !row.conversation.providerThreadRef) {
      throw new Error("Email channel missing connection or thread ref");
    }
    const conn = await db()
      .select()
      .from(connections)
      .where(eq(connections.id, row.channel.connectionId))
      .limit(1);
    if (!conn[0]) throw new Error("Connection not found");
    const token = await nangoAccessToken(conn[0].nangoConnectionId);

    // Reply headers from the latest inbound message in the thread.
    const lastInbound = await db()
      .select({ id: messages.id, clientMessageId: messages.clientMessageId, body: messages.body })
      .from(messages)
      .where(
        and(eq(messages.conversationId, row.conversation.id), eq(messages.direction, "inbound")),
      )
      .orderBy(desc(messages.createdAt))
      .limit(1);
    let inReplyTo: string | undefined;
    let references: string | undefined;
    let subject = "your message";
    let toEmail: string | undefined;
    if (lastInbound[0]?.clientMessageId) {
      const full = await getMessage(token, lastInbound[0].clientMessageId);
      inReplyTo = header(full, "Message-ID");
      const prior = header(full, "References");
      references = [prior, inReplyTo].filter(Boolean).join(" ") || undefined;
      subject = header(full, "Subject") ?? subject;
      toEmail = parseAddress(header(full, "Reply-To") ?? header(full, "From"))?.email;
    }
    if (!toEmail) {
      const contact = await db()
        .select({ identities: contacts.identities })
        .from(contacts)
        .where(eq(contacts.id, row.conversation.contactId))
        .limit(1);
      toEmail = contact[0]?.identities.email;
    }
    if (!toEmail) throw new Error("No recipient address");

    const raw = buildReplyMime({
      to: toEmail,
      subject,
      body: row.message.body,
      inReplyTo,
      references,
    });
    await sendReply(token, row.conversation.providerThreadRef, raw);
    await db()
      .update(messages)
      .set({ deliveryState: "sent" })
      .where(eq(messages.id, messageId));
  } catch (err) {
    // AC-2.11 honesty: never silent loss.
    await db()
      .update(messages)
      .set({ deliveryState: "failed" })
      .where(eq(messages.id, messageId));
    throw err;
  }
}
