import { applySubscriptionState, isPlanId } from "@platform/core";
import { db, subscriptions } from "@platform/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { paddle, paddleConfigured, planForPaddlePrice } from "@/lib/paddle";
import { requireWorkspace as _unused } from "@/lib/workspace";

// Paddle webhook — signature-verified, and the only writer of subscription
// state for the Paddle provider. Idempotent by construction: every event
// upserts the CURRENT state rather than applying a delta, so a redelivery is a
// no-op and events arriving out of order settle on the latest one.

export const dynamic = "force-dynamic";
// Signature verification needs the exact raw bytes.
export const runtime = "nodejs";

void _unused; // route is public; auth comes from the signature, not a session

/** Shape we read off a Paddle subscription, kept narrow on purpose. */
interface PaddleSubscriptionLike {
  id: string;
  status: string;
  customerId: string;
  customData?: unknown;
  items?: { price?: { id?: string } | null }[];
  currentBillingPeriod?: { startsAt?: string | null; endsAt?: string | null } | null;
}

/**
 * Describe the configured secret WITHOUT logging it: length, prefix, and
 * whether it looks like a signing key at all. Enough to spot the ID-vs-key
 * mix-up from a log line; useless to anyone who reads the log.
 */
function describeSecret(secret: string | undefined): string {
  if (!secret) return "not set";
  if (secret.startsWith("ntfset_")) {
    return `len ${secret.length}, looks like a notification-setting ID, not its signing key (expected "pdl_ntfset_…")`;
  }
  if (!secret.startsWith("pdl_")) {
    return `len ${secret.length}, unexpected prefix (expected "pdl_ntfset_…")`;
  }
  return `len ${secret.length}, prefix ok`;
}

function planFromItems(sub: PaddleSubscriptionLike) {
  for (const item of sub.items ?? []) {
    const priceId = item?.price?.id;
    if (priceId) {
      const plan = planForPaddlePrice(priceId);
      if (plan) return plan;
    }
  }
  return null;
}

/**
 * Which workspace does this subscription belong to?
 *
 * custom_data set at checkout is the primary link. Falling back to the stored
 * customer id matters for later events: Paddle does not always echo the
 * transaction's custom_data onto every subsequent subscription event, and a
 * renewal we cannot attribute is a customer silently losing access.
 */
async function resolveWorkspaceId(sub: PaddleSubscriptionLike): Promise<string | null> {
  const custom = sub.customData as { workspaceId?: unknown } | null | undefined;
  if (custom && typeof custom.workspaceId === "string") return custom.workspaceId;

  const row = await db()
    .select({ workspaceId: subscriptions.workspaceId })
    .from(subscriptions)
    .where(eq(subscriptions.providerCustomerId, sub.customerId))
    .limit(1);
  return row[0]?.workspaceId ?? null;
}

export async function POST(req: Request) {
  if (!paddleConfigured()) {
    return NextResponse.json({ error: "Paddle not configured" }, { status: 503 });
  }
  const signature = req.headers.get("paddle-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const raw = await req.text();
  let event;
  try {
    event = await paddle().webhooks.unmarshal(
      raw,
      process.env.PADDLE_WEBHOOK_SECRET!,
      signature,
    );
  } catch (err) {
    // Logged, not silent. 26 consecutive rejections once produced zero output:
    // the checkout succeeded, Paddle's dashboard showed deliveries, and the only
    // evidence was a 400 status with an empty body. The cause was
    // PADDLE_WEBHOOK_SECRET holding the notification-setting ID (`ntfset_…`)
    // instead of its signing key (`pdl_ntfset_…`) — indistinguishable from a
    // forged request without a log line saying which secret we verified against.
    console.error(
      `[paddle.webhook] signature verification FAILED ` +
        `(secret ${describeSecret(process.env.PADDLE_WEBHOOK_SECRET)}): ` +
        (err instanceof Error ? err.message : String(err)),
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  if (!event) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  // Only subscription events change entitlement. transaction.completed is the
  // setup fee landing; it is logged but grants nothing on its own — the
  // subscription record is the entitlement, so acting on both would risk
  // granting access from a payment whose subscription never materialised.
  if (!event.eventType.startsWith("subscription.")) {
    console.log(`[paddle.webhook] ${event.eventType} (no entitlement change)`);
    return NextResponse.json({ received: true });
  }

  const sub = event.data as unknown as PaddleSubscriptionLike;
  const workspaceId = await resolveWorkspaceId(sub);
  if (!workspaceId) {
    // Ack rather than 4xx: Paddle retries non-2xx, and a subscription we cannot
    // attribute will never become attributable by retrying.
    console.error(
      `[paddle.webhook] ${event.eventType}: no workspace for customer ${sub.customerId} (sub ${sub.id})`,
    );
    return NextResponse.json({ received: true });
  }

  const plan = planFromItems(sub);
  if (!plan || !isPlanId(plan)) {
    console.error(`[paddle.webhook] ${event.eventType}: unrecognised price on sub ${sub.id}`);
    return NextResponse.json({ received: true });
  }

  const period = sub.currentBillingPeriod;
  await applySubscriptionState({
    workspaceId,
    provider: "paddle",
    providerCustomerId: sub.customerId,
    providerSubscriptionId: sub.id,
    plan,
    status: sub.status,
    // Null during a trial, which is correct: getCreditStatus falls back to a
    // calendar period rather than inventing one.
    currentPeriodStart: period?.startsAt ? new Date(period.startsAt) : null,
    currentPeriodEnd: period?.endsAt ? new Date(period.endsAt) : null,
  });

  console.log(
    `[paddle.webhook] ${event.eventType} → workspace ${workspaceId}: ${plan} (${sub.status})`,
  );
  return NextResponse.json({ received: true });
}
