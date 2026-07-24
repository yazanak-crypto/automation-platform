import { conversations, db, messages, runs } from "@platform/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

// Real analytics, computed from our own tables — no fabricated numbers, no
// third-party analytics. All values derive from the run ledger + messages.

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const wsId = ctx.workspace.id;
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const since14 = new Date(Date.now() - 13 * 24 * 3600 * 1000);

  const [totals, convoTotal, responseRow, daily, byCategory] = await Promise.all([
    db()
      .select({
        executed: sql<number>`count(*)::int`,
        autoSent: sql<number>`count(*) FILTER (WHERE ${runs.action} = 'auto_sent')::int`,
        escalated: sql<number>`count(*) FILTER (WHERE ${runs.action} = 'escalated')::int`,
        approved: sql<number>`count(*) FILTER (WHERE ${runs.outcomeMetrics} ->> 'resolution' IN ('approved','approved_edited'))::int`,
        leads: sql<number>`count(*) FILTER (WHERE ${runs.category} = 'lead_inquiry')::int`,
        failed: sql<number>`count(*) FILTER (WHERE ${runs.status} = 'failed')::int`,
      })
      .from(runs)
      .where(and(eq(runs.workspaceId, wsId), gte(runs.startedAt, since))),
    db().select({ n: sql<number>`count(*)::int` }).from(conversations).where(eq(conversations.workspaceId, wsId)),
    // Average first-response time: first inbound → first delivered outbound, per conversation.
    db().execute(sql`
      SELECT avg(secs)::int AS avg_secs, count(*)::int AS n FROM (
        SELECT
          extract(epoch FROM (
            min(created_at) FILTER (WHERE direction = 'outbound' AND delivery_state = 'visible')
            - min(created_at) FILTER (WHERE direction = 'inbound')
          )) AS secs
        FROM messages WHERE workspace_id = ${wsId}
        GROUP BY conversation_id
      ) t WHERE secs IS NOT NULL AND secs > 0
    `),
    // Daily automations executed, last 14 days.
    db().execute(sql`
      SELECT to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS day, count(*)::int AS n
      FROM runs WHERE workspace_id = ${wsId} AND started_at >= ${since14.toISOString()}
      GROUP BY 1 ORDER BY 1
    `),
    db()
      .select({ category: runs.category, n: sql<number>`count(*)::int` })
      .from(runs)
      .where(and(eq(runs.workspaceId, wsId), gte(runs.startedAt, since)))
      .groupBy(runs.category),
  ]);

  const t = totals[0] ?? { executed: 0, autoSent: 0, escalated: 0, approved: 0, leads: 0, failed: 0 };
  const handled = t.autoSent + t.approved;
  const successRate = t.executed > 0 ? Math.round((handled / t.executed) * 100) : null;
  const timeSavedMinutes = t.autoSent * 4 + t.approved * 2;

  const respRows = (responseRow as unknown as { rows?: { avg_secs: number | null; n: number }[] }).rows ?? [];
  const avgResponseSeconds = respRows[0]?.avg_secs ?? null;

  // Fill the 14-day series so gaps render as zero, not missing bars.
  const dailyRows = (daily as unknown as { rows?: { day: string; n: number }[] }).rows ?? [];
  const map = new Map(dailyRows.map((r) => [r.day, r.n]));
  const series: { day: string; n: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
    series.push({ day: d, n: map.get(d) ?? 0 });
  }

  return NextResponse.json({
    periodDays: 30,
    conversations: convoTotal[0]?.n ?? 0,
    automationsExecuted: t.executed,
    handledAutomatically: t.autoSent,
    humanInterventions: t.approved + t.escalated,
    escalated: t.escalated,
    leads: t.leads,
    failed: t.failed,
    successRate,
    avgResponseSeconds,
    hoursSaved: Math.round((timeSavedMinutes / 60) * 10) / 10,
    daily: series,
    byCategory: byCategory.filter((c) => c.category).map((c) => ({ category: c.category as string, n: c.n })),
  });
}
