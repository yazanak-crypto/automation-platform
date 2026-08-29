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

  const dormant = data?.attention.dormant ?? [];
  const hint = data?.attention.dormantHint ?? null;

  // Dormant items are a SUBSET of the live queue, not a separate population: a
  // draft waiting 30 hours is still a pending draft, so it arrives in both
  // lists. Rendering both would show it twice, and counting both would inflate
  // the total. Overdue wins — it is the more urgent framing of the same item.
  const overdueConversations = new Set(
    dormant.map((d) => ("conversationId" in d ? d.conversationId : null)).filter(Boolean),
  );
  const drafts = (data?.attention.drafts ?? []).filter(
    (d) => !overdueConversations.has(d.conversationId),
  );
  const needsHuman = (data?.attention.needsHuman ?? []).filter(
    (n) => !n.conversationId || !overdueConversations.has(n.conversationId),
  );

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

  // Counts what is actually rendered, overdue included. A header reading
  // "0 items" above five overdue rows is worse than no header.
  const total = drafts.length + needsHuman.length + dormant.length;
  // The dormant list can be non-empty while the live queue is empty — an order
  // sitting for a day is not a pending draft. So the section must render for
  // either.
  if (!data || (total === 0 && dormant.length === 0)) return null;

  return (
    <>
    {burstNode}
    <Section
      label="Needs you"
      right={<span className="tnum text-[12px] text-ink-3">{total} item{total === 1 ? "" : "s"}</span>}
    >
      {/* Overdue first, and separated. These are obligations the business has
          already failed once — mixing them into the live queue by timestamp
          would let them scroll away under newer, less urgent items. */}
      {dormant.length > 0 && (
        <div className="mb-4 rounded-[10px] border border-line border-l-2 border-l-stop bg-raised p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-stop">
            Overdue — {dormant.length} waiting on you
          </p>
          <div className="mt-2.5 space-y-1.5">
            {dormant.slice(0, 8).map((item) => {
              const href =
                item.kind === "order"
                  ? "/orders"
                  : `/conversations/${item.conversationId}`;
              return (
                <Link
                  key={`${item.kind}-${"orderId" in item ? item.orderId : item.conversationId}`}
                  href={href}
                  className="flex items-baseline justify-between gap-3 rounded-md px-1 py-0.5 hover:bg-hover"
                >
                  <span className="min-w-0 truncate text-[13px]" dir="auto">
                    {item.kind === "draft" && `Draft waiting — ${item.preview}`}
                    {item.kind === "order" &&
                      `Order from ${item.customerName ?? "a customer"} not decided`}
                    {item.kind === "escalation" &&
                      (item.closedWithoutReply
                        ? "Closed without replying — they were told someone would follow up"
                        : "You were asked to reply and haven't")}
                  </span>
                  <span className="shrink-0 text-[12px] text-ink-3">
                    <RelativeTime value={item.since} />
                  </span>
                </Link>
              );
            })}
            {dormant.length > 8 && (
              <p className="px-1 pt-1 text-[12px] text-ink-3">and {dormant.length - 8} more</p>
            )}
          </div>

          {/* The honest fix for a chronic backlog is usually not working
              through it. Shown ONLY when graduation says the workspace has
              earned more autonomy — otherwise this is nagging someone to
              loosen safety they have not demonstrated. */}
          {hint && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="text-[12.5px] text-ink-2">
                {hint.category
                  ? `Most of this is "${hint.category.replace(/_/g, " ")}".`
                  : "This keeps filling up."}{" "}
                {hint.wouldHaveAutoHandled > 0 &&
                  `Your AI would have handled ${hint.wouldHaveAutoHandled} of these on its own. `}
                {hint.mode === "supervised"
                  ? "Turning on Smart Automation would stop them queueing."
                  : "Setting that category to handle itself would stop them queueing."}
              </p>
              <Link
                href={`/automations/${hint.activationId}`}
                className="mt-1.5 inline-block text-[12.5px] text-brass underline underline-offset-4"
              >
                Review what it handles alone →
              </Link>
            </div>
          )}
        </div>
      )}

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
