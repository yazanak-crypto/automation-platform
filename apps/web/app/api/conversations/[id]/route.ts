import {
  aiCalls,
  channels,
  contacts,
  conversations,
  db,
  messages,
  runEvents,
  runs,
} from "@platform/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const { id } = await params;

  const convo = await db()
    .select({
      id: conversations.id,
      status: conversations.status,
      createdAt: conversations.createdAt,
      channelName: channels.displayName,
      contactId: contacts.id,
      contactEmail: contacts.identities,
    })
    .from(conversations)
    .innerJoin(channels, eq(channels.id, conversations.channelId))
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(and(eq(conversations.id, id), eq(conversations.workspaceId, ctx.workspace.id)))
    .limit(1);
  if (!convo[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const msgs = await db()
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);

  const convoRuns = await db()
    .select()
    .from(runs)
    .where(and(eq(runs.conversationId, id), eq(runs.workspaceId, ctx.workspace.id)))
    .orderBy(desc(runs.startedAt))
    .limit(20);

  const runIds = convoRuns.map((r) => r.id);
  const events = runIds.length
    ? await db()
        .select()
        .from(runEvents)
        .where(inArray(runEvents.runId, runIds))
        .orderBy(runEvents.runId, runEvents.seq)
    : [];

  // Which brain version/context produced the latest draft (Decision 011).
  const latestDraftCall = runIds.length
    ? await db()
        .select({
          brainVersion: aiCalls.brainVersion,
          model: aiCalls.model,
          createdAt: aiCalls.createdAt,
        })
        .from(aiCalls)
        .where(and(eq(aiCalls.workspaceId, ctx.workspace.id), inArray(aiCalls.runId, runIds)))
        .orderBy(desc(aiCalls.createdAt))
        .limit(1)
    : [];

  const priorCount = await db()
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.contactId, convo[0].contactId));

  return NextResponse.json({
    conversation: { ...convo[0], priorConversations: priorCount.length - 1 },
    messages: msgs,
    runs: convoRuns.map((r) => ({
      ...r,
      events: events.filter((e) => e.runId === r.id),
    })),
    latestDraftCall: latestDraftCall[0] ?? null,
  });
}
