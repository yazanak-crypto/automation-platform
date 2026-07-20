"use client";

import { useDashboard } from "./DashboardProvider";

/** Right-rail stat cards, from the shared dashboard payload. Real numbers;
 *  metrics we don't measure yet show a labeled "—/soon". */
export default function MetricCards() {
  const { data } = useDashboard();
  const m = data?.metrics;
  const cards: { label: string; value: string; soon?: boolean; accent?: boolean }[] = [
    { label: "Conversations", value: m ? m.conversations.toLocaleString() : "—", accent: true },
    { label: "Resolved", value: m ? m.resolved.toLocaleString() : "—" },
    { label: "Awaiting approval", value: m ? m.awaitingApproval.toLocaleString() : "—" },
    { label: "Avg. AI confidence", value: m?.avgConfidence != null ? String(m.avgConfidence) : "—" },
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
          <p className="tnum mt-1 text-2xl font-semibold" style={c.accent ? { color: "var(--brass)" } : undefined}>
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}
