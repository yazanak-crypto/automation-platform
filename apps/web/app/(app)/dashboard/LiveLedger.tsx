"use client";

import { useEffect, useRef, useState } from "react";
import { relativeTime } from "@/components/ui";

interface Ev {
  id: string;
  at: string;
  title: string;
  tone: "ok" | "wait" | "brass" | "neutral";
}
const DOT: Record<Ev["tone"], string> = {
  ok: "bg-ok",
  wait: "bg-wait",
  brass: "bg-brass",
  neutral: "bg-ink-3",
};

/**
 * The Live Operations Ledger — the signature panel. Real events from the run
 * ledger; new ones slide in. Polls every 6s; honest "quiet" state when idle.
 */
export default function LiveLedger() {
  const [events, setEvents] = useState<Ev[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetch("/api/activity").catch(() => null);
      if (!res?.ok || !alive) return;
      const { events: next } = (await res.json()) as { events: Ev[] };
      const newIds = next.filter((e) => !seen.current.has(e.id)).map((e) => e.id);
      next.forEach((e) => seen.current.add(e.id));
      if (newIds.length && seen.current.size > newIds.length) {
        setFresh(new Set(newIds));
        setTimeout(() => alive && setFresh(new Set()), 800);
      }
      setEvents(next);
    };
    void load();
    const t = setInterval(load, 6000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="lit rounded-[12px] border border-line bg-raised p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
        </span>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">Live operations</p>
      </div>

      {events.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-3">
          Quiet right now. Activity appears here the moment Otto acts.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {events.map((e) => (
            <li
              key={e.id}
              className={`flex items-center gap-2.5 rounded-md px-1 py-2 ${fresh.has(e.id) ? "slide-in" : ""}`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[e.tone]}`} />
              <span className="flex-1 truncate text-[13px] text-ink-2">{e.title}</span>
              <span className="tnum shrink-0 text-[11px] text-ink-3">{relativeTime(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
