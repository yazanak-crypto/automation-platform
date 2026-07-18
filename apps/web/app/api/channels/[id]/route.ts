import { channels, db } from "@platform/db";
import { channelPatchSchema } from "@platform/schemas";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const parsed = channelPatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const scope = and(eq(channels.id, id), eq(channels.workspaceId, ctx.workspace.id));
  const existing = await db().select().from(channels).where(scope).limit(1);
  if (!existing[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { allowedOrigins, regenerateKey, ...rest } = parsed.data;
  const rows = await db()
    .update(channels)
    .set({
      ...rest,
      ...(allowedOrigins !== undefined
        ? { config: { ...existing[0].config, allowedOrigins } }
        : {}),
      ...(regenerateKey ? { widgetKey: sql`gen_random_uuid()` } : {}),
    })
    .where(scope)
    .returning();
  return NextResponse.json(rows[0]);
}
