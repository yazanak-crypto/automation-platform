import { channels, contacts, conversations, db } from "@platform/db";
import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const rows = await db()
    .select({
      id: conversations.id,
      status: conversations.status,
      lastMessageAt: conversations.lastMessageAt,
      createdAt: conversations.createdAt,
      channelName: channels.displayName,
      contactId: contacts.id,
      contactName: contacts.displayName,
      contactEmail: sql<string | null>`${contacts.identities} ->> 'email'`,
      lastMessage: sql<string | null>`(
        SELECT m.body FROM messages m
        WHERE m.conversation_id = ${conversations.id}
        ORDER BY m.created_at DESC LIMIT 1
      )`,
      priorConversations: sql<number>`(
        SELECT count(*)::int FROM conversations c2
        WHERE c2.contact_id = ${conversations.contactId} AND c2.id != ${conversations.id}
      )`,
      pendingDraft: sql<boolean>`EXISTS(
        SELECT 1 FROM messages m WHERE m.conversation_id = ${conversations.id}
        AND m.draft_status = 'pending_approval'
      )`,
    })
    .from(conversations)
    .innerJoin(channels, eq(channels.id, conversations.channelId))
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(eq(conversations.workspaceId, ctx.workspace.id))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(100);
  return NextResponse.json(rows);
}
