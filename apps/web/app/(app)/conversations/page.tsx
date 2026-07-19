"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  EmptyState,
  Page,
  PageHeader,
  RelativeTime,
  SkeletonRows,
  conversationStatusPill,
} from "@/components/ui";

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

const FILTERS = [
  { id: "all", label: "All" },
  { id: "waiting_approval", label: "Needs you" },
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
] as const;

export default function ConversationsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/conversations").catch(() => null);
      if (res?.ok) setRows(await res.json());
    };
    void load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const filtered = rows?.filter((r) => filter === "all" || r.status === filter) ?? [];
  const needsYou = rows?.filter((r) => r.pendingDraft || r.status === "waiting_approval").length ?? 0;

  return (
    <Page wide>
      <PageHeader
        title="Conversations"
        subtitle={
          rows === null
            ? undefined
            : needsYou === 0
              ? "Your AI is watching every channel. Nothing needs you right now."
              : `${needsYou} conversation${needsYou === 1 ? "" : "s"} waiting on you.`
        }
      />

      {/* Underline filter tabs — chrome, not cards. */}
      <div className="flex gap-5 border-b border-line">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`-mb-px border-b-2 pb-2.5 text-[13.5px] transition-colors ${
              filter === f.id
                ? "border-current font-medium text-ink"
                : "border-transparent text-ink-3 hover:text-ink-2"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows === null ? (
        <div className="mt-4">
          <SkeletonRows rows={5} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={filter === "all" ? "No conversations yet" : "Nothing here"}>
            {filter === "all"
              ? "The moment a customer writes in on any connected channel, the conversation appears here with your AI already working on it."
              : "Conversations matching this filter will appear here."}
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link
                href={`/conversations/${r.id}`}
                className="rise flex items-center gap-4 py-3.5 transition-colors hover:bg-raised md:px-2 md:-mx-2 md:rounded-lg"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background:
                      r.pendingDraft || r.status === "waiting_approval"
                        ? "var(--wait)"
                        : r.status === "closed"
                          ? "var(--line-strong)"
                          : "var(--ok)",
                  }}
                />
                <div className="w-44 min-w-0 shrink-0">
                  <p className="truncate text-sm font-medium">
                    {r.contactEmail ?? r.contactName ?? "Website visitor"}
                  </p>
                  <p className="truncate text-[11.5px] text-ink-3">
                    {r.channelName}
                    {r.priorConversations > 0 && ` · ${r.priorConversations + 1} conversations`}
                  </p>
                </div>
                <p className="min-w-0 flex-1 truncate text-[13.5px] text-ink-2">{r.lastMessage}</p>
                <div className="flex shrink-0 items-center gap-3">
                  {conversationStatusPill(r.status, r.pendingDraft)}
                  <RelativeTime value={r.lastMessageAt} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
