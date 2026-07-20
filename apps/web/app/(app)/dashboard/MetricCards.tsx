"use client";

import { useEffect, useState } from "react";

interface Summary {
  conversations: number;
  resolved: number;
  awaitingApproval: number;
  avgConfidence: number | null;
}

/**
 * Concept's right-rail stat cards, wired to REAL data. Metrics we don't yet
 * measure (response time, satisfaction) show a labelled "—" instead of the
 * mockup's invented numbers — honest by rule.
 */
export default function MetricCards() {
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/metrics/summary");
      if (res.ok) setS(await res.json());
    };
    void load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const cards: { label: string; value: string; soon?: boolean; accent?: boolean }[] = [
    { label: "Conversations", value: s ? s.conversations.toLocaleString() : "—", accent: true },
    { label: "Resolved", value: s ? s.resolved.toLocaleString() : "—" },
    { label: "Awaiting approval", value: s ? s.awaitingApproval.toLocaleString() : "—" },
    { label: "Avg. AI confidence", value: s?.avgConfidence != null ? String(s.avgConfidence) : "—" },
    { label: "Response time", value: "—", soon: true },
    { label: "Satisfaction", value: "—", soon: true },
  ];

  return (
    <div className="space-y-2.5">
      {cards.map((c) => (
        <div key={c.label} className="lit rounded-[12px] border border-line bg-raised p-4">
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-ink-3">{c.label}</p>
            {c.soon && (
              <span className="rounded-full bg-hover px-1.5 py-px text-[9px] uppercase tracking-wide text-ink-3">
                soon
              </span>
            )}
          </div>
          <p className={`tnum mt-1 text-2xl font-semibold ${c.accent ? "" : ""}`} style={c.accent ? { color: "var(--brass)" } : undefined}>
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}
