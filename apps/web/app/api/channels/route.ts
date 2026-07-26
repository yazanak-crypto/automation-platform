import { getBlockedOrigin } from "@platform/core";
import { channels, db } from "@platform/db";
import { channelCreateSchema } from "@platform/schemas";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";
import { accountInactive } from "@/lib/activation";

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  if (!ctx.user.isActive) return accountInactive();
  const rows = await db()
    .select()
    .from(channels)
    .where(eq(channels.workspaceId, ctx.workspace.id))
    .orderBy(desc(channels.createdAt));
  const withDiag = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      lastBlockedOrigin: r.type === "web_chat" ? await getBlockedOrigin(r.widgetKey) : null,
    })),
  );
  return NextResponse.json(withDiag);
}

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  if (!ctx.user.isActive) return accountInactive();
  const parsed = channelCreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const rows = await db()
    .insert(channels)
    .values({
      workspaceId: ctx.workspace.id,
      type: parsed.data.type,
      displayName: parsed.data.displayName,
      config: { allowedOrigins: parsed.data.allowedOrigins },
      capabilities: { supportsRichText: false },
    })
    .returning();
  return NextResponse.json(rows[0], { status: 201 });
}
