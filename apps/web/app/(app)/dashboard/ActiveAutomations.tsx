"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Activation {
  id: string;
  automationSlug: string;
  status: string;
  channelIds: string[];
  activatedAt: string;
}

const NAMES: Record<string, string> = { "lead-concierge": "Lead Concierge" };

export default function ActiveAutomations() {
  const [rows, setRows] = useState<Activation[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/activations");
    if (res.ok) setRows(await res.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(id: string, status: "active" | "paused") {
    await fetch(`/api/activations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  if (rows === null) return null;

  if (rows.length === 0) {
    return (
      <Link
        href="/marketplace"
        className="mt-6 block rounded-xl border border-neutral-800 p-5 hover:border-neutral-600"
      >
        <p className="font-medium">Activate your first automation</p>
        <p className="mt-1 text-sm text-neutral-400">
          Start with the Lead Concierge — never miss a lead from your website again.
        </p>
      </Link>
    );
  }

  return (
    <section className="mt-6">
      <h2 className="mb-3 font-medium">
        Your automations{" "}
        <span className="text-sm text-neutral-500">
          — {rows.filter((r) => r.status === "active").length} active
        </span>
      </h2>
      <ul className="space-y-2">
        {rows.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between rounded-xl border border-neutral-800 p-4"
          >
            <div>
              <p className="text-sm font-medium">
                {NAMES[a.automationSlug] ?? a.automationSlug}
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                    a.status === "active"
                      ? "bg-emerald-950 text-emerald-300"
                      : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  {a.status}
                </span>
              </p>
              {a.status === "paused" && (
                <p className="mt-0.5 text-xs text-neutral-500">
                  Paused — new messages wait in Conversations for your own reply. Nothing is lost.
                </p>
              )}
              <p className="mt-0.5 text-xs text-neutral-500">
                {a.channelIds.length} channel{a.channelIds.length === 1 ? "" : "s"} · since{" "}
                {new Date(a.activatedAt).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={() => setStatus(a.id, a.status === "active" ? "paused" : "active")}
              className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs"
            >
              {a.status === "active" ? "Pause" : "Resume"}
            </button>
          </li>
        ))}
      </ul>
      <Link href="/marketplace" className="mt-3 inline-block text-sm text-neutral-400 underline underline-offset-4">
        Browse more automations →
      </Link>
    </section>
  );
}
