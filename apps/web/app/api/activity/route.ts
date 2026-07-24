import { brainChangeLog, db, runs } from "@platform/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

// The Live Operations Ledger + activity timeline feed (real events only —
// no fabricated activity). Unified from the run ledger + brain change log.

export interface ActivityEvent {
  id: string;
  at: string;
  title: string;
  tone: "ok" | "wait" | "brass" | "neutral";
}

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const wsId = ctx.workspace.id;

  const [runRows, brainRows] = await Promise.all([
    db()
      .select({
        id: runs.id,
        at: runs.startedAt,
        finished: runs.finishedAt,
        action: runs.action,
        category: runs.category,
        metrics: runs.outcomeMetrics,
      })
      .from(runs)
      .where(eq(runs.workspaceId, wsId))
      .orderBy(desc(runs.startedAt))
      .limit(24),
    db()
      .select({ id: brainChangeLog.id, at: brainChangeLog.createdAt, kind: brainChangeLog.changeKind })
      .from(brainChangeLog)
      .where(eq(brainChangeLog.workspaceId, wsId))
      .orderBy(desc(brainChangeLog.createdAt))
      .limit(8),
  ]);

  const events: ActivityEvent[] = [];

  for (const r of runRows) {
    const resolution = (r.metrics as { resolution?: string } | null)?.resolution;
    let title = "Ovanth handled a message";
    let tone: ActivityEvent["tone"] = "neutral";
    if (r.action === "auto_sent") {
      title = "Ovanth replied automatically";
      tone = "ok";
    } else if (r.action === "escalated") {
      title = "Escalated to you";
      tone = "wait";
    } else if (resolution === "approved" || resolution === "approved_edited") {
      title = "You approved a reply";
      tone = "ok";
    } else if (r.category === "lead_inquiry") {
      title = "Lead qualified";
      tone = "brass";
    } else if (r.action === "draft_for_approval") {
      title = "Draft ready for approval";
      tone = "wait";
    }
    events.push({ id: `r-${r.id}`, at: (r.finished ?? r.at).toISOString(), title, tone });
  }

  for (const b of brainRows) {
    events.push({
      id: `b-${b.id}`,
      at: b.at.toISOString(),
      title: b.kind === "confirm" ? "Knowledge confirmed" : "Business Brain updated",
      tone: "brass",
    });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : -1));
  return NextResponse.json({ events: events.slice(0, 20) });
}
