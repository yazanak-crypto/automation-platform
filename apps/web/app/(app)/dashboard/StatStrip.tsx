"use client";

import { useEffect, useState } from "react";

interface Summary {
  autoHandled: number;
  escalated: number;
  awaitingApproval: number;
  avgConfidence: number | null;
  timeSavedMinutes: number;
}

export default function StatStrip() {
  const [s, setS] = useState<Summary | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/metrics/summary");
      if (res.ok) setS(await res.json());
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  if (!s) return null;
  const hours = Math.floor(s.timeSavedMinutes / 60);
  const mins = s.timeSavedMinutes % 60;
  const timeSaved = s.timeSavedMinutes === 0 ? "—" : hours > 0 ? `~${hours}h ${mins}m` : `~${mins}m`;

  const cells = [
    { label: "Handled automatically", value: s.autoHandled, accent: s.autoHandled > 0 },
    { label: "Escalated to you", value: s.escalated, accent: false },
    { label: "Awaiting approval", value: s.awaitingApproval, accent: false },
    { label: "Time saved (est., 30d)", value: timeSaved, accent: s.timeSavedMinutes > 0 },
    ...(s.avgConfidence != null
      ? [{ label: "Avg. AI confidence", value: s.avgConfidence, accent: false }]
      : []),
  ];

  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
      {cells.map((c) => (
        <div key={c.label} className="rounded-xl border border-neutral-800 p-4">
          <p className={`text-xl font-semibold ${c.accent ? "text-emerald-300" : ""}`}>{c.value}</p>
          <p className="mt-0.5 text-xs text-neutral-500">{c.label}</p>
        </div>
      ))}
    </div>
  );
}
