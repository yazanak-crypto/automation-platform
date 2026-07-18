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

  if (!data) return <main className="p-8 text-neutral-500">Loading…</main>;
  const { status, plans } = data;
  const pct = status.allowance === 0 ? 100 : Math.min(100, Math.round((status.used / status.allowance) * 100));
  const currentPlan = plans.find((p) => p.id === status.plan);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Your plan includes monthly AI credits. One credit ≈ one cent of AI work — most replies use
        a few credits.
      </p>
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <section className="mt-6 rounded-xl border border-neutral-800 p-5">
        <div className="flex items-center justify-between">
          <p className="font-medium">
            {currentPlan?.name ?? status.plan}
            {status.subscriptionStatus && status.subscriptionStatus !== "active" && (
              <span className="ml-2 rounded-full bg-amber-950 px-2 py-0.5 text-xs text-amber-300">
                {status.subscriptionStatus}
              </span>
            )}
          </p>
          {status.subscriptionStatus && (
            <button
              onClick={() => go("/api/billing/portal", undefined, "portal")}
              disabled={busy === "portal"}
              className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              Manage subscription
            </button>
          )}
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-sm">
            <span className={status.exhausted ? "text-red-400" : "text-neutral-300"}>
              {status.used.toLocaleString()} of {status.allowance.toLocaleString()} credits used
            </span>
            <span className="text-neutral-500">
              resets {new Date(status.periodEnd).toLocaleDateString()}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-800">
            <div
              className={`h-full ${status.exhausted ? "bg-red-500" : pct > 85 ? "bg-amber-400" : "bg-emerald-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {status.exhausted && (
            <p className="mt-2 text-sm text-red-400">
              Credits are used up — the AI has paused. New messages wait in Conversations for your
              own reply until you upgrade or the month resets.
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
                className={`rounded-xl border p-5 ${isCurrent ? "border-neutral-400" : "border-neutral-800"}`}
              >
                <p className="font-medium">{p.name}</p>
                <p className="mt-1 text-2xl font-semibold">
                  ${p.priceMonthlyUsd}
                  <span className="text-sm font-normal text-neutral-500">/mo</span>
                </p>
                <p className="mt-2 text-sm text-neutral-400">
                  {p.monthlyCredits.toLocaleString()} AI credits / month
                </p>
                {isCurrent ? (
                  <p className="mt-4 text-xs text-neutral-500">Current plan</p>
                ) : p.purchasable ? (
                  <button
                    onClick={() => go("/api/billing/checkout", { plan: p.id }, p.id)}
                    disabled={busy === p.id}
                    className="mt-4 w-full rounded-lg bg-white py-2 text-sm font-medium text-black disabled:opacity-50"
                  >
                    {busy === p.id ? "Redirecting…" : "Upgrade"}
                  </button>
                ) : p.id !== "trial" ? (
                  <p className="mt-4 text-xs text-neutral-600">
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
