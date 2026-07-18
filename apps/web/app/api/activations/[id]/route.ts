import { getDefinition } from "@platform/catalog";
import { activations, db } from "@platform/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

const patchSchema = z
  .object({
    status: z.enum(["active", "paused", "deactivated"]).optional(),
    config: z.record(z.unknown()).optional(),
    channelIds: z.array(z.string().uuid()).min(1).max(10).optional(),
  })
  .strict();

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const scope = and(eq(activations.id, id), eq(activations.workspaceId, ctx.workspace.id));
  const existing = await db().select().from(activations).where(scope).limit(1);
  if (!existing[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let config = existing[0].config;
  if (parsed.data.config) {
    const def = getDefinition(existing[0].automationSlug);
    const validated = def?.configSchema.safeParse(parsed.data.config);
    if (!validated?.success) {
      return NextResponse.json({ error: "Invalid configuration" }, { status: 400 });
    }
    config = validated.data ?? {};
  }

  const rows = await db()
    .update(activations)
    .set({
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.channelIds ? { channelIds: parsed.data.channelIds } : {}),
      config,
      updatedAt: new Date(),
    })
    .where(scope)
    .returning();
  return NextResponse.json(rows[0]);
}
