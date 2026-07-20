"use client";

import { useCallback, useEffect, useState } from "react";

interface Plan {
  id: string;
  name: string;
  monthlyCredits: number;
  priceMonthlyUsd: number;
  purchasable: boolean;
}
interface Data {
  status: {
    plan: string;
    allowance: number;
    used: number;
    remaining: number;
    exhausted: boolean;
    periodEnd: string;
    subscriptionStatus: string | null;
    trialEndsAt: string | null;
    trialEnded: boolean;
  };
  plans: Plan[];
  billingConfigured: boolean;
}

export default function BillingPage() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/billing");
    if (res.ok) setData(await res.json());
  }, []);
  useEffect(() => { void load(); }, [load]);

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
    const { url } = await res.json();
    if (url) window.location.href = url;
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
        Start with 7 days free. Paid plans include monthly AI credits — one credit ≈ one cent of
        AI work; most replies use a few.
      </p>
      {error && <p className="mt-4 text-sm text-stop">{error}</p>}

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
        <div className="mt-4">
          <div className="flex justify-between text-sm">
            <span className={status.exhausted ? "text-stop" : "text-ink-2"}>
              {status.used.toLocaleString()} of {status.allowance.toLocaleString()} credits used
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
                : "Credits are used up — the AI has paused. New messages wait in Conversations for your own reply until you upgrade or the month resets."}
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
                <p className="mt-1 text-2xl font-semibold">
                  ${p.priceMonthlyUsd}
                  <span className="text-sm font-normal text-ink-3">/mo</span>
                </p>
                <p className="mt-2 text-sm text-ink-2">
                  {p.id === "trial" ? "7 days free · full product" : `${p.monthlyCredits.toLocaleString()} AI credits / month`}
                </p>
                {isCurrent ? (
                  <p className="mt-4 text-xs text-ink-3">Current plan</p>
                ) : p.purchasable ? (
                  <button
                    onClick={() => go("/api/billing/checkout", { plan: p.id }, p.id)}
                    disabled={busy === p.id}
                    className="press-glow mt-4 w-full rounded-lg bg-white py-2 text-sm font-medium text-black transition-transform active:scale-[0.97] disabled:opacity-50"
                  >
                    {busy === p.id ? "Redirecting…" : "Upgrade"}
                  </button>
                ) : p.id !== "trial" ? (
                  <p className="mt-4 text-xs text-ink-3">
                    {data.billingConfigured ? "Not available yet" : "Billing not configured yet"}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
