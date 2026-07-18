import { conversations, db, messages, runs } from "@platform/db";
import { and, eq, inArray, lt, sql } from "drizzle-orm";

// Conversation/draft/run lifecycle (audit P0 items 1, 2, 5). These are the
// ONLY places a pending draft is retired or a waiting run is resolved outside
// the explicit approve/dismiss route — keeping the ledger truthful.

/**
 * P0-2: retire older pending drafts when a newer draft (or a manual reply)
 * supersedes them, and resolve their runs so nothing orphans.
 */
export async function supersedePendingDrafts(
  conversationId: string,
  resolution: "superseded" | "manual_reply" | "closed",
) {
  const dismissed = await db()
    .update(messages)
    .set({ draftStatus: "dismissed" })
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.draftStatus, "pending_approval"),
      ),
    )
    .returning({ id: messages.id });
  await resolveWaitingRuns(conversationId, resolution);
  return dismissed.length;
}

/**
 * P0-1: resolve every waiting_approval run on a conversation (draft runs AND
 * needs-human runs) so attention items clear when the owner acts.
 */
export async function resolveWaitingRuns(
  conversationId: string,
  resolution: string,
) {
  const resolved = await db()
    .update(runs)
    .set({
      status: "succeeded",
      finishedAt: new Date(),
      outcomeMetrics: sql`coalesce(${runs.outcomeMetrics}, '{}'::jsonb) || ${JSON.stringify({ resolution })}::jsonb`,
    })
    .where(and(eq(runs.conversationId, conversationId), eq(runs.status, "waiting_approval")))
    .returning({ id: runs.id });
  return resolved.length;
}

/**
 * P0-5: close a conversation — retire pending drafts, resolve waiting runs,
 * mark closed. Workspace-scoped; returns false when not found/not owned.
 */
export async function closeConversation(workspaceId: string, conversationId: string) {
  const owned = await db()
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!owned[0]) return false;
  await supersedePendingDrafts(conversationId, "closed");
  await db()
    .update(conversations)
    .set({ status: "closed" })
    .where(eq(conversations.id, conversationId));
  return true;
}

/** P0-5: auto-close conversations idle for `idleDays` (worker hourly sweep). */
export async function closeIdleConversations(idleDays = 7) {
  const cutoff = new Date(Date.now() - idleDays * 24 * 60 * 60 * 1000);
  const idle = await db()
    .select({ id: conversations.id, workspaceId: conversations.workspaceId })
    .from(conversations)
    .where(
      and(
        inArray(conversations.status, ["open", "waiting_approval"]),
        lt(conversations.lastMessageAt, cutoff),
      ),
    )
    .limit(500);
  for (const c of idle) {
    await closeConversation(c.workspaceId, c.id);
  }
  return idle.length;
}
