"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

type Action = "auto" | "approve" | "escalate";
interface Data {
  activation: { id: string; automationName: string; mode: "supervised" | "smart"; status: string };
  effective: { categoryActions: Record<string, Action>; minConfidence: number };
  recommended: { categoryActions: Record<string, Action | undefined> };
  riskTiers: Record<string, "low" | "medium" | "high">;
  workspaceSettings: { maxAutoRisk?: "none" | "low" | "medium" } | null;
  overrides: { categoryOverrides?: Record<string, Action>; holdingLineEnabled?: boolean } | null;
  graduation: {
    approvals: number;
    uneditedRate: number;
    currentUneditedStreak: number;
    wouldHaveAutoHandled: number;
    eligible: boolean;
  };
}

const TIER_LABELS = { low: "Low risk", medium: "Medium risk", high: "High risk" } as const;
const TIER_COPY = {
  low: "Routine questions with clear answers — safe to automate once grounded in your Business Brain.",
  medium: "Questions that shape a sale — automate when you're comfortable.",
  high: "Judgment calls. These always come to you; the AI never answers them on its own.",
} as const;

export default function AutonomyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [notice, setNotice] = useState<{ msg: string; kind: "ok" | "error" } | null>(null);
  const [confirmSmart, setConfirmSmart] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/autonomy/${id}`);
    if (res.ok) setData(await res.json());
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  function flash(msg: string, kind: "ok" | "error" = "ok") {
    setNotice({ msg, kind });
    setTimeout(() => setNotice(null), 3000);
  }

  async function patchActivation(body: Record<string, unknown>, okMsg: string) {
    const res = await fetch(`/api/activations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) return flash("That didn't save — try again.", "error");
    await load();
    flash(okMsg);
  }

  async function setMaxAutoRisk(maxAutoRisk: "none" | "low" | "medium") {
    const res = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autonomySettings: { ...(data?.workspaceSettings ?? {}), maxAutoRisk },
      }),
    }).catch(() => null);
    if (!res?.ok) return flash("That didn't save — try again.", "error");
    await load();
    flash("Risk tolerance updated for your whole workspace.");
  }

  async function setCategory(category: string, action: Action) {
    await patchActivation(
      {
        autonomyOverrides: {
          ...(data?.overrides ?? {}),
          categoryOverrides: {
            ...(data?.overrides?.categoryOverrides ?? {}),
            [category]: action,
          },
        },
      },
      "Saved — applies to the next message.",
    );
  }

  if (!data) return <main className="p-8 text-neutral-500">Loading…</main>;

  const { activation, effective, recommended, riskTiers, graduation } = data;
  const tiers: ("low" | "medium" | "high")[] = ["low", "medium", "high"];
  const supervised = activation.mode === "supervised";

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/dashboard" className="text-sm text-neutral-500 hover:text-neutral-300">← Dashboard</Link>
      <h1 className="mt-3 text-2xl font-semibold">{activation.automationName} — Autonomy</h1>
      <p className="mt-1 text-sm text-neutral-400">
        You decide what your AI handles on its own. We recommend settings; you control everything.
      </p>

      {notice && (
        <p className={`mt-4 text-sm ${notice.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{notice.msg}</p>
      )}

      {/* Mode */}
      <section className="mt-6 rounded-xl border border-neutral-800 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">
              {supervised ? "Supervised Mode" : "Smart Automation Mode"}
              <span className="ml-2 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                {supervised ? "in training" : "working independently"}
              </span>
            </p>
            <p className="mt-1 text-sm text-neutral-400">
              {supervised
                ? "Every reply waits for your approval. Your AI earns autonomy as you approve its work."
                : "Low-risk, well-grounded questions are answered instantly. Everything else still comes to you."}
            </p>
          </div>
          {supervised ? (
            <button
              onClick={() => setConfirmSmart(true)}
              className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
            >
              Turn on Smart Automation
            </button>
          ) : (
            <button
              onClick={() => patchActivation({ mode: "supervised" }, "Back in Supervised Mode — every reply now waits for you.")}
              className="shrink-0 rounded-lg bg-neutral-800 px-4 py-2 text-sm"
            >
              Back to Supervised
            </button>
          )}
        </div>

        {/* Graduation evidence */}
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-neutral-800 pt-4 text-center">
          <div>
            <p className="text-lg font-semibold">{graduation.approvals}</p>
            <p className="text-xs text-neutral-500">drafts approved</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{Math.round(graduation.uneditedRate * 100)}%</p>
            <p className="text-xs text-neutral-500">approved unchanged</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{graduation.wouldHaveAutoHandled}</p>
            <p className="text-xs text-neutral-500">would have been auto-handled</p>
          </div>
        </div>

        {confirmSmart && (
          <div className="mt-4 rounded-lg border border-indigo-900 bg-indigo-950/30 p-4">
            <p className="text-sm">
              In Smart Automation Mode, your AI will instantly answer questions that are{" "}
              <span className="font-medium">low-risk, fully backed by your confirmed Business Brain, and within
              your boundaries</span>. Refunds, complaints, negotiations and anything unclear still
              come to you. You can switch back anytime — it takes effect on the next message.
            </p>
            {!graduation.eligible && (
              <p className="mt-2 text-xs text-amber-300">
                Heads up: we usually recommend waiting until ~10 approved drafts. You&apos;re at{" "}
                {graduation.approvals}. Your call.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  setConfirmSmart(false);
                  void patchActivation({ mode: "smart" }, "Smart Automation is on. Your AI now handles routine questions itself.");
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Turn it on
              </button>
              <button onClick={() => setConfirmSmart(false)} className="rounded-lg bg-neutral-800 px-4 py-2 text-sm">
                Not yet
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Workspace risk dial */}
      <section className="mt-6 rounded-xl border border-neutral-800 p-5">
        <p className="font-medium">Your risk tolerance</p>
        <p className="mt-1 text-sm text-neutral-400">
          The most the AI may ever handle automatically, across all automations in this workspace.
        </p>
        <div className="mt-3 flex gap-2">
          {(["none", "low", "medium"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setMaxAutoRisk(r)}
              className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
                (data.workspaceSettings?.maxAutoRisk ?? "medium") === r
                  ? "bg-white font-medium text-black"
                  : "bg-neutral-800 text-neutral-400"
              }`}
            >
              {r === "none" ? "Nothing automatic" : `Up to ${r} risk`}
            </button>
          ))}
        </div>
      </section>

      {/* Per-category policy */}
      {tiers.map((tier) => (
        <section key={tier} className="mt-6">
          <h2 className="font-medium">{TIER_LABELS[tier]}</h2>
          <p className="mb-3 mt-0.5 text-xs text-neutral-500">{TIER_COPY[tier]}</p>
          <ul className="space-y-1.5">
            {Object.entries(riskTiers)
              .filter(([, t]) => t === tier)
              .map(([category]) => {
                const current = effective.categoryActions[category];
                const rec = recommended.categoryActions[category] ?? "approve";
                return (
                  <li
                    key={category}
                    className="flex items-center justify-between rounded-lg border border-neutral-800 px-4 py-2.5"
                  >
                    <span className="text-sm capitalize">{category.replace(/_/g, " ")}</span>
                    <div className="flex items-center gap-2">
                      {current === rec && (
                        <span className="text-xs text-neutral-600">recommended</span>
                      )}
                      <select
                        value={current}
                        onChange={(e) => setCategory(category, e.target.value as Action)}
                        className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
                      >
                        {tier !== "high" && <option value="auto">Handle automatically</option>}
                        <option value="approve">Ask my approval</option>
                        <option value="escalate">Always bring to me</option>
                      </select>
                    </div>
                  </li>
                );
              })}
          </ul>
          {tier === "high" && (
            <p className="mt-2 text-xs text-neutral-600">
              High-risk conversations can&apos;t be automated in this version — they always reach you.
            </p>
          )}
        </section>
      ))}
    </main>
  );
}
