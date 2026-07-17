import { createKnowledge } from "@platform/brain";
import { brainEmbedQueue } from "@platform/core";
import { knowledgeInputSchema } from "@platform/schemas";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const parsed = knowledgeInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const item = await createKnowledge(ctx.workspace.id, parsed.data, ctx.actor);
  await brainEmbedQueue()
    .add("embed", { workspaceId: ctx.workspace.id, knowledgeItemId: item.id })
    .catch(() => {
      // Embedding is best-effort; the item exists either way.
    });
  return NextResponse.json(item, { status: 201 });
}
