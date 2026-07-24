"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, Page, PageHeader, Section } from "@/components/ui";

// Real analytics from our own ledger. Every number derives from actual runs
// and messages — nothing fabricated, honest zeros for a fresh workspace.

interface Data {
  conversations: number;
  automationsExecuted: number;
  handledAutomatically: number;
  humanInterventions: number;
  escalated: number;
  leads: number;
  successRate: number | null;
  avgResponseSeconds: number | null;
  hoursSaved: number;
  daily: { day: string; n: number }[];
  byCategory: { category: string; n: number }[];
}

function fmtSecs(s: number | null): string {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 360) / 10}h`;
}

const CATEGORY_LABELS: Record<string, string> = {
  faq: "FAQs",
  hours: "Hours",
  location: "Location",
  shipping_info: "Shipping",
  pricing_stated: "Pricing",
  product_availability: "Availability",
  product_recommendation: "Recommendations",
  lead_inquiry: "Leads",
  general_inquiry: "General",
  refund_request: "Refunds",
  complaint: "Complaints",
  negotiation: "Negotiations",
  sensitive: "Sensitive",
  unknown: "Other",
  appointment_info: "Appointments",
  spam: "Spam",
  abusive: "Abusive",
};

export default function AnalyticsPage() {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    fetch("/api/analytics")
      .then((r) => {
        if (!r.ok) throw new Error(`analytics ${r.status}`);
        return r.json();
      })
      .then(setD)
      .catch(() => setError(true));
  }, []);
  useEffect(() => load(), [load]);

  if (error) {
    return (
      <Page wide>
        <PageHeader title="Analytics" subtitle="How Ovanth is performing for your business." />
        <div className="mt-8 rounded-xl border border-line bg-raised p-8 text-center">
          <p className="text-sm text-ink-2">We couldn&apos;t load your analytics just now.</p>
          <button
            onClick={load}
            className="press-glow mt-4 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-transform active:scale-[0.97]"
          >
            Try again
          </button>
        </div>
      </Page>
    );
  }

  if (!d) {
    return (
      <Page wide>
        <PageHeader title="Analytics" subtitle="How Ovanth is performing for your business." />
        <div className="grid gap-3 sm:grid-cols-4" role="status" aria-label="Loading">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24 w-full" />)}
        </div>
        <div className="skeleton mt-6 h-48 w-full" />
      </Page>
    );
  }

  // The five metrics that show the value of the AI employee — lead with these.
  const hero = [
    { label: "Conversations handled", value: d.conversations.toLocaleString(), sub: "in the last 30 days" },
    { label: "Time saved", value: d.hoursSaved > 0 ? `~${d.hoursSaved}h` : "—", sub: "vs. answering by hand" },
    { label: "Leads captured", value: d.leads.toLocaleString(), sub: "qualified by your AI" },
    { label: "Avg. first response", value: fmtSecs(d.avgResponseSeconds), sub: "time to first reply" },
    { label: "AI success rate", value: d.successRate != null ? `${d.successRate}%` : "—", sub: "handled without you" },
  ];
  // Operational detail — secondary.
  const secondary = [
    { label: "Automations executed", value: d.automationsExecuted.toLocaleString() },
    { label: "Handled automatically", value: d.handledAutomatically.toLocaleString() },
    { label: "Your approvals & replies", value: d.humanInterventions.toLocaleString() },
    { label: "Escalated to you", value: d.escalated.toLocaleString() },
  ];

  const max = Math.max(1, ...d.daily.map((x) => x.n));
  const catTotal = d.byCategory.reduce((a, c) => a + c.n, 0);
  const empty = d.automationsExecuted === 0;

  return (
    <Page wide>
      <PageHeader
        title="Analytics"
        subtitle="How Ovanth is performing for your business."
        action={
          <span className="rounded-lg border border-line bg-raised px-3 py-1.5 text-[12.5px] text-ink-2">
            Last 30 days
          </span>
        }
      />

      {/* Hero — the metrics that show what the AI employee is worth. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {hero.map((s, i) => (
          <div key={s.label} className="lit rounded-[14px] border border-line bg-raised p-5">
            <p className="tnum text-3xl font-semibold" style={i === 0 ? { color: "var(--brass)" } : undefined}>
              {s.value}
            </p>
            <p className="mt-1 text-[13px] font-medium">{s.label}</p>
            <p className="mt-0.5 text-[11.5px] text-ink-3">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Operational detail. */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {secondary.map((s) => (
          <div key={s.label} className="rounded-[12px] border border-line px-4 py-3">
            <p className="tnum text-lg font-semibold">{s.value}</p>
            <p className="mt-0.5 text-[11.5px] text-ink-3">{s.label}</p>
          </div>
        ))}
      </div>

      {empty ? (
        <div className="mt-8">
          <EmptyState title="No activity yet">
            Once Ovanth starts handling conversations, your usage trends and topic breakdown appear
            here — computed from real activity, never estimated.
          </EmptyState>
        </div>
      ) : (
        <>
          <Section label="Usage — automations executed, last 14 days">
            <div className="lit rounded-[12px] border border-line bg-raised p-5">
              <div className="flex h-32 items-end gap-1.5">
                {d.daily.map((x) => (
                  <div key={x.day} className="group relative flex-1">
                    <div
                      className="w-full rounded-t-[3px] transition-colors"
                      style={{
                        height: `${Math.max(3, (x.n / max) * 100)}%`,
                        background: x.n > 0 ? "var(--brass)" : "var(--bg-hover)",
                        opacity: x.n > 0 ? 0.85 : 1,
                      }}
                    />
                    <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded bg-black px-1.5 py-0.5 text-[10px] text-ink group-hover:block">
                      {x.n}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10.5px] text-ink-3">
                <span>{d.daily[0]?.day.slice(5)}</span>
                <span>today</span>
              </div>
            </div>
          </Section>

          {catTotal > 0 && (
            <Section label="What customers ask about">
              <div className="lit rounded-[12px] border border-line bg-raised p-5">
                <div className="space-y-2.5">
                  {d.byCategory
                    .sort((a, b) => b.n - a.n)
                    .slice(0, 8)
                    .map((c) => (
                      <div key={c.category} className="flex items-center gap-3">
                        <span className="w-32 shrink-0 text-[12.5px] text-ink-2">
                          {CATEGORY_LABELS[c.category] ?? c.category}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-hover">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${(c.n / catTotal) * 100}%`, background: "var(--brass)", opacity: 0.8 }}
                          />
                        </div>
                        <span className="tnum w-8 shrink-0 text-right text-[12px] text-ink-3">{c.n}</span>
                      </div>
                    ))}
                </div>
              </div>
            </Section>
          )}
        </>
      )}

      <p className="mt-8 text-[12px] text-ink-3">
        All numbers are computed from your actual conversation and run history — never estimated
        or sampled. Hours saved uses ~4 min per auto-handled reply and ~2 min per approved draft.
      </p>
    </Page>
  );
}
