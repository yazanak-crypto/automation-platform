import { getBlockedOrigin } from "@platform/core";
import { channels, db } from "@platform/db";
import { channelCreateSchema } from "@platform/schemas";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export async function GET(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const rows = await db()
    .select()
    .from(channels)
    .where(eq(channels.workspaceId, ctx.workspace.id))
    .orderBy(desc(channels.createdAt));

  // Blocked-origin diagnostics are a Redis read per web-chat channel. The
  // channels page polls this route continuously to show "connected ✓", so
  // fetching them every time meant a Redis round-trip every few seconds,
  // forever, for a hint that only matters during widget setup. Opt in with
  // ?diagnostics=1 — the page asks once on mount, not on every poll.
  if (new URL(req.url).searchParams.get("diagnostics") !== "1") {
    return NextResponse.json(rows.map((r) => ({ ...r, lastBlockedOrigin: null })));
  }

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
