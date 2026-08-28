import * as Sentry from "@sentry/nextjs";
import { deliverOutbound } from "@platform/channels";
import { decideOrder } from "@platform/core";
import { orderDecisionSchema } from "@platform/schemas";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export const runtime = "nodejs";

/**
 * Confirm or cancel an order and tell the customer.
 *
 * `message` is REQUIRED and is sent verbatim. It is whatever the owner had in
 * front of them in the dialog, so there is no path where the text they approved
 * differs from the text that goes out — the server never re-renders it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const { id } = await params;

  const parsed = orderDecisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await decideOrder({
    workspaceId: ctx.workspace.id,
    orderId: id,
    userId: ctx.user.id,
    action: parsed.data.action,
    messageBody: parsed.data.message,
    deliver: (messageId) => deliverOutbound(messageId),
  });
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!result.notified) {
    // 200, not an error: the DECISION succeeded and is recorded. Only the
    // notification failed, and the response says so explicitly so the UI can
    // tell the owner their customer was not reached. Reporting it as a failure
    // would imply the confirm did not stick, which is worse than the truth.
    console.error(`[orders] ${parsed.data.action} notified nobody:`, result.notifyError);
    Sentry.captureException(new Error(`Order decision not delivered: ${result.notifyError}`), {
      tags: { path: "order-decision", orderId: id, action: parsed.data.action },
    });
  }

  return NextResponse.json(result);
}
