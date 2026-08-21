"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface Plan {
  id: string;
  name: string;
  monthlyCredits: number;
  /** Computed server-side from core — never divide credits in the client. */
  conversations: number;
  priceMonthlyUsd: number;
  setupFeeUsd: number;
  purchasable: boolean;
}

interface Data {
  status: {
    plan: string;
    allowance: number;
    used: number;
    remaining: number;
    exhausted: boolean;
    conversationsUsed: number;
    conversationsAllowance: number;
    periodEnd: string;
    subscriptionStatus: string | null;
    trialEndsAt: string | null;
    trialEnded: boolean;
  };
  plans: Plan[];
  billingConfigured: boolean;
  /** Any card provider live (Paddle or Stripe). Gates provider-neutral UI. */
  cardBilling: boolean;
}

export default function BillingPage() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Post-checkout confirmation.
   *
   * Paddle's overlay has no redirect, and `checkout.completed` fires in the
   * BROWSER the moment payment succeeds — before the webhook has created the
   * subscription row. Claiming "You're on Premium" at that point would be a
   * lie for a few seconds, and a lie the customer can disprove by looking at
   * the sidebar. So this is three honest states rather than one cheer:
   *
   *   activating — paid, entitlement not visible yet (the normal 1-5s)
   *   active     — the plan actually changed; say so, then get out of the way
   *   slow       — it did not land in time; point at Refresh, which repairs it
   *
   * "slow" is not an error. The reconciliation path exists precisely because
   * webhooks can be dropped permanently, so this hands them the working button
   * instead of a support ticket.
   */
  const [upgrade, setUpgrade] = useState<
    { state: "activating" | "slow" } | { state: "active"; planName: string } | null
  >(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Timers outlive a fast navigation away from this page; clear them so a
  // resolved poll cannot setState on an unmounted component.
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const load = useCallback(async () => {
    const res = await fetch("/api/billing");
    if (res.ok) setData(await res.json());
  }, []);
  useEffect(() => { void load(); }, [load]);

  /**
   * Re-read the subscription from the payment provider.
   *
   * Separate from go() because this one has no redirect and no overlay — it
   * reports an outcome in place and reloads the page data. It exists for the
   * customer holding a receipt whose plan has not changed: webhooks can be
   * dropped permanently, and without this their only recourse is support.
   */
  async function refresh() {
    setBusy("refresh");
    setError(null);
    setNotice(null);
    const res = await fetch("/api/billing/refresh", { method: "POST" }).catch(() => null);
    const payload = await res?.json().catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setError(payload?.error ?? "That didn’t work — try again.");
      return;
    }
    setNotice(payload?.message ?? "Checked.");
    if (payload?.updated) await load();
  }

  /**
   * Poll until the plan actually changes, then confirm it.
   *
   * Compares against the plan as it was BEFORE checkout rather than against a
   * hardcoded target: an upgrade from Starter to Premium and a first purchase
   * from trial both just mean "it moved".
   */
  async function awaitUpgrade(planBefore: string) {
    const DEADLINE_MS = 20_000;
    const INTERVAL_MS = 2_000;
    const started = Date.now();

    const tick = async () => {
      const res = await fetch("/api/billing").catch(() => null);
      const payload = res?.ok ? ((await res.json().catch(() => null)) as Data | null) : null;

      if (payload && payload.status.plan !== planBefore) {
        setData(payload);
        const planName =
          payload.plans.find((p) => p.id === payload.status.plan)?.name ?? payload.status.plan;
        setUpgrade({ state: "active", planName });
        // Confirmation is a moment, not a permanent banner.
        timers.current.push(setTimeout(() => setUpgrade(null), 6_000));
        return;
      }
      if (Date.now() - started >= DEADLINE_MS) {
        setUpgrade({ state: "slow" });
        return;
      }
      timers.current.push(setTimeout(() => void tick(), INTERVAL_MS));
    };

    timers.current.push(setTimeout(() => void tick(), INTERVAL_MS));
  }

  async function go(path: string, body?: unknown, key = path) {
    setBusy(key);
    setError(null);
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setError((await res?.json().catch(() => null))?.error ?? "That didn’t work — try again.");
      return;
    }
    const payload = await res.json();

    // Stripe hands back a hosted URL to redirect to. Paddle has no such URL —
    // the checkout is an overlay opened by Paddle.js against a transaction the
    // server already created, so the browser never sees a price id.
    if (payload.provider === "paddle" && payload.transactionId) {
      try {
        // Unreachable in practice — the upgrade buttons only render once `data`
        // has loaded. Guarded rather than defaulted: a made-up "plan before"
        // would make the confirmation fire against the wrong baseline.
        if (!data) return;
        const planBefore = data.status.plan;
        const { initializePaddle } = await import("@paddle/paddle-js");
        const paddle = await initializePaddle({
          environment:
            process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox",
          token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "",
          // Fires in the browser the instant payment succeeds — which is BEFORE
          // the webhook has granted anything. It is a cue to start watching,
          // not proof of entitlement.
          eventCallback: (event) => {
            if (event.name === "checkout.completed") {
              setError(null);
              setNotice(null);
              setUpgrade({ state: "activating" });
              void awaitUpgrade(planBefore);
            }
          },
        });
        if (!paddle) throw new Error("Paddle failed to initialise");
        paddle.Checkout.open({ transactionId: payload.transactionId });
      } catch {
        // A blocked script or a missing client token would otherwise leave the
        // button looking dead, which is the hardest failure to diagnose.
        setError("The payment window couldn't open. Please refresh and try again.");
      }
      return;
    }

    if (payload.url) window.location.href = payload.url;
  }

  if (!data)
    return (
      <main className="mx-auto max-w-2xl p-8" role="status" aria-label="Loading">
        <div className="skeleton h-7 w-32" />
        <div className="skeleton mt-6 h-28 w-full" />
        <div className="skeleton mt-6 h-40 w-full" />
      </main>
    );
  const { status, plans } = data;
  const pct = status.allowance === 0 ? 100 : Math.min(100, Math.round((status.used / status.allowance) * 100));
  const currentPlan = plans.find((p) => p.id === status.plan);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <p className="mt-1 text-sm text-ink-2">
        Start with 7 days free. Each plan covers a set number of customer conversations per month —
        upgrade anytime as you grow.
      </p>
      {error && <p className="mt-4 text-sm text-stop">{error}</p>}
      {notice && <p className="mt-4 text-sm text-ink-2">{notice}</p>}

      {/* Post-checkout confirmation. Inline and quiet — no modal, no confetti.
          aria-live so it is announced without stealing focus. */}
      {upgrade && (
        <p
          aria-live="polite"
          className={`mt-4 text-sm ${upgrade.state === "active" ? "text-brass" : "text-ink-2"}`}
        >
          {upgrade.state === "activating" && "Payment received — activating your plan…"}
          {upgrade.state === "active" && `You're on ${upgrade.planName}.`}
          {upgrade.state === "slow" && (
            <>
              Payment received. Your plan will update shortly — use{" "}
              <button
                onClick={() => void refresh()}
                disabled={busy === "refresh"}
                className="underline underline-offset-2 hover:text-ink disabled:opacity-50"
              >
                Refresh
              </button>{" "}
              if it doesn’t.
            </>
          )}
        </p>
      )}

      <section className="mt-6 rounded-xl border border-line p-5">
        <div className="flex items-center justify-between">
          <p className="font-medium">
            {currentPlan?.name ?? status.plan}
            {status.plan === "trial" && status.trialEndsAt && !status.trialEnded && (
              <span className="ml-2 rounded-full bg-brass-dim px-2 py-0.5 text-[11px] font-medium text-brass">
                {Math.max(1, Math.ceil((new Date(status.trialEndsAt).getTime() - Date.now()) / 86400000))} day{Math.ceil((new Date(status.trialEndsAt).getTime() - Date.now()) / 86400000) === 1 ? "" : "s"} left
              </span>
            )}
            {status.trialEnded && (
              <span className="ml-2 rounded-full bg-stop-dim px-2 py-0.5 text-[11px] font-medium text-stop">
                trial ended
              </span>
            )}
            {status.subscriptionStatus && status.subscriptionStatus !== "active" && (
              <span className="ml-2 rounded-full bg-wait-dim px-2 py-0.5 text-[11px] font-medium text-wait">
                {status.subscriptionStatus}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            {/* Deliberately NOT gated on having a subscription row: the case this
                exists for is having paid and having no row. */}
            {data.cardBilling && (
              <button
                onClick={() => void refresh()}
                disabled={busy === "refresh"}
                title="Re-check your subscription with the payment provider"
                className="press-glow rounded-lg px-3 py-1.5 text-xs text-ink-2 transition-transform hover:text-ink active:scale-[0.97] disabled:opacity-50"
              >
                {busy === "refresh" ? "Checking…" : "Refresh"}
              </button>
            )}
            {status.subscriptionStatus && (
              <button
                onClick={() => go("/api/billing/portal", undefined, "portal")}
                disabled={busy === "portal"}
                className="press-glow rounded-lg bg-hover px-3 py-1.5 text-xs transition-transform active:scale-[0.97] disabled:opacity-50"
              >
                Manage subscription
              </button>
            )}
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-sm">
            <span className={status.exhausted ? "text-stop" : "text-ink-2"}>
              {status.conversationsUsed.toLocaleString()} of {status.conversationsAllowance.toLocaleString()} conversations used
            </span>
            <span className="text-ink-3">
              resets {new Date(status.periodEnd).toLocaleDateString()}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-hover">
            <div
              className={`h-full ${status.exhausted ? "bg-stop" : pct > 85 ? "bg-wait" : "bg-ok"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {status.exhausted && (
            <p className="mt-2 text-sm text-stop">
              {status.trialEnded
                ? "Your free trial has ended — pick a plan to put your AI back on duty."
                : "You've used this month's conversations — the AI has paused. New messages wait in Conversations for your own reply until you upgrade or the month resets."}
            </p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-medium">Plans</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = p.id === status.plan;
            return (
              <div
                key={p.id}
                className={`rounded-xl border p-5 ${isCurrent ? "border-line-strong" : "border-line"}`}
              >
                <p className="font-medium">{p.name}</p>
                {p.priceMonthlyUsd > 0 ? (
                  <>
                    <p className="mt-1 text-2xl font-semibold">
                      ${p.priceMonthlyUsd}
                      <span className="text-sm font-normal text-ink-3">/month</span>
                    </p>
                    {p.setupFeeUsd > 0 && (
                      // Not "+ $X": the setup fee replaces month one rather
                      // than adding to it, so a "+" overstates what they pay
                      // today and understates what they pay later.
                      <p className="mt-0.5 text-[12.5px] text-ink-2">
                        ${p.setupFeeUsd} to start, then ${p.priceMonthlyUsd}/month from day 31
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-2xl font-semibold">Free</p>
                )}
                <p className="mt-2 text-sm text-ink-2">
                  {p.id === "trial"
                    ? "7 days free · full product"
                    : `About ${p.conversations.toLocaleString()} customer conversations / month`}
                </p>
                {isCurrent ? (
                  <p className="mt-4 text-xs text-ink-3">Current plan</p>
                ) : p.purchasable ? (
                  // Stripe path — only reachable when BILLING_ENABLED is on.
                  <button
                    onClick={() => go("/api/billing/checkout", { plan: p.id }, p.id)}
                    disabled={busy === p.id}
                    className="press-glow mt-4 w-full rounded-lg bg-white py-2 text-sm font-medium text-black transition-transform active:scale-[0.97] disabled:opacity-50"
                  >
                    {busy === p.id ? "Redirecting…" : "Upgrade"}
                  </button>
                ) : p.id !== "trial" ? (
                  // Default path: manual bank/Whish payment, never Stripe.
                  <Link
                    href={`/checkout?plan=${p.id}`}
                    className="press-glow mt-4 block w-full rounded-lg bg-white py-2 text-center text-sm font-medium text-black transition-transform active:scale-[0.97]"
                  >
                    Upgrade
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <p className="mt-6 text-[12px] leading-relaxed text-ink-3">
        The setup fee is your first payment and covers your first month — it is not charged on top.
        The monthly price then begins on day 31. The free trial is one time only and does not renew.
        You can cancel anytime and your plan stays active until the end of the period. By subscribing
        you agree to our{" "}
        <a href="/terms" className="underline hover:text-ink-2">Terms</a> and{" "}
        <a href="/refunds" className="underline hover:text-ink-2">Refund Policy</a>.
      </p>
    </main>
  );
}
