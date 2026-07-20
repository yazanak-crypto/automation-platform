"use client";

import Link from "next/link";
import { useDashboard } from "./DashboardProvider";

function pill(status: string, pending: boolean) {
  if (pending || status === "waiting_approval") return { label: "Waiting", cls: "bg-wait-dim text-wait" };
  if (status === "closed") return { label: "Resolved", cls: "bg-ok-dim text-ok" };
  return { label: "Open", cls: "bg-hover text-ink-2" };
}

/** Recent conversations — from the shared dashboard payload. */
export default function RecentConversations() {
  const { data } = useDashboard();
  const rows = data?.recentConversations;

  return (
    <div className="lit rounded-[12px] border border-line bg-raised p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium">Recent conversations</h3>
        <Link href="/conversations" className="text-[12px] text-ink-3 hover:text-ink-2">View all</Link>
      </div>
      {!data ? (
        <div className="space-y-2 py-1" role="status" aria-label="Loading">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-9 w-full" />)}
        </div>
      ) : rows!.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-3">
          No conversations yet. They appear here as customers reach you.
        </p>
      ) : (
        <ul>
          {rows!.map((r) => {
            const p = pill(r.status, r.pendingDraft);
            return (
              <li key={r.id}>
                <Link href={`/conversations/${r.id}`} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0 hover:bg-hover">
                  <span className="w-28 shrink-0 truncate text-[13px] font-medium">
                    {r.contactEmail ?? r.contactName ?? "Visitor"}
                  </span>
                  <span className="flex-1 truncate text-[13px] text-ink-2">{r.lastMessage ?? r.channelName}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${p.cls}`}>{p.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
