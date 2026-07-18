import { aiCalls, db, runEvents, runs } from "@platform/db";
import { eq, sql } from "drizzle-orm";

// Skeletal runs ledger helpers (plan §1). Our table is the source of truth
// for "what the AI did and why" — run_events power the plain-language view.

export async function createRun(args: {
  workspaceId: string;
  kind: string;
  activationId?: string;
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
    errorSummary?: string;
    /** Autonomy telemetry (Decision 012). */
    category?: string;
    confidence?: number;
    action?: string;
  } = {},
) {
  // Audit P0-4: the run's cost is always the sum of its ai_calls — aggregated
  // here so dashboard metrics (step 8) and plan caps (step 9) read real money.
  await db()
    .update(runs)
    .set({
      status,
      outcomeMetrics: patch.outcomeMetrics,
      errorSummary: patch.errorSummary,
      category: patch.category,
      confidence: patch.confidence,
      action: patch.action,
      costMicrocents: sql`coalesce((
        SELECT sum(${aiCalls.estimatedCostMicrocents})::int
        FROM ${aiCalls} WHERE ${aiCalls.runId} = ${runId}
      ), 0)`,
      ...(status === "waiting_approval" ? {} : { finishedAt: new Date() }),
    })
    .where(eq(runs.id, runId));
}
