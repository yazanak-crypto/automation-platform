import {
  boundaries,
  brainChangeLog,
  businessProfiles,
  db,
  knowledgeItems,
} from "@platform/db";
import type {
  boundaryInputSchema,
  boundaryPatchSchema,
  knowledgeInputSchema,
  knowledgePatchSchema,
  ProfilePatch,
} from "@platform/schemas";
import { and, desc, eq } from "drizzle-orm";
import type { z } from "zod";
import { bumpBrainVersion } from "./version";

// All functions are workspace-scoped by signature: callers (API routes) resolve
// the workspace from the authenticated session and can only pass their own id.


// Audit P1-12: concurrent brain edits race on the unique (workspace, version)
// index — correct, but must not surface as a 500. One retry wins the race.
function isVersionConflict(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

async function withVersionRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isVersionConflict(err)) throw err;
    return fn();
  }
}

export async function ensureProfile(workspaceId: string) {
  const existing = await db()
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.workspaceId, workspaceId))
    .limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db()
    .insert(businessProfiles)
    .values({ workspaceId })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];
  const retry = await db()
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.workspaceId, workspaceId))
    .limit(1);
  if (!retry[0]) throw new Error("Failed to ensure business profile");
  return retry[0];
}

export async function getBrain(workspaceId: string) {
  const profile = await ensureProfile(workspaceId);
  const bounds = await db()
    .select()
    .from(boundaries)
    .where(eq(boundaries.workspaceId, workspaceId))
    .orderBy(desc(boundaries.createdAt));
  const knowledge = await db()
    .select({
      id: knowledgeItems.id,
      kind: knowledgeItems.kind,
      title: knowledgeItems.title,
      content: knowledgeItems.content,
      provenance: knowledgeItems.provenance,
      status: knowledgeItems.status,
      sourceRef: knowledgeItems.sourceRef,
      createdAt: knowledgeItems.createdAt,
      updatedAt: knowledgeItems.updatedAt,
    })
    .from(knowledgeItems)
    .where(eq(knowledgeItems.workspaceId, workspaceId))
    .orderBy(desc(knowledgeItems.createdAt));
  return { profile, boundaries: bounds, knowledge };
}

export async function patchProfile(
  workspaceId: string,
  patch: ProfilePatch,
  actor: string,
) {
  const before = await ensureProfile(workspaceId);
  return withVersionRetry(() => db().transaction(async (tx) => {
    const merged = {
      identity: patch.identity
        ? { ...(before.identity ?? {}), ...patch.identity }
        : before.identity,
      voice: patch.voice ? { ...(before.voice ?? {}), ...patch.voice } : before.voice,
      policies: patch.policies
        ? { ...(before.policies ?? {}), ...patch.policies }
        : before.policies,
      onboardingStatus: patch.onboardingStatus ?? before.onboardingStatus,
    };
    const updated = await tx
      .update(businessProfiles)
      .set(merged)
      .where(eq(businessProfiles.workspaceId, workspaceId))
      .returning();
    const version = await bumpBrainVersion(tx, workspaceId, {
      entity: "profile",
      entityId: before.id,
      changeKind: "update",
      diff: { old: pickProfileFields(before), new: pickProfileFields(updated[0]!) },
      actor,
    });
    return { profile: updated[0]!, brainVersion: version };
  }));
}

function pickProfileFields(p: {
  identity?: unknown;
  voice?: unknown;
  policies?: unknown;
  onboardingStatus?: unknown;
}) {
  return {
    identity: p.identity,
    voice: p.voice,
    policies: p.policies,
    onboardingStatus: p.onboardingStatus,
  };
}

// ── Boundaries ──────────────────────────────────────────────────────────────

export async function createBoundary(
  workspaceId: string,
  input: z.infer<typeof boundaryInputSchema>,
  actor: string,
) {
  await ensureProfile(workspaceId);
  return withVersionRetry(() => db().transaction(async (tx) => {
    const rows = await tx
      .insert(boundaries)
      .values({ workspaceId, ...input })
      .returning();
    await bumpBrainVersion(tx, workspaceId, {
      entity: "boundary",
      entityId: rows[0]!.id,
      changeKind: "create",
      diff: { new: input },
      actor,
    });
    return rows[0]!;
  }));
}

export async function patchBoundary(
  workspaceId: string,
  id: string,
  patch: z.infer<typeof boundaryPatchSchema>,
  actor: string,
) {
  return withVersionRetry(() => db().transaction(async (tx) => {
    const before = await tx
      .select()
      .from(boundaries)
      .where(and(eq(boundaries.id, id), eq(boundaries.workspaceId, workspaceId)))
      .limit(1);
    if (!before[0]) return null;
    const rows = await tx
      .update(boundaries)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(boundaries.id, id), eq(boundaries.workspaceId, workspaceId)))
      .returning();
    await bumpBrainVersion(tx, workspaceId, {
      entity: "boundary",
      entityId: id,
      changeKind: "update",
      diff: { old: before[0], new: patch },
      actor,
    });
    return rows[0]!;
  }));
}

export async function deleteBoundary(workspaceId: string, id: string, actor: string) {
  return withVersionRetry(() => db().transaction(async (tx) => {
    const rows = await tx
      .delete(boundaries)
      .where(and(eq(boundaries.id, id), eq(boundaries.workspaceId, workspaceId)))
      .returning();
    if (!rows[0]) return false;
    await bumpBrainVersion(tx, workspaceId, {
      entity: "boundary",
      entityId: id,
      changeKind: "delete",
      diff: { old: rows[0] },
      actor,
    });
    return true;
  }));
}

// ── Knowledge ───────────────────────────────────────────────────────────────

export async function createKnowledge(
  workspaceId: string,
  input: z.infer<typeof knowledgeInputSchema>,
  actor: string,
) {
  await ensureProfile(workspaceId);
  return withVersionRetry(() => db().transaction(async (tx) => {
    const rows = await tx
      .insert(knowledgeItems)
      .values({
        workspaceId,
        ...input,
        provenance: "user_provided",
        status: "confirmed",
      })
      .returning();
    await bumpBrainVersion(tx, workspaceId, {
      entity: "knowledge",
      entityId: rows[0]!.id,
      changeKind: "create",
      diff: { new: input },
      actor,
    });
    return rows[0]!;
  }));
}

/**
 * Content edits and status transitions. The ONLY path from `suggested` to
 * `confirmed` is an explicit status patch here — never AI output (Decision 008).
 */
export async function patchKnowledge(
  workspaceId: string,
  id: string,
  patch: z.infer<typeof knowledgePatchSchema>,
  actor: string,
) {
  return withVersionRetry(() => db().transaction(async (tx) => {
    const before = await tx
      .select()
      .from(knowledgeItems)
      .where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.workspaceId, workspaceId)))
      .limit(1);
    if (!before[0]) return null;
    const contentChanged =
      patch.content !== undefined && patch.content !== before[0].content;
    const rows = await tx
      .update(knowledgeItems)
      .set({
        ...patch,
        // Content edits invalidate the old embedding until brain.embed rewrites it.
        ...(contentChanged ? { embedding: null } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.workspaceId, workspaceId)))
      .returning();
    const changeKind =
      patch.status === "confirmed"
        ? "confirm"
        : patch.status === "rejected"
          ? "reject"
          : "update";
    await bumpBrainVersion(tx, workspaceId, {
      entity: "knowledge",
      entityId: id,
      changeKind,
      diff: {
        old: { title: before[0].title, content: before[0].content, status: before[0].status },
        new: patch,
      },
      actor,
    });
    return { item: rows[0]!, needsEmbedding: contentChanged };
  }));
}

export async function deleteKnowledge(workspaceId: string, id: string, actor: string) {
  return withVersionRetry(() => db().transaction(async (tx) => {
    const rows = await tx
      .delete(knowledgeItems)
      .where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.workspaceId, workspaceId)))
      .returning();
    if (!rows[0]) return false;
    await bumpBrainVersion(tx, workspaceId, {
      entity: "knowledge",
      entityId: id,
      changeKind: "delete",
      diff: { old: { title: rows[0].title } },
      actor,
    });
    return true;
  }));
}

export async function getChangeLog(workspaceId: string, limit = 100) {
  return db()
    .select()
    .from(brainChangeLog)
    .where(eq(brainChangeLog.workspaceId, workspaceId))
    .orderBy(desc(brainChangeLog.version))
    .limit(limit);
}
