import {
  channels,
  contacts,
  conversations,
  db,
  messages,
} from "@platform/db";
import { and, count, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { ChannelAdapter } from "./adapter";

// WebChat channel domain logic (plan §1b, §3, §4). The visitor id is an opaque
// bearer token: it grants access to that visitor's own thread on one channel,
// nothing else.

const VISITOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isValidVisitorId = (v: string) => VISITOR_ID_RE.test(v);

/** Origin allowlist check — exact origin match after normalization. */
export function originAllowed(origin: string | null, allowed: string[] | undefined): boolean {
  if (!origin || !allowed || allowed.length === 0) return false;
  const norm = (s: string) => {
    try {
      const u = new URL(s.includes("://") ? s : `https://${s}`);
      return `${u.protocol}//${u.host}`.toLowerCase();
    } catch {
      return null;
    }
  };
  const o = norm(origin);
  if (!o) return false;
  return allowed.some((a) => norm(a) === o);
}

export const webChatAdapter: ChannelAdapter = {
  type: "web_chat",
  capabilities: { supportsRichText: false },
  async normalizeInbound() {
    throw new Error("Web chat ingests via the public API route, not webhooks");
  },
  async send() {
    // Delivery = visibility to the widget poll once approved; nothing to push.
    return { externalMessageRef: "webchat-poll" };
  },
};

export async function getActiveChannelByWidgetKey(widgetKey: string) {
  const rows = await db()
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.widgetKey, widgetKey),
        eq(channels.type, "web_chat"),
        eq(channels.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertVisitorContact(
  workspaceId: string,
  visitorId: string,
  email?: string,
) {
  const inserted = await db()
    .insert(contacts)
    .values({
      workspaceId,
      webchatVisitorId: visitorId,
      identities: email ? { email } : {},
    })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];
  const existing = await db()
    .select()
    .from(contacts)
    .where(
      and(eq(contacts.workspaceId, workspaceId), eq(contacts.webchatVisitorId, visitorId)),
    )
    .limit(1);
  const contact = existing[0];
  if (!contact) throw new Error("Failed to upsert contact");
  if (email && contact.identities.email !== email) {
    await db()
      .update(contacts)
      .set({ identities: { ...contact.identities, email } })
      .where(eq(contacts.id, contact.id));
  }
  return contact;
}

/** Reopen the visitor's existing non-closed conversation, else create one (plan §1b). */
export async function getOrCreateOpenConversation(
  workspaceId: string,
  channelId: string,
  contactId: string,
) {
  const open = await db()
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.channelId, channelId),
        eq(conversations.contactId, contactId),
        ne(conversations.status, "closed"),
      ),
    )
    .orderBy(desc(conversations.createdAt))
    .limit(1);
  if (open[0]) return open[0];
  const created = await db()
    .insert(conversations)
    .values({ workspaceId, channelId, contactId })
    .returning();
  return created[0]!;
}

/** Idempotent on (conversation, clientMessageId) — retries never duplicate (AC-2.4). */
export async function appendVisitorMessage(args: {
  workspaceId: string;
  conversationId: string;
  body: string;
  clientMessageId: string;
}) {
  const inserted = await db()
    .insert(messages)
    .values({
      workspaceId: args.workspaceId,
      conversationId: args.conversationId,
      direction: "inbound",
      body: args.body,
      clientMessageId: args.clientMessageId,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) {
    await db()
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, args.conversationId));
    return { message: inserted[0], duplicate: false };
  }
  const existing = await db()
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, args.conversationId),
        eq(messages.clientMessageId, args.clientMessageId),
      ),
    )
    .limit(1);
  if (!existing[0]) throw new Error("Failed to append message");
  return { message: existing[0], duplicate: true };
}

/**
 * The visitor's view of their thread: their own messages + APPROVED outbound
 * only. Pending/dismissed drafts are invisible to visitors (AC-2.10).
 */
export async function getVisitorView(
  workspaceId: string,
  channelId: string,
  visitorId: string,
) {
  const contact = await db()
    .select()
    .from(contacts)
    .where(
      and(eq(contacts.workspaceId, workspaceId), eq(contacts.webchatVisitorId, visitorId)),
    )
    .limit(1);
  if (!contact[0]) return { conversation: null, messages: [] as VisitorMessage[] };

  const convo = await db()
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.channelId, channelId),
        eq(conversations.contactId, contact[0].id),
      ),
    )
    .orderBy(desc(conversations.createdAt))
    .limit(1);
  if (!convo[0]) return { conversation: null, messages: [] as VisitorMessage[] };

  const msgs = await db()
    .select({
      id: messages.id,
      direction: messages.direction,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, convo[0].id),
        or(
          eq(messages.direction, "inbound"),
          and(eq(messages.direction, "outbound"), eq(messages.draftStatus, "approved")),
        ),
      ),
    )
    .orderBy(messages.createdAt);

  return { conversation: convo[0], messages: msgs };
}
export type VisitorMessage = { id: string; direction: string; body: string; createdAt: Date };

/** Returning-visitor context for the AI (plan §1b): count of prior closed threads. */
export async function priorClosedConversations(contactId: string) {
  const rows = await db()
    .select({ n: count() })
    .from(conversations)
    .where(and(eq(conversations.contactId, contactId), eq(conversations.status, "closed")));
  return rows[0]?.n ?? 0;
}

/** Throttled "widget connected" marker for the setup page's live check. */
export async function markChannelConnected(channelId: string) {
  await db()
    .update(channels)
    .set({
      config: sql`jsonb_set(coalesce(${channels.config}, '{}'::jsonb), '{connectedAt}', to_jsonb(now()::text), true)`,
    })
    .where(
      and(eq(channels.id, channelId), sql`(${channels.config} ->> 'connectedAt') IS NULL`),
    );
}

export async function recentConversationMessages(conversationId: string, limit = 12) {
  const rows = await db()
    .select({
      direction: messages.direction,
      body: messages.body,
      draftStatus: messages.draftStatus,
      aiGenerated: messages.aiGenerated,
    })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        or(
          eq(messages.direction, "inbound"),
          inArray(messages.draftStatus, ["approved", "none"]),
        ),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse();
}
