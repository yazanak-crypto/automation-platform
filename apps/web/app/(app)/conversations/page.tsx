"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Row {
  id: string;
  status: string;
  lastMessageAt: string;
  channelName: string;
  contactName?: string | null;
  contactEmail?: string | null;
  lastMessage?: string | null;
  priorConversations: number;
  pendingDraft: boolean;
}

export default function ConversationsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<"all" | "waiting_approval" | "open" | "closed">("all");

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/conversations");
      if (res.ok) setRows(await res.json());
    };
    void load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const filtered = rows?.filter((r) => filter === "all" || r.status === filter) ?? [];

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Conversations</h1>
      <div className="mt-4 flex gap-2">
        {(["all", "waiting_approval", "open", "closed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-2.5 py-1 text-xs ${filter === f ? "bg-neutral-800 text-white" : "text-neutral-400"}`}
          >
            {f === "waiting_approval" ? "needs review" : f}
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="mt-8 text-neutral-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-500">
          No conversations yet. Once your widget is live, visitor messages appear here.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link
                href={`/conversations/${r.id}`}
                className="block rounded-lg border border-neutral-800 p-4 hover:border-neutral-600"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {r.contactEmail ?? r.contactName ?? "Anonymous visitor"}
                    {r.priorConversations > 0 && (
                      <span className="ml-2 text-xs text-neutral-500">
                        {r.priorConversations + 1} conversations
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    {r.pendingDraft && (
                      <span className="rounded-full bg-amber-950 px-2 py-0.5 text-xs text-amber-300">
                        draft waiting
                      </span>
                    )}
                    <span className="text-xs text-neutral-500">{r.channelName}</span>
                  </div>
                </div>
                <p className="mt-1 truncate text-sm text-neutral-400">{r.lastMessage}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
