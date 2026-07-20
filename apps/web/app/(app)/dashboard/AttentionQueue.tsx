"use client";

import Link from "next/link";
import { useState } from "react";
import { useBurst } from "@/components/motion";
import { Button, Card, RelativeTime, Section } from "@/components/ui";
import { useDashboard } from "./DashboardProvider";

export default function AttentionQueue() {
  const { data, refresh } = useDashboard();
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const { burst, burstNode } = useBurst();

  const drafts = data?.attention.drafts ?? [];
  const needsHuman = data?.attention.needsHuman ?? [];

  async function act(conversationId: string, action: "approve" | "dismiss") {
    setBusy(conversationId);
    const res = await fetch(`/api/conversations/${conversationId}/draft`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return;
    // Moment #2: the card leaves deliberately, then the shared payload refreshes.
    setLeaving((s) => new Set(s).add(conversationId));
    setTimeout(() => {
      setLeaving((s) => {
        const n = new Set(s);
        n.delete(conversationId);
        return n;
      });
      void refresh();
    }, 230);
  }

  const total = drafts.length + needsHuman.length;
  if (!data || total === 0) return null;

  return (
    <>
    {burstNode}
    <Section
      label="Needs you"
      right={<span className="tnum text-[12px] text-ink-3">{total} item{total === 1 ? "" : "s"}</span>}
    >
      <div className="space-y-3">
        {drafts.map((d) => (
          <div key={d.conversationId} className={leaving.has(d.conversationId) ? "collapse-out" : "rise"}>
            <Card tone="wait">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[12px] text-ink-3">{d.contactEmail ?? "A website visitor"} asked</p>
                <RelativeTime value={d.createdAt} />
              </div>
              <p className="mt-1 text-sm leading-relaxed">{d.visitorMessage}</p>

              <div className="mt-3 border-t border-line pt-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-3">
                  Your AI drafted
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{d.draftBody}</p>
                {d.reasoning && <p className="mt-1.5 text-[12.5px] text-ink-3">{d.reasoning}</p>}
              </div>

              <div className="mt-3.5 flex items-center gap-2">
                <Button
                  variant="ok"
                  size="sm"
                  disabled={busy === d.conversationId}
                  onClick={(e) => {
                    burst(e);
                    void act(d.conversationId, "approve");
                  }}
                >
                  Approve &amp; send
                </Button>
                <Link
                  href={`/conversations/${d.conversationId}`}
                  className="rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
                >
                  Edit
                </Link>
                <Button
                  size="sm"
                  disabled={busy === d.conversationId}
                  onClick={() => act(d.conversationId, "dismiss")}
                >
                  Dismiss
                </Button>
              </div>
            </Card>
          </div>
        ))}

        {needsHuman.map((n, i) => (
          <div key={n.conversationId ?? i} className="rise">
            <Card tone="stop">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">This one needs you personally</p>
                <RelativeTime value={n.startedAt} />
              </div>
              {n.reason && <p className="mt-0.5 text-[12.5px] text-wait">{n.reason}</p>}
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{n.visitorMessage}</p>
              {n.conversationId && (
                <Link
                  href={`/conversations/${n.conversationId}`}
                  className="mt-3 inline-block rounded-lg bg-white px-3.5 py-1.5 text-[13px] font-medium text-black transition-transform active:scale-[0.98]"
                >
                  Reply now
                </Link>
              )}
            </Card>
          </div>
        ))}
      </div>
    </Section>
    </>
  );
}
