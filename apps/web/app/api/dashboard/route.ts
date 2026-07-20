import { getBrain } from "@platform/brain";
import { computeGraduation, getCreditStatus, listActivations } from "@platform/core";
import {
  brainChangeLog,
  channels,
  contacts,
  conversations,
  db,
  messages,
  runs,
} from "@platform/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

/**
 * ONE consolidated dashboard payload. Replaces the previous 6+ separate client
 * fetches (metrics, attention, activity, conversations, channels, activations)
 * — each of which re-ran auth + a workspace lookup — plus ActiveAutomations'
 * per-activation autonomy waterfall. All of it now: one auth, queries in
 * parallel, one poll from the client.
 */
export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const wsId = ctx.workspace.id;
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [metricRows, pending, convoCount, chans, activations, recent, runRows, brainRows] =
    await Promise.all([
      db()
        .select({
          executed: sql<number>`count(*)::int`,
          autoHandled: sql<number>`count(*) FILTER (WHERE ${runs.action} = 'auto_sent')::int`,
          approved: sql<number>`count(*) FILTER (WHERE ${runs.outcomeMetrics} ->> 'resolution' IN ('approved','approved_edited'))::int`,
          escalated: sql<number>`count(*) FILTER (WHERE ${runs.action} = 'escalated')::int`,
          avgConfidence: sql<number | null>`round(avg(${runs.confidence}) FILTER (WHERE ${runs.confidence} IS NOT NULL)::numeric, 2)`,
        })
        .from(runs)
        .where(and(eq(runs.workspaceId, wsId), gte(runs.startedAt, since))),
      db()
        .select({ n: sql<number>`count(*)::int` })
        .from(messages)
        .where(and(eq(messages.workspaceId, wsId), eq(messages.draftStatus, "pending_approval"))),
      db().select({ n: sql<number>`count(*)::int` }).from(conversations).where(eq(conversations.workspaceId, wsId)),
      db()
        .select({ type: channels.type, status: channels.status })
        .from(channels)
        .where(eq(channels.workspaceId, wsId)),
      listActivations(wsId),
      db()
        .select({
          id: conversations.id,
          status: conversations.status,
          channelName: channels.displayName,
          contactEmail: sql<string | null>`${contacts.identities} ->> 'email'`,
          contactName: contacts.displayName,
          lastMessage: sql<string | null>`(SELECT m.body FROM messages m WHERE m.conversation_id = ${conversations.id} ORDER BY m.created_at DESC LIMIT 1)`,
          pendingDraft: sql<boolean>`EXISTS(SELECT 1 FROM messages m WHERE m.conversation_id = ${conversations.id} AND m.draft_status = 'pending_approval')`,
        })
        .from(conversations)
        .innerJoin(channels, eq(channels.id, conversations.channelId))
        .innerJoin(contacts, eq(contacts.id, conversations.contactId))
        .where(eq(conversations.workspaceId, wsId))
        .orderBy(desc(conversations.lastMessageAt))
        .limit(5),
      db()
        .select({
          id: runs.id,
          at: runs.startedAt,
          finished: runs.finishedAt,
          action: runs.action,
          category: runs.category,
          metrics: runs.outcomeMetrics,
          conversationId: runs.conversationId,
        })
        .from(runs)
        .where(eq(runs.workspaceId, wsId))
        .orderBy(desc(runs.startedAt))
        .limit(16),
      db()
        .select({ id: brainChangeLog.id, at: brainChangeLog.createdAt, kind: brainChangeLog.changeKind })
        .from(brainChangeLog)
        .where(eq(brainChangeLog.workspaceId, wsId))
        .orderBy(desc(brainChangeLog.createdAt))
        .limit(6),
    ]);

  const mm = metricRows[0] ?? { executed: 0, autoHandled: 0, approved: 0, escalated: 0, avgConfidence: null };
  const handled = mm.autoHandled + mm.approved;
  const successRate = mm.executed > 0 ? Math.round((handled / mm.executed) * 100) : null;

  // Real avg first-response time: first inbound → first delivered outbound.
  const respRow = await db().execute(sql`
    SELECT avg(secs)::int AS avg_secs FROM (
      SELECT extract(epoch FROM (
        min(created_at) FILTER (WHERE direction = 'outbound' AND delivery_state = 'visible')
        - min(created_at) FILTER (WHERE direction = 'inbound')
      )) AS secs
      FROM messages WHERE workspace_id = ${wsId}
      GROUP BY conversation_id
    ) t WHERE secs IS NOT NULL AND secs > 0
  `);
  const avgResponseSeconds =
    (respRow as unknown as { rows?: { avg_secs: number | null }[] }).rows?.[0]?.avg_secs ?? null;

  // Attention items — pending drafts + conversations needing a human.
  const [drafts, needsHuman] = await Promise.all([
    db()
      .select({
        conversationId: messages.conversationId,
        draftBody: messages.body,
        createdAt: messages.createdAt,
        visitorMessage: sql<string | null>`(SELECT m2.body FROM messages m2 WHERE m2.conversation_id = ${messages.conversationId} AND m2.direction = 'inbound' ORDER BY m2.created_at DESC LIMIT 1)`,
        contactEmail: sql<string | null>`(SELECT c.identities ->> 'email' FROM conversations cv JOIN contacts c ON c.id = cv.contact_id WHERE cv.id = ${messages.conversationId})`,
        reasoning: sql<string | null>`(SELECT re.detail ->> 'reasoning' FROM run_events re JOIN runs r ON r.id = re.run_id WHERE r.conversation_id = ${messages.conversationId} AND re.kind = 'decision' ORDER BY re.created_at DESC LIMIT 1)`,
      })
      .from(messages)
      .where(and(eq(messages.workspaceId, wsId), eq(messages.draftStatus, "pending_approval")))
      .orderBy(desc(messages.createdAt))
      .limit(20),
    db()
      .select({
        conversationId: runs.conversationId,
        startedAt: runs.startedAt,
        reason: sql<string | null>`${runs.outcomeMetrics} ->> 'escalationReason'`,
        visitorMessage: sql<string | null>`(SELECT m.body FROM messages m WHERE m.conversation_id = ${runs.conversationId} AND m.direction = 'inbound' ORDER BY m.created_at DESC LIMIT 1)`,
      })
      .from(runs)
      .where(and(eq(runs.workspaceId, wsId), eq(runs.status, "waiting_approval"), sql`(${runs.outcomeMetrics} ->> 'needsHuman')::boolean IS TRUE`))
      .orderBy(desc(runs.startedAt))
      .limit(20),
  ]);

  // Activity feed.
  const activity: { id: string; at: string; title: string; tone: string }[] = [];
  for (const r of runRows) {
    const resolution = (r.metrics as { resolution?: string } | null)?.resolution;
    let title = "Otto handled a message";
    let tone = "neutral";
    if (r.action === "auto_sent") { title = "Otto replied automatically"; tone = "ok"; }
    else if (r.action === "escalated") { title = "Escalated to you"; tone = "wait"; }
    else if (resolution) { title = "You approved a reply"; tone = "ok"; }
    else if (r.category === "lead_inquiry") { title = "Lead qualified"; tone = "brass"; }
    activity.push({ id: `r-${r.id}`, at: (r.finished ?? r.at).toISOString(), title, tone });
  }
  for (const b of brainRows) {
    activity.push({ id: `b-${b.id}`, at: b.at.toISOString(), title: "Business Brain updated", tone: "brass" });
  }
  activity.sort((a, b) => (a.at < b.at ? 1 : -1));

  // Single graduation nudge (server-computed — no per-activation client loop).
  let nudge: { activationId: string; approvals: number; wouldHaveAutoHandled: number } | null = null;
  for (const a of activations.filter((x) => x.status === "active" && x.mode === "supervised")) {
    const g = await computeGraduation(wsId, a.id, a.activatedAt);
    if (g.eligible) {
      nudge = { activationId: a.id, approvals: g.approvals, wouldHaveAutoHandled: g.wouldHaveAutoHandled };
      break;
    }
  }

  const credits = await getCreditStatus(wsId).catch(() => null);
  void getBrain; // (brain state is read on the server page, not needed here)

  return NextResponse.json({
    metrics: {
      conversations: convoCount[0]?.n ?? 0,
      resolved: mm.autoHandled + mm.approved,
      awaitingApproval: pending[0]?.n ?? 0,
      avgConfidence: mm.avgConfidence,
      escalated: mm.escalated,
      timeSavedMinutes: mm.autoHandled * 4 + mm.approved * 2,
      avgResponseSeconds,
      successRate,
    },
    attention: { drafts, needsHuman },
    activity: activity.slice(0, 18),
    recentConversations: recent,
    activations,
    channels: chans,
    connectedTypes: chans.filter((c) => c.status === "active").map((c) => c.type),
    nudge,
    creditsExhausted: credits?.exhausted ?? false,
  });
}
