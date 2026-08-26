import { confirmCatalog } from "@platform/brain";
import { brainEmbedQueue } from "@platform/core";
import { CATALOG_MAX_ITEMS } from "@platform/brain/verticals";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export const runtime = "nodejs";

const rowSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.string().optional(),
  description: z.string().optional(),
  attributes: z.record(z.string()).optional(),
  issue: z.string().optional(),
  raw: z.string().optional(),
});

const bodySchema = z.object({
  rows: z.array(rowSchema).max(CATALOG_MAX_ITEMS),
  source: z.enum(["file", "paste", "manual"]),
  sourceName: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { answer, itemIds } = await confirmCatalog(
    ctx.workspace.id,
    parsed.data.rows,
    ctx.actor,
    { source: parsed.data.source, sourceName: parsed.data.sourceName },
  );

  // Enqueued, not awaited: 300 items means 300 embedding calls, and the owner
  // should not watch a spinner for them. Items are already `confirmed`, and
  // knowledge retrieval falls back to ILIKE, so they are findable in the gap.
  await Promise.all(
    itemIds.map((id) =>
      brainEmbedQueue()
        .add("embed", { workspaceId: ctx.workspace.id, knowledgeItemId: id })
        .catch(() => {
          // Best-effort, exactly as the single-item knowledge route treats it.
        }),
    ),
  );

  return NextResponse.json({ answer, imported: itemIds.length }, { status: 201 });
}
