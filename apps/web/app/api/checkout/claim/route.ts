import { emailProvider, isPayablePlan, recordClaim, takeLimit } from "@platform/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

// ~2MB decoded. Base64 inflates by 4/3, plus the data: URL prefix.
const MAX_SCREENSHOT_CHARS = Math.ceil(2 * 1024 * 1024 * (4 / 3)) + 100;
const DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

const bodySchema = z.object({
  plan: z.string().max(20),
  method: z.enum(["BANK", "WHISH"]),
  claimedReference: z.string().trim().min(3).max(120),
  screenshot: z
    .string()
    .max(MAX_SCREENSHOT_CHARS, "Screenshot must be under 2MB")
    .regex(DATA_URL_RE, "Screenshot must be a PNG, JPG, WEBP or GIF image")
    .optional()
    .nullable(),
});

/**
 * Record a manual payment claim (bank transfer / Whish). The amount and the
 * reference code are recomputed server-side from the plan catalog and user id —
 * nothing money-shaped is taken from the request body.
 */
export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  if (!isPayablePlan(parsed.data.plan)) {
    return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  }

  // Abuse guard: a real customer claims once. Repeated claims are confusion or
  // gaming, and provisional access spends real AI budget.
  if (!(await takeLimit(`claim:${ctx.workspace.id}`, 3, 86400))) {
    return NextResponse.json(
      { error: "Too many payment submissions today — please contact us directly." },
      { status: 429 },
    );
  }

  const result = await recordClaim({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    plan: parsed.data.plan,
    method: parsed.data.method,
    claimedReference: parsed.data.claimedReference,
    screenshot: parsed.data.screenshot ?? null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  // Tell the operator a payment is waiting (no-op until email is configured).
  if (emailProvider.configured && process.env.NOTIFICATIONS_TO_ADMIN) {
    await emailProvider
      .send({
        to: process.env.NOTIFICATIONS_TO_ADMIN,
        subject: `Payment claimed — ${ctx.workspace.name} (${parsed.data.plan})`,
        text: `${ctx.user.email} claims they paid $${result.payment.amountUsd} for ${parsed.data.plan} via ${parsed.data.method}.\nTheir reference: ${parsed.data.claimedReference}\nExpected code: ${result.payment.referenceCode}\n\nReview it in /admin.`,
        html: `<p><strong>${ctx.user.email}</strong> claims they paid <strong>$${result.payment.amountUsd}</strong> for ${parsed.data.plan} via ${parsed.data.method}.</p><p>Their reference: <code>${parsed.data.claimedReference}</code><br/>Expected code: <code>${result.payment.referenceCode}</code></p><p>Review it in /admin.</p>`,
      })
      .catch(() => ({ ok: false }));
  }

  return NextResponse.json(
    { ok: true, grantedProvisional: result.grantedProvisional },
    { status: 201 },
  );
}
