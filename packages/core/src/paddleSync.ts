import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import { db, subscriptions } from "@platform/db";
import { eq } from "drizzle-orm";
import { applySubscriptionState, isPlanId, type PlanId } from "./billing";

/**
 * Reconciliation: Paddle is the source of truth, this repairs our copy.
 *
 * Webhooks are a delivery mechanism, not a guarantee. A sandbox checkout proved
 * it end to end: the customer paid, Paddle created the subscription, and every
 * one of the 28 notifications failed because the signing secret was wrong.
 * Paddle attempted each exactly THREE times over about two minutes and then
 * marked them permanently failed — no further retries, ever. The customer was
 * charged and sat on the trial plan with no path back except a manual replay.
 *
 * Any window where the endpoint is broken — a bad secret, a failed deploy, a
 * few minutes of 5xx — permanently loses entitlement for everyone who checked
 * out during it. That is not an acceptable failure mode for something that
 * takes money, so state is reconciled on a schedule as well as pushed.
 *
 * Both entry points here converge on applySubscriptionState(), the same writer
 * the webhook uses, so there is exactly one way subscription state is written.
 */

/** Statuses Paddle considers live. `trialing` entitles: the setup fee is paid. */
const ENTITLING_STATUSES = ["active", "trialing", "past_due"] as const;

export function paddleSyncConfigured(): boolean {
  return !!process.env.PADDLE_API_KEY;
}

let _paddle: Paddle | undefined;
function paddle(): Paddle {
  if (!process.env.PADDLE_API_KEY) throw new Error("PADDLE_API_KEY is not set");
  _paddle ??= new Paddle(process.env.PADDLE_API_KEY, {
    environment:
      process.env.PADDLE_ENV === "production" ? Environment.production : Environment.sandbox,
  });
  return _paddle;
}

/**
 * Which plan a recurring price sells. Reads the same env vars the checkout
 * route writes from, so a price id that checkout can sell is a price id
 * reconciliation can recognise — they cannot drift apart.
 */
export function planForPaddlePrice(priceId: string): PlanId | null {
  if (priceId && priceId === process.env.PADDLE_PRICE_STARTER) return "starter";
  if (priceId && priceId === process.env.PADDLE_PRICE_PRO) return "pro";
  return null;
}

/** A Paddle subscription flattened to the fields entitlement depends on. */
export interface RemoteSubscription {
  subscriptionId: string;
  customerId: string;
  workspaceId: string;
  plan: PlanId;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
}

interface RawSub {
  id: string;
  status: string;
  customer_id: string;
  custom_data?: { workspaceId?: unknown } | null;
  items?: { price?: { id?: string } | null }[];
  current_billing_period?: { starts_at?: string | null; ends_at?: string | null } | null;
}

function apiHost(): string {
  return process.env.PADDLE_ENV === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";
}

/**
 * Every live subscription Paddle knows about, normalised.
 *
 * Uses the REST endpoint rather than the SDK's pager because we need
 * `custom_data` on the LIST response: it carries the workspace id, and it is
 * the only link back to us for a subscription whose local row was never
 * written. Attributing by stored customer id cannot work in exactly the case
 * reconciliation exists to fix.
 */
export async function listRemoteSubscriptions(): Promise<{
  subscriptions: RemoteSubscription[];
  skipped: { id: string; reason: string }[];
}> {
  const out: RemoteSubscription[] = [];
  const skipped: { id: string; reason: string }[] = [];

  let after: string | null = null;
  // Bounded so a pagination bug cannot spin forever inside a scheduled job.
  for (let page = 0; page < 50; page++) {
    const url = new URL(`${apiHost()}/subscriptions`);
    url.searchParams.set("status", ENTITLING_STATUSES.join(","));
    url.searchParams.set("per_page", "100");
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.PADDLE_API_KEY}` },
    });
    if (!res.ok) {
      throw new Error(`Paddle subscriptions list failed: HTTP ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as {
      data?: RawSub[];
      meta?: { pagination?: { has_more?: boolean; next?: string } };
    };

    for (const raw of body.data ?? []) {
      const workspaceId = raw.custom_data?.workspaceId;
      if (typeof workspaceId !== "string" || !workspaceId) {
        // Cannot be attributed to anyone. Surfaced rather than dropped: it means
        // a checkout was created without custom_data, which is our bug.
        skipped.push({ id: raw.id, reason: "no workspaceId in custom_data" });
        continue;
      }
      const priceId = (raw.items ?? []).map((i) => i?.price?.id).find(Boolean);
      const plan = priceId ? planForPaddlePrice(priceId) : null;
      if (!plan || !isPlanId(plan)) {
        skipped.push({ id: raw.id, reason: `unrecognised price ${priceId ?? "(none)"}` });
        continue;
      }
      const period = raw.current_billing_period;
      out.push({
        subscriptionId: raw.id,
        customerId: raw.customer_id,
        workspaceId,
        plan,
        status: raw.status,
        currentPeriodStart: period?.starts_at ? new Date(period.starts_at) : null,
        currentPeriodEnd: period?.ends_at ? new Date(period.ends_at) : null,
      });
    }

    const pag = body.meta?.pagination;
    if (!pag?.has_more || !pag.next) break;
    // `next` is a full URL; we only need its `after` cursor.
    after = new URL(pag.next).searchParams.get("after");
    if (!after) break;
  }

  return { subscriptions: out, skipped };
}

/** What our database currently believes, for the workspaces Paddle named. */
async function localState(workspaceIds: string[]) {
  if (!workspaceIds.length) return new Map<string, { provider: string; plan: string; status: string; subscriptionId: string | null }>();
  const rows = await db()
    .select({
      workspaceId: subscriptions.workspaceId,
      provider: subscriptions.provider,
      plan: subscriptions.plan,
      status: subscriptions.status,
      subscriptionId: subscriptions.providerSubscriptionId,
    })
    .from(subscriptions);
  const wanted = new Set(workspaceIds);
  return new Map(
    rows
      .filter((r) => wanted.has(r.workspaceId))
      .map((r) => [
        r.workspaceId,
        { provider: r.provider, plan: r.plan, status: r.status, subscriptionId: r.subscriptionId },
      ]),
  );
}

export interface ReconcileReport {
  checked: number;
  repaired: { workspaceId: string; from: string; to: string }[];
  skipped: { id: string; reason: string }[];
}

/**
 * Pull live Paddle subscriptions and repair any that disagree with our copy.
 *
 * Only writes on an actual difference, so a healthy account is read-only and a
 * repair is a real signal in the logs rather than noise. Filtering to one
 * workspace makes this the manual "refresh" path; omitting it sweeps everything.
 */
export async function reconcilePaddleSubscriptions(
  opts: { workspaceId?: string } = {},
): Promise<ReconcileReport> {
  const { subscriptions: remote, skipped } = await listRemoteSubscriptions();
  const scoped = opts.workspaceId
    ? remote.filter((r) => r.workspaceId === opts.workspaceId)
    : remote;

  const local = await localState(scoped.map((r) => r.workspaceId));
  const repaired: ReconcileReport["repaired"] = [];

  for (const r of scoped) {
    const cur = local.get(r.workspaceId);

    // Never overwrite a Stripe row. A workspace on the legacy provider is not
    // drift, and clobbering it would hand the wrong provider's ids to the
    // portal and cancellation paths.
    if (cur && cur.provider !== "paddle") {
      skipped.push({ id: r.subscriptionId, reason: `workspace is on provider "${cur.provider}"` });
      continue;
    }

    const matches =
      cur &&
      cur.plan === r.plan &&
      cur.status === r.status &&
      cur.subscriptionId === r.subscriptionId;
    if (matches) continue;

    await applySubscriptionState({
      workspaceId: r.workspaceId,
      provider: "paddle",
      providerCustomerId: r.customerId,
      providerSubscriptionId: r.subscriptionId,
      plan: r.plan,
      status: r.status,
      currentPeriodStart: r.currentPeriodStart,
      currentPeriodEnd: r.currentPeriodEnd,
    });
    repaired.push({
      workspaceId: r.workspaceId,
      from: cur ? `${cur.plan}/${cur.status}` : "no row",
      to: `${r.plan}/${r.status}`,
    });
  }

  return { checked: scoped.length, repaired, skipped };
}
