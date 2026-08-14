import { channels, contacts, conversations, db, messages } from "@platform/db";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";

// The contacts layer: who has contacted this business, and what they wanted.
//
// There is deliberately NO cross-channel identity resolution here. A contact
// row is one person on one channel, because that is all the data supports:
// web chat yields an anonymous token, WhatsApp a phone number, Gmail an email
// address — no shared key exists to join them on. Guessing that two rows are
// the same human would silently merge strangers' message histories, so the
// channel is always shown instead. See the PR for the path to real unification
// (capture the join key first, merge second).

export type ContactSort = "last_contact" | "first_contact" | "name" | "conversations";

export interface ContactListRow {
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  /** Channel types this contact has ever used, e.g. ["web_chat"]. */
  channels: string[];
  firstContactAt: Date;
  lastContactAt: Date | null;
  conversationCount: number;
  messageCount: number;
}

const SORTS: Record<ContactSort, ReturnType<typeof sql>> = {
  last_contact: sql`max(${conversations.lastMessageAt}) desc nulls last`,
  first_contact: sql`${contacts.createdAt} desc`,
  name: sql`${contacts.displayName} asc nulls last`,
  conversations: sql`count(distinct ${conversations.id}) desc`,
};

/**
 * List everyone who has contacted this workspace.
 *
 * `phone` reads from the WhatsApp identity — it is the only channel that gives
 * us a number today. It is exposed under a neutral name so that adding SMS
 * later doesn't change the shape the UI and CSV depend on.
 */
export async function listContacts(
  workspaceId: string,
  opts: { search?: string; sort?: ContactSort; limit?: number; offset?: number } = {},
): Promise<{ rows: ContactListRow[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const search = opts.search?.trim();

  const searchFilter = search
    ? or(
        ilike(contacts.displayName, `%${search}%`),
        sql`${contacts.identities} ->> 'email' ilike ${`%${search}%`}`,
        sql`${contacts.identities} ->> 'whatsapp' ilike ${`%${search}%`}`,
      )
    : undefined;
  const where = searchFilter
    ? and(eq(contacts.workspaceId, workspaceId), searchFilter)
    : eq(contacts.workspaceId, workspaceId);

  const rows = await db()
    .select({
      id: contacts.id,
      displayName: contacts.displayName,
      email: sql<string | null>`${contacts.identities} ->> 'email'`,
      phone: sql<string | null>`${contacts.identities} ->> 'whatsapp'`,
      channels: sql<string[]>`coalesce(array_agg(distinct ${channels.type}) filter (where ${channels.type} is not null), '{}')`,
      firstContactAt: contacts.createdAt,
      lastContactAt: sql<Date | null>`max(${conversations.lastMessageAt})`,
      conversationCount: sql<number>`count(distinct ${conversations.id})::int`,
      messageCount: sql<number>`count(distinct ${messages.id})::int`,
    })
    .from(contacts)
    .leftJoin(conversations, eq(conversations.contactId, contacts.id))
    .leftJoin(channels, eq(channels.id, conversations.channelId))
    .leftJoin(messages, eq(messages.conversationId, conversations.id))
    .where(where)
    .groupBy(contacts.id)
    .orderBy(SORTS[opts.sort ?? "last_contact"])
    .limit(limit)
    .offset(offset);

  const counted = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(contacts)
    .where(where);

  return { rows, total: counted[0]?.n ?? 0 };
}

export interface ContactDetail {
  contact: {
    id: string;
    displayName: string | null;
    email: string | null;
    phone: string | null;
    instagram: string | null;
    isAnonymousVisitor: boolean;
    createdAt: Date;
  };
  conversations: Array<{
    id: string;
    channelType: string;
    status: string;
    startedAt: Date;
    lastMessageAt: Date;
    messages: Array<{
      id: string;
      direction: string;
      body: string;
      aiGenerated: boolean;
      draftStatus: string;
      createdAt: Date;
    }>;
  }>;
}

/**
 * One person's complete history. Includes outbound and AI-generated replies so
 * the owner sees the actual exchange, not a one-sided list of questions.
 * Drafts that were never sent are included but carry their draftStatus, so the
 * UI can distinguish "we replied" from "a reply is waiting".
 */
export async function getContactDetail(
  workspaceId: string,
  contactId: string,
): Promise<ContactDetail | null> {
  const found = await db()
    .select()
    .from(contacts)
    .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, contactId)))
    .limit(1);
  const c = found[0];
  if (!c) return null;

  const convRows = await db()
    .select({
      id: conversations.id,
      channelType: channels.type,
      status: conversations.status,
      startedAt: conversations.createdAt,
      lastMessageAt: conversations.lastMessageAt,
    })
    .from(conversations)
    .innerJoin(channels, eq(channels.id, conversations.channelId))
    .where(eq(conversations.contactId, contactId))
    .orderBy(desc(conversations.lastMessageAt));

  const msgRows = convRows.length
    ? await db()
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          direction: messages.direction,
          body: messages.body,
          aiGenerated: messages.aiGenerated,
          draftStatus: messages.draftStatus,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(
          and(
            eq(messages.workspaceId, workspaceId),
            sql`${messages.conversationId} in ${convRows.map((r) => r.id)}`,
          ),
        )
        .orderBy(asc(messages.createdAt))
    : [];

  const byConversation = new Map<string, typeof msgRows>();
  for (const m of msgRows) {
    const bucket = byConversation.get(m.conversationId);
    if (bucket) bucket.push(m);
    else byConversation.set(m.conversationId, [m]);
  }

  return {
    contact: {
      id: c.id,
      displayName: c.displayName,
      email: c.identities.email ?? null,
      phone: c.identities.whatsapp ?? null,
      instagram: c.identities.instagram ?? null,
      // An anonymous web chat visitor is an honest state, not missing data.
      isAnonymousVisitor:
        !c.displayName && !c.identities.email && !c.identities.whatsapp && !!c.webchatVisitorId,
      createdAt: c.createdAt,
    },
    conversations: convRows.map((r) => ({
      ...r,
      messages: (byConversation.get(r.id) ?? []).map(({ conversationId: _c, ...m }) => m),
    })),
  };
}

/** RFC 4180 escaping. A body containing a comma or quote must not shift columns. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CONTACT_CSV_HEADERS = [
  "name",
  "email",
  "phone",
  "channels",
  "first_contact",
  "last_contact",
  "conversations",
  "messages",
] as const;

/**
 * The whole contact list as CSV — the business owning its own data. Exports
 * exactly what is stored: no inferred columns, no invented names. Anonymous
 * visitors export with an empty name rather than a placeholder, so the file
 * stays honest when it lands in a spreadsheet.
 */
export function contactsToCsv(rows: ContactListRow[]): string {
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : "");
  const lines = [CONTACT_CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.displayName),
        csvCell(r.email),
        csvCell(r.phone),
        csvCell(r.channels.join(" ")),
        csvCell(iso(r.firstContactAt)),
        csvCell(iso(r.lastContactAt)),
        csvCell(r.conversationCount),
        csvCell(r.messageCount),
      ].join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
