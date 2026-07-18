import { contacts, conversations, db, messages, runs } from "@platform/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

/** The dashboard attention queue: pending drafts + conversations needing a human. */
export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();

  const drafts = await db()
    .select({
      conversationId: messages.conversationId,
      draftId: messages.id,
      draftBody: messages.body,
      createdAt: messages.createdAt,
      visitorMessage: sql<string | null>`(
        SELECT m2.body FROM messages m2
        WHERE m2.conversation_id = ${messages.conversationId} AND m2.direction = 'inbound'
        ORDER BY m2.created_at DESC LIMIT 1
      )`,
      contactEmail: sql<string | null>`${contacts.identities} ->> 'email'`,
      reasoning: sql<string | null>`(
        SELECT re.detail ->> 'reasoning' FROM run_events re
        JOIN runs r ON r.id = re.run_id
        WHERE r.conversation_id = ${messages.conversationId} AND re.kind = 'decision'
        ORDER BY re.created_at DESC LIMIT 1
      )`,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(
      and(
        eq(messages.workspaceId, ctx.workspace.id),
        eq(messages.draftStatus, "pending_approval"),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(50);

  const needsHuman = await db()
    .select({
      conversationId: runs.conversationId,
      startedAt: runs.startedAt,
      visitorMessage: sql<string | null>`(
        SELECT m.body FROM messages m
        WHERE m.conversation_id = ${runs.conversationId} AND m.direction = 'inbound'
        ORDER BY m.created_at DESC LIMIT 1
      )`,
      reason: sql<string | null>`${runs.outcomeMetrics} ->> 'escalationReason'`,
    })
    .from(runs)
    .where(
      and(
        eq(runs.workspaceId, ctx.workspace.id),
        eq(runs.status, "waiting_approval"),
        sql`(${runs.outcomeMetrics} ->> 'needsHuman')::boolean IS TRUE`,
      ),
    )
    .orderBy(desc(runs.startedAt))
    .limit(50);

  return NextResponse.json({ drafts, needsHuman });
}
