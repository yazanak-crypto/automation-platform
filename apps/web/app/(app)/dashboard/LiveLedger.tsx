"use client";

import { useEffect, useRef, useState } from "react";
import { relativeTime } from "@/components/ui";
import { useDashboard } from "./DashboardProvider";

const DOT: Record<string, string> = {
  ok: "bg-ok",
  wait: "bg-wait",
  brass: "bg-brass",
  neutral: "bg-ink-3",
};

/** Live Operations Ledger — reads the shared payload's activity feed; new
 *  entries slide in. No own network calls. */
export default function LiveLedger() {
  const { data } = useDashboard();
  const events = data?.activity ?? [];
  const seen = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    const newIds = events.filter((e) => !seen.current.has(e.id)).map((e) => e.id);
    const hadSome = seen.current.size > 0;
    events.forEach((e) => seen.current.add(e.id));
    if (hadSome && newIds.length) {
      setFresh(new Set(newIds));
      const t = setTimeout(() => setFresh(new Set()), 800);
      return () => clearTimeout(t);
    }
  }, [events]);

  return (
    <div className="lit rounded-[12px] border border-line bg-raised p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
        </span>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">Live operations</p>
      </div>
      {!data ? (
        <div className="space-y-2 py-1" role="status" aria-label="Loading">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-6 w-full" />)}
        </div>
      ) : events.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-3">
          Quiet right now. Activity appears here the moment Otto acts.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {events.map((e) => (
            <li key={e.id} className={`flex items-center gap-2.5 rounded-md px-1 py-2 ${fresh.has(e.id) ? "slide-in" : ""}`}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[e.tone] ?? "bg-ink-3"}`} />
              <span className="flex-1 truncate text-[13px] text-ink-2">{e.title}</span>
              <span className="tnum shrink-0 text-[11px] text-ink-3">{relativeTime(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
