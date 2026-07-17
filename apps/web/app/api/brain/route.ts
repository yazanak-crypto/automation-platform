import { getBrain } from "@platform/brain";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const brain = await getBrain(ctx.workspace.id);
  return NextResponse.json(brain);
}
