import { activations, db } from "@platform/db";
import { and, eq, sql } from "drizzle-orm";

/**
 * The gate the draft job runs behind (M1 step 6): an automation only acts on
 * a conversation when the workspace has an ACTIVE activation covering that
 * channel. No activation → no AI, no run, no cost.
 */
export async function findActiveActivation(
  workspaceId: string,
  automationSlug: string,
  channelId: string,
) {
  const rows = await db()
    .select()
    .from(activations)
    .where(
      and(
        eq(activations.workspaceId, workspaceId),
        eq(activations.automationSlug, automationSlug),
        eq(activations.status, "active"),
        sql`${activations.channelIds} @> ${JSON.stringify([channelId])}::jsonb`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listActivations(workspaceId: string) {
  return db()
    .select()
    .from(activations)
    .where(
      and(eq(activations.workspaceId, workspaceId), sql`${activations.status} != 'deactivated'`),
    )
    .orderBy(activations.activatedAt);
}
