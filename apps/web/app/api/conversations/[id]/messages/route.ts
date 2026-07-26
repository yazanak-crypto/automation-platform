import { deliverOutbound, supersedePendingDrafts } from "@platform/channels";
import { conversations, db, messages } from "@platform/db";
import { manualReplySchema } from "@platform/schemas";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";
import { accountInactive } from "@/lib/activation";

/** Owner types a manual reply — owner-authored, so it is approved by definition. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  if (!ctx.user.isActive) return accountInactive();
  const { id } = await params;
  const parsed = manualReplySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const convo = await db()
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.workspaceId, ctx.workspace.id)))
    .limit(1);
  if (!convo[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Audit P0-1/P0-2: a manual reply retires any pending draft and resolves
  // waiting runs (incl. needs-human) so attention items clear.
  await supersedePendingDrafts(id, "manual_reply");

  const rows = await db().transaction(async (tx) => {
    const inserted = await tx
      .insert(messages)
      .values({
        workspaceId: ctx.workspace.id,
        conversationId: id,
        direction: "outbound",
        body: parsed.data.body,
        aiGenerated: false,
        draftStatus: "approved",
        approvedBy: ctx.user.id,
        approvedAt: new Date(),
        deliveryState: "visible",
      })
      .returning();
    await tx
      .update(conversations)
      .set({ status: "open", lastMessageAt: new Date() })
      .where(eq(conversations.id, id));
    return inserted;
  });
  let delivery: "ok" | "failed" = "ok";
  await deliverOutbound(rows[0]!.id).catch(async () => {
    delivery = "failed";
    await db()
      .update(conversations)
      .set({ status: "waiting_approval", attentionReason: "Your reply failed to send — try again" })
      .where(eq(conversations.id, id));
  });
  return NextResponse.json({ ...rows[0], delivery }, { status: 201 });
}
