import { getContactDetail } from "@platform/core";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const { id } = await params;
  // Scoped by workspace inside the query — a contact id from another tenant
  // resolves to null rather than leaking a stranger's message history.
  const detail = await getContactDetail(ctx.workspace.id, id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(detail);
}
