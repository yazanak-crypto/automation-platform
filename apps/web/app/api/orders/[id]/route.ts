import { getOrderDetail } from "@platform/core";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export const runtime = "nodejs";

/**
 * One order, including the EXACT default messages the dialogs will show.
 *
 * The messages are rendered server-side and returned here so the text the owner
 * reads is the text the server would send. The client never composes its own —
 * a second render is a second source of truth, and the two would drift.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const detail = await getOrderDetail(ctx.workspace.id, id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(detail);
}
