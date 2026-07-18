"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface DraftItem {
  conversationId: string;
  draftBody: string;
  visitorMessage?: string | null;
  contactEmail?: string | null;
  reasoning?: string | null;
}
interface NeedsHumanItem {
  conversationId: string | null;
  visitorMessage?: string | null;
  reason?: string | null;
}

export default function AttentionQueue() {
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [needsHuman, setNeedsHuman] = useState<NeedsHumanItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/attention");
    if (res.ok) {
      const data = await res.json();
      setDrafts(data.drafts);
      setNeedsHuman(data.needsHuman);
    }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function act(conversationId: string, action: "approve" | "dismiss") {
    setBusy(conversationId);
    await fetch(`/api/conversations/${conversationId}/draft`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    await load();
  }

  if (drafts.length === 0 && needsHuman.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="mb-3 font-medium">
        Needs your attention{" "}
        <span className="text-sm text-neutral-500">
          — {drafts.length + needsHuman.length} item{drafts.length + needsHuman.length === 1 ? "" : "s"}
        </span>
      </h2>
      <ul className="space-y-3">
        {drafts.map((d) => (
          <li key={d.conversationId} className="rounded-xl border border-amber-900/60 bg-amber-950/10 p-4">
            <p className="text-xs text-neutral-500">
              {d.contactEmail ?? "Anonymous visitor"} asked:
            </p>
            <p className="mt-1 text-sm">{d.visitorMessage}</p>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-amber-400">AI draft</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-200">{d.draftBody}</p>
            {d.reasoning && <p className="mt-1 text-xs text-neutral-500">{d.reasoning}</p>}
            <div className="mt-3 flex gap-2">
              <button
                disabled={busy === d.conversationId}
                onClick={() => act(d.conversationId, "approve")}
                className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Approve & send
              </button>
              <Link
                href={`/conversations/${d.conversationId}`}
                className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs"
              >
                Edit / view
              </Link>
              <button
                disabled={busy === d.conversationId}
                onClick={() => act(d.conversationId, "dismiss")}
                className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-neutral-400 disabled:opacity-50"
              >
                Dismiss
              </button>
            </div>
          </li>
        ))}
        {needsHuman.map((n, i) => (
          <li key={n.conversationId ?? i} className="rounded-xl border border-neutral-800 p-4">
            <p className="text-sm">
              A visitor message needs a personal reply:{" "}
              <span className="text-neutral-400">{n.visitorMessage}</span>
            </p>
            {n.reason && <p className="mt-1 text-xs text-amber-300">{n.reason}</p>}
            {n.conversationId && (
              <Link
                href={`/conversations/${n.conversationId}`}
                className="mt-2 inline-block rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-black"
              >
                Reply now
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
