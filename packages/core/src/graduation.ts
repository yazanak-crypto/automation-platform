import { db, runs } from "@platform/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";

// Trust graduation (Decision 012 §4.4): computed from the run ledger, no new
// tables. Eligibility constants are deliberately conservative for M1.

export const GRADUATION = {
  minApprovals: 10,
  minUneditedRate: 0.9,
  minDaysActive: 7,
} as const;

export interface GraduationStats {
  approvals: number;
  approvedUnedited: number;
  uneditedRate: number;
  currentUneditedStreak: number;
  wouldHaveAutoHandled: number;
  eligible: boolean;
}

export async function computeGraduation(
  workspaceId: string,
  activationId: string,
  activatedAt: Date,
): Promise<GraduationStats> {
  const rows = await db()
    .select({
      resolution: sql<string | null>`${runs.outcomeMetrics} ->> 'resolution'`,
      wouldAutoSend: sql<boolean | null>`(${runs.outcomeMetrics} ->> 'wouldAutoSend')::boolean`,
      startedAt: runs.startedAt,
    })
    .from(runs)
    .where(
      and(
        eq(runs.workspaceId, workspaceId),
        eq(runs.activationId, activationId),
        eq(runs.status, "succeeded"),
        gte(runs.startedAt, activatedAt),
      ),
    )
    .orderBy(desc(runs.startedAt))
    .limit(200);

  const approved = rows.filter(
    (r) => r.resolution === "approved" || r.resolution === "approved_edited",
  );
  const unedited = approved.filter((r) => r.resolution === "approved");

  let streak = 0;
  for (const r of rows) {
    if (r.resolution === "approved") streak++;
    else if (r.resolution === "approved_edited" || r.resolution === "dismissed") break;
  }

  const uneditedRate = approved.length === 0 ? 0 : unedited.length / approved.length;
  const daysActive = (Date.now() - activatedAt.getTime()) / 86_400_000;

  return {
    approvals: approved.length,
    approvedUnedited: unedited.length,
    uneditedRate,
    currentUneditedStreak: streak,
    wouldHaveAutoHandled: rows.filter((r) => r.wouldAutoSend === true).length,
    eligible:
      approved.length >= GRADUATION.minApprovals &&
      uneditedRate >= GRADUATION.minUneditedRate &&
      daysActive >= GRADUATION.minDaysActive,
  };
}
