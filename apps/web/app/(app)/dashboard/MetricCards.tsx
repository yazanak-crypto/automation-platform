"use client";

import { useDashboard } from "./DashboardProvider";

function fmtSecs(s: number | null | undefined): string {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 360) / 10}h`;
}

/** Right-rail stat cards, all computed from real activity. */
export default function MetricCards() {
  const { data } = useDashboard();
  const m = data?.metrics;
  const cards: { label: string; value: string; accent?: boolean }[] = [
    { label: "Conversations", value: m ? m.conversations.toLocaleString() : "—", accent: true },
    { label: "Resolved", value: m ? m.resolved.toLocaleString() : "—" },
    { label: "Awaiting approval", value: m ? m.awaitingApproval.toLocaleString() : "—" },
    { label: "Avg. response", value: fmtSecs(m?.avgResponseSeconds) },
    { label: "AI success rate", value: m?.successRate != null ? `${m.successRate}%` : "—" },
    { label: "Avg. AI confidence", value: m?.avgConfidence != null ? String(m.avgConfidence) : "—" },
  ];

  return (
    <div className="space-y-2.5">
      {cards.map((c) => (
        <div key={c.label} className="lit rounded-[12px] border border-line bg-raised p-4">
          <p className="text-[12px] text-ink-3">{c.label}</p>
          <p className="tnum mt-1 text-2xl font-semibold" style={c.accent ? { color: "var(--brass)" } : undefined}>
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}
