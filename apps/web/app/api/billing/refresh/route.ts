import { paddleSyncConfigured, reconcilePaddleSubscriptions } from "@platform/core";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

/**
 * Manual drift repair for the signed-in workspace.
 *
 * The hourly worker sweep is the safety net; this is the button for the person
 * staring at a receipt and a plan that has not changed. Without it their only
 * options are waiting up to an hour or asking us to replay a webhook by hand —
 * both of which we lived through once already.
 *
 * Scoped to the caller's own workspace, so it cannot be used to probe or repair
 * anyone else's, and it re-reads Paddle rather than trusting anything the
 * browser sends: the request body is ignored entirely.
 */
export async function POST() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();

  if (!paddleSyncConfigured()) {
    return NextResponse.json({ error: "Card billing isn’t configured." }, { status: 503 });
  }

  try {
    const { checked, repaired } = await reconcilePaddleSubscriptions({
      workspaceId: ctx.workspace.id,
    });

    if (repaired.length > 0) {
      // A repair here means the webhook path failed for this customer. Worth a
      // log line: the button working is good news, but it is also evidence.
      console.warn(
        `[billing.refresh] repaired workspace ${ctx.workspace.id}: ` +
          repaired.map((r) => `${r.from} -> ${r.to}`).join(", "),
      );
      return NextResponse.json({ updated: true, message: "Your plan has been updated." });
    }

    // No live subscription found at all reads differently from "already correct",
    // and telling them apart is the difference between "wait a moment" and
    // "your payment never completed".
    if (checked === 0) {
      return NextResponse.json({
        updated: false,
        message:
          "No active subscription found for this workspace. If you just paid, give it a minute and try again.",
      });
    }
    return NextResponse.json({ updated: false, message: "Your plan is already up to date." });
  } catch (err) {
    console.error(`[billing.refresh] failed for workspace ${ctx.workspace.id}:`, err);
    return NextResponse.json(
      { error: "Couldn’t reach the payment provider. Please try again shortly." },
      { status: 502 },
    );
  }
}
