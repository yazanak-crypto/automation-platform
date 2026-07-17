import { brainChangeLog, businessProfiles, db } from "@platform/db";
import { eq, sql } from "drizzle-orm";

export type BrainTx = Parameters<
  Parameters<ReturnType<typeof db>["transaction"]>[0]
>[0];

export interface BrainChange {
  entity: "profile" | "boundary" | "knowledge";
  entityId?: string;
  changeKind: "create" | "update" | "delete" | "confirm" | "reject";
  diff?: { old?: unknown; new?: unknown };
  actor: string; // "user:<id>" | "system:ingest"
}

/**
 * The single mutation gate for the Business Brain (Decision 011 refinement).
 * Every brain write path MUST call this inside its transaction. Increments
 * `business_profiles.brain_version` and appends to the change log; the unique
 * (workspace_id, version) index makes concurrent bumps fail loudly instead of
 * silently sharing a version.
 */
export async function bumpBrainVersion(
  tx: BrainTx,
  workspaceId: string,
  change: BrainChange,
): Promise<number> {
  const rows = await tx
    .update(businessProfiles)
    .set({
      brainVersion: sql`${businessProfiles.brainVersion} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(businessProfiles.workspaceId, workspaceId))
    .returning({ version: businessProfiles.brainVersion });

  const version = rows[0]?.version;
  if (version === undefined) {
    throw new Error(`No business profile for workspace ${workspaceId}`);
  }

  await tx.insert(brainChangeLog).values({
    workspaceId,
    version,
    entity: change.entity,
    entityId: change.entityId,
    changeKind: change.changeKind,
    diff: change.diff,
    actor: change.actor,
  });

  return version;
}
