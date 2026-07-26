import { getDefinition } from "@platform/catalog";
import { listActivations } from "@platform/core";
import { activations, automations, automationVersions, channels, db } from "@platform/db";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace, unauthorized } from "@/lib/workspace";
import { accountInactive } from "@/lib/activation";

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  if (!ctx.user.isActive) return accountInactive();
  return NextResponse.json(await listActivations(ctx.workspace.id));
}

const createSchema = z.object({
  automationSlug: z.string().max(100),
  config: z.record(z.unknown()).default({}),
  channelIds: z.array(z.string().uuid()).min(1).max(10),
  mode: z.enum(["supervised", "smart"]).default("supervised"),
});

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  if (!ctx.user.isActive) return accountInactive();
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { automationSlug, config, channelIds, mode } = parsed.data;

  // Config is validated against the automation's own Zod schema (catalog-as-code).
  const def = getDefinition(automationSlug);
  if (!def) return NextResponse.json({ error: "Unknown automation" }, { status: 404 });
  const configParsed = def.configSchema.safeParse(config);
  if (!configParsed.success) {
    return NextResponse.json({ error: "Invalid configuration" }, { status: 400 });
  }

  // Channels must belong to this workspace (tenancy).
  const owned = await db()
    .select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.workspaceId, ctx.workspace.id), inArray(channels.id, channelIds)));
  if (owned.length !== channelIds.length) {
    return NextResponse.json({ error: "Unknown channel" }, { status: 400 });
  }

  const versionRow = await db()
    .select({ id: automationVersions.id })
    .from(automations)
    .innerJoin(automationVersions, eq(automationVersions.id, automations.currentVersionId))
    .where(and(eq(automations.slug, automationSlug), eq(automations.status, "live")))
    .limit(1);
  if (!versionRow[0]) {
    return NextResponse.json(
      { error: "Automation not available — catalog not seeded?" },
      { status: 409 },
    );
  }

  // One live activation per automation per workspace in M1.
  const existing = await db()
    .select({ id: activations.id })
    .from(activations)
    .where(
      and(
        eq(activations.workspaceId, ctx.workspace.id),
        eq(activations.automationSlug, automationSlug),
        inArray(activations.status, ["active", "paused"]),
      ),
    )
    .limit(1);
  if (existing[0]) {
    return NextResponse.json({ error: "Already activated" }, { status: 409 });
  }

  const rows = await db()
    .insert(activations)
    .values({
      workspaceId: ctx.workspace.id,
      automationVersionId: versionRow[0].id,
      automationSlug,
      config: configParsed.data ?? {},
      channelIds,
      mode,
    })
    .returning();
  return NextResponse.json(rows[0], { status: 201 });
}
