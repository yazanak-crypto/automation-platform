import { deleteKnowledge, patchKnowledge } from "@platform/brain";
import { brainEmbedQueue } from "@platform/core";
import { knowledgePatchSchema } from "@platform/schemas";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const parsed = knowledgePatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const result = await patchKnowledge(ctx.workspace.id, id, parsed.data, ctx.actor);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result.needsEmbedding) {
    await brainEmbedQueue()
      .add("embed", { workspaceId: ctx.workspace.id, knowledgeItemId: id })
      .catch(() => {});
  }
  return NextResponse.json(result.item);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const ok = await deleteKnowledge(ctx.workspace.id, id, ctx.actor);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
