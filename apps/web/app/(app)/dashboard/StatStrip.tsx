"use client";

import { useEffect, useState } from "react";
import { Section, Skeleton } from "@/components/ui";

interface Summary {
  autoHandled: number;
  leadsDetected: number;
  escalated: number;
  awaitingApproval: number;
  avgConfidence: number | null;
  timeSavedMinutes: number;
}

/* Numbers are the product's voice: no boxes, a single ruled row, the hero
 * metric in brass. Skeletons while loading — never the word "Loading". */
export default function StatStrip() {
  const [s, setS] = useState<Summary | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/metrics/summary").catch(() => null);
      if (res?.ok) setS(await res.json());
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const hours = s ? Math.floor(s.timeSavedMinutes / 60) : 0;
  const mins = s ? s.timeSavedMinutes % 60 : 0;
  const timeSaved =
    !s || s.timeSavedMinutes === 0 ? "0m" : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  const cells = s
    ? [
        { label: "Handled for you", value: String(s.autoHandled), hero: true },
        { label: "Leads found", value: String(s.leadsDetected) },
        { label: "Brought to you", value: String(s.escalated) },
        { label: "Waiting on you", value: String(s.awaitingApproval) },
        { label: "Time saved · est.", value: `~${timeSaved}` },
      ]
    : null;

  return (
    <Section label="Last 30 days">
      <div className="grid grid-cols-2 gap-y-6 border-y border-line py-5 sm:grid-cols-5">
        {cells
          ? cells.map((c) => (
              <div key={c.label} className="rise px-1 sm:border-l sm:border-line sm:pl-5 sm:first:border-l-0 sm:first:pl-1">
                <p
                  className={`tnum text-[26px] font-semibold leading-none tracking-[-0.02em] ${
                    c.hero ? "" : ""
                  }`}
                  style={c.hero ? { color: "var(--brass)" } : undefined}
                >
                  {c.value}
                </p>
                <p className="mt-1.5 text-[12px] text-ink-3">{c.label}</p>
              </div>
            ))
          : Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-1 sm:border-l sm:border-line sm:pl-5 sm:first:border-l-0 sm:first:pl-1">
                <Skeleton className="h-6 w-14" />
                <Skeleton className="mt-2 h-3 w-20" />
              </div>
            ))}
      </div>
    </Section>
  );
}
