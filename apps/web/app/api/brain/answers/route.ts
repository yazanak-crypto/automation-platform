import { getProfileAnswers, saveProfileAnswers } from "@platform/brain";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

// Guided setup answers. Kept separate from /api/brain/profile so the advanced
// Knowledge view and its patch semantics stay exactly as they were.

const bodySchema = z.object({
  vertical: z.string().max(40).optional(),
  // Values are validated by shape at the edges (string/bool/array/object) —
  // the question set is data and changes without a deploy, so an exhaustive
  // per-question schema here would go stale and start rejecting valid answers.
  values: z.record(z.string().max(60), z.unknown()).optional(),
  guessed: z.array(z.string().max(60)).max(200).optional(),
  completed: z.boolean().optional(),
});

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  return NextResponse.json(await getProfileAnswers(ctx.workspace.id));
}

export async function PATCH(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const saved = await saveProfileAnswers(ctx.workspace.id, parsed.data, ctx.actor);
  return NextResponse.json(saved);
}
