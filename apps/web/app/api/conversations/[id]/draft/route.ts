import { conversations, db, messages, runs } from "@platform/db";
import { draftActionSchema } from "@platform/schemas";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

/**
 * Approve / dismiss the pending draft. The ONLY way an AI reply becomes
 * visible to a visitor (AC-2.10). Edited text sends exactly as edited.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const parsed = draftActionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const draft = await db()
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, id),
        eq(messages.workspaceId, ctx.workspace.id),
        eq(messages.draftStatus, "pending_approval"),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);
  if (!draft[0]) return NextResponse.json({ error: "No pending draft" }, { status: 404 });

  const pending = draft[0];
  const approved = parsed.data.action === "approve";
  const edited = approved && !!parsed.data.editedBody && parsed.data.editedBody !== pending.body;

  await db().transaction(async (tx) => {
    await tx
      .update(messages)
      .set({
        draftStatus: approved ? "approved" : "dismissed",
        ...(edited ? { body: parsed.data.editedBody! } : {}),
        ...(approved
          ? { approvedBy: ctx.user.id, approvedAt: new Date(), deliveryState: "visible" }
          : {}),
      })
      .where(eq(messages.id, pending.id));
    await tx
      .update(conversations)
      .set({ status: "open", lastMessageAt: new Date() })
      .where(eq(conversations.id, id));
    // Close out the waiting run on our ledger.
    const run = await tx
      .select()
      .from(runs)
      .where(and(eq(runs.conversationId, id), eq(runs.status, "waiting_approval")))
      .orderBy(desc(runs.startedAt))
      .limit(1);
    if (run[0]) {
      await tx
        .update(runs)
        .set({
          status: "succeeded",
          finishedAt: new Date(),
          outcomeMetrics: {
            ...(run[0].outcomeMetrics ?? {}),
            resolution: approved ? (edited ? "approved_edited" : "approved") : "dismissed",
          },
        })
        .where(eq(runs.id, run[0].id));
    }
  });

  return NextResponse.json({ ok: true, action: parsed.data.action });
}
