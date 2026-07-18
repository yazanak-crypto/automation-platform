import { getDefinition } from "@platform/catalog";
import { computeGraduation, resolvePolicy } from "@platform/core";
import { activations, db, workspaces } from "@platform/db";
import {
  RISK_TIERS,
  type ActivationAutonomyOverrides,
  type WorkspaceAutonomySettings,
} from "@platform/schemas";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

/** Everything the autonomy settings page needs, in one call. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ activationId: string }> },
) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const { activationId } = await params;

  const rows = await db()
    .select()
    .from(activations)
    .where(and(eq(activations.id, activationId), eq(activations.workspaceId, ctx.workspace.id)))
    .limit(1);
  const activation = rows[0];
  if (!activation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const def = getDefinition(activation.automationSlug);
  if (!def) return NextResponse.json({ error: "Unknown automation" }, { status: 404 });

  const wsRows = await db()
    .select({ autonomySettings: workspaces.autonomySettings })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspace.id))
    .limit(1);
  const workspaceSettings = (wsRows[0]?.autonomySettings ??
    null) as WorkspaceAutonomySettings | null;
  const overrides = (activation.autonomyOverrides ?? null) as ActivationAutonomyOverrides | null;

  const effective = resolvePolicy(def.autonomyPolicy, workspaceSettings, overrides);
  const graduation = await computeGraduation(
    ctx.workspace.id,
    activation.id,
    activation.activatedAt,
  );

  return NextResponse.json({
    activation: {
      id: activation.id,
      automationSlug: activation.automationSlug,
      automationName: def.name,
      mode: activation.mode,
      status: activation.status,
    },
    effective,
    recommended: def.autonomyPolicy,
    riskTiers: RISK_TIERS,
    workspaceSettings,
    overrides,
    graduation,
  });
}
