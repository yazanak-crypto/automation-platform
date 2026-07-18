import { db, runEvents, runs } from "@platform/db";
import { eq, sql } from "drizzle-orm";

// Skeletal runs ledger helpers (plan §1). Our table is the source of truth
// for "what the AI did and why" — run_events power the plain-language view.

export async function createRun(args: {
  workspaceId: string;
  kind: string;
  conversationId?: string;
  triggerMessageId?: string;
}) {
  const rows = await db().insert(runs).values(args).returning();
  return rows[0]!;
}

export async function addRunEvent(
  runId: string,
  seq: number,
  kind: "step" | "ai_call" | "decision" | "error",
  title: string,
  detail?: Record<string, unknown>,
) {
  await db().insert(runEvents).values({ runId, seq, kind, title, detail });
}

export async function finishRun(
  runId: string,
  status: "waiting_approval" | "succeeded" | "failed",
  patch: {
    outcomeMetrics?: Record<string, unknown>;
    addCostMicrocents?: number;
    errorSummary?: string;
  } = {},
) {
  await db()
    .update(runs)
    .set({
      status,
      outcomeMetrics: patch.outcomeMetrics,
      errorSummary: patch.errorSummary,
      ...(patch.addCostMicrocents
        ? { costMicrocents: sql`${runs.costMicrocents} + ${patch.addCostMicrocents}` }
        : {}),
      ...(status === "waiting_approval" ? {} : { finishedAt: new Date() }),
    })
    .where(eq(runs.id, runId));
}
