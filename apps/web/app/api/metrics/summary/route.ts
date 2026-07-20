import { conversations, db, messages, runs } from "@platform/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

/** Dashboard stat strip (Decision 012 §5 / AC-3.6) — run-ledger numbers only. */
export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const rows = await db()
    .select({
      autoHandled: sql<number>`count(*) FILTER (WHERE ${runs.action} = 'auto_sent')::int`,
      escalated: sql<number>`count(*) FILTER (WHERE ${runs.action} = 'escalated')::int`,
      approved: sql<number>`count(*) FILTER (WHERE ${runs.outcomeMetrics} ->> 'resolution' IN ('approved','approved_edited'))::int`,
      leadsDetected: sql<number>`count(*) FILTER (WHERE ${runs.category} = 'lead_inquiry')::int`,
      avgConfidence: sql<number | null>`round(avg(${runs.confidence}) FILTER (WHERE ${runs.confidence} IS NOT NULL)::numeric, 2)`,
    })
    .from(runs)
    .where(and(eq(runs.workspaceId, ctx.workspace.id), gte(runs.startedAt, since)));

  const [pending, convo] = await Promise.all([
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(eq(messages.workspaceId, ctx.workspace.id), eq(messages.draftStatus, "pending_approval"))),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(conversations)
      .where(eq(conversations.workspaceId, ctx.workspace.id)),
  ]);

  const m = rows[0] ?? { autoHandled: 0, escalated: 0, approved: 0, leadsDetected: 0, avgConfidence: null };
  const conversationsTotal = convo[0]?.n ?? 0;
  const resolved = m.autoHandled + m.approved;
  // Honest estimate, labeled as such in the UI: ~4 min per auto-handled
  // conversation, ~2 min saved per approved draft (vs writing from scratch).
  const timeSavedMinutes = m.autoHandled * 4 + m.approved * 2;

  return NextResponse.json({
    periodDays: 30,
    conversations: conversationsTotal,
    resolved,
    autoHandled: m.autoHandled,
    escalated: m.escalated,
    approved: m.approved,
    awaitingApproval: pending[0]?.n ?? 0,
    leadsDetected: (m as { leadsDetected?: number }).leadsDetected ?? 0,
    avgConfidence: m.avgConfidence,
    timeSavedMinutes,
  });
}
