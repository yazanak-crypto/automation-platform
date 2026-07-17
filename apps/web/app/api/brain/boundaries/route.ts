import { createBoundary } from "@platform/brain";
import { boundaryInputSchema } from "@platform/schemas";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const parsed = boundaryInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const boundary = await createBoundary(ctx.workspace.id, parsed.data, ctx.actor);
  return NextResponse.json(boundary, { status: 201 });
}
