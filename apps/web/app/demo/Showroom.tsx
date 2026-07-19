"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/reveal";
import { Wordmark } from "@/components/wordmark";
import { BRAND } from "@/lib/brand";
import { COPY } from "@/lib/tokens";
import { DEMO } from "@/lib/demo-data";

// The guided showroom (spec §3). Cinematic, read-only, real-feature-based.
// Auto-play narrative loop + spotlight tour + glass hover + persistent CTA.
// Everything degrades to static on reduced-motion / low-power devices.

function useLowPower() {
  const [low, setLow] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cores = navigator.hardwareConcurrency ?? 8;
    setLow(reduced || cores <= 4);
  }, []);
  return low;
}

const NARR_MS = 2400; // per beat → ~12s loop over 5 beats

export function Showroom() {
  const lowPower = useLowPower();
  const [beat, setBeat] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [tour, setTour] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-play narrative loop.
  useEffect(() => {
    if (lowPower || !playing || tour !== null) return;
    timer.current = setInterval(() => setBeat((b) => (b + 1) % DEMO.narrative.length), NARR_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [lowPower, playing, tour]);

  const onGlassMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--gx", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--gy", `${((e.clientY - r.top) / r.height) * 100}%`);
  }, []);

  return (
    <main className="min-h-screen">
      {/* Nav: quiet, with the subtle secondary CTA (spec §3). */}
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Wordmark href="/" size="lg" />
          <div className="flex items-center gap-4">
            <span className="hidden rounded-full bg-brass-dim px-3 py-1 text-[11.5px] font-medium text-brass sm:inline">
              {COPY.demo.badge}
            </span>
            <Link href="/onboarding" prefetch className="text-sm text-ink-2 transition-colors hover:text-ink">
              Make this yours →
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-[-0.01em]">{DEMO.business}</h1>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-2">{COPY.demo.tagline}</p>
            </div>
            <button
              onClick={() => setTour(0)}
              className="press-glow ripple-host rounded-lg border border-line px-4 py-2 text-sm text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            >
              Take the 60-second tour
            </button>
          </div>
        </Reveal>

        {/* Metrics row. */}
        <Reveal>
          <div id="tour-0" className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {DEMO.metrics.map((m, i) => (
              <div
                key={m.label}
                className={`glass-panel lit rounded-[10px] border border-line bg-raised p-4 ${tourRing(tour, i === 2 ? 0 : -1)}`}
                onPointerMove={onGlassMove}
              >
                <p className="tnum text-xl font-semibold" style={{ color: i === 0 ? "var(--brass)" : undefined }}>
                  {m.value}
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-3">{m.label}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          {/* Live narrative theatre. */}
          <Reveal>
            <div id="tour-1" className={`glass-panel lit rounded-[12px] border border-line bg-raised p-5 ${tourRing(tour, 1)}`} onPointerMove={onGlassMove}>
              <div className="flex items-center justify-between border-b border-line pb-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">
                  Watch {BRAND} work
                </p>
                {!lowPower && (
                  <button
                    onClick={() => setPlaying((p) => !p)}
                    className="text-[12px] text-ink-3 transition-colors hover:text-ink-2"
                  >
                    {playing ? "❙❙ pause" : "▶ play"}
                  </button>
                )}
              </div>
              <div className="mt-4 space-y-2.5">
                {DEMO.narrative.map((n, i) => {
                  const on = lowPower || i === beat;
                  const isEscalate = n.k === "escalate";
                  return (
                    <div
                      key={n.k}
                      className={`narrative-step rounded-[10px] border p-3.5 ${on ? "on" : ""} ${on && !lowPower ? "slide-in" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] font-medium">
                          {"channel" in n ? `${n.channel} · ${n.who}` : n.title}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
                            isEscalate ? "bg-wait-dim text-wait" : n.k === "auto" ? "bg-ok-dim text-ok" : "bg-brass-dim text-brass"
                          }`}
                        >
                          {n.label}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{n.body}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </Reveal>

          {/* Channels + inbox. */}
          <Reveal delay={80}>
            <div className="space-y-6">
              <div id="tour-2" className={`glass-panel lit rounded-[12px] border border-line bg-raised p-5 ${tourRing(tour, 2)}`} onPointerMove={onGlassMove}>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">Channels on duty</p>
                <div className="mt-3 space-y-2">
                  {DEMO.channels.map((c) => (
                    <div key={c.name} className="flex items-center justify-between border-b border-line py-2.5 last:border-0">
                      <div>
                        <p className="text-[13px] font-medium">{c.name}</p>
                        <p className="text-[11.5px] text-ink-3">{c.detail}</p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-dim px-2 py-0.5 text-[11px] font-medium text-ok">
                        <span className="h-1.5 w-1.5 rounded-full bg-current" /> live
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div id="tour-3" className={`glass-panel lit rounded-[12px] border border-line bg-raised p-5 ${tourRing(tour, 3)}`} onPointerMove={onGlassMove}>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">Inbox</p>
                <div className="mt-2">
                  {DEMO.threads.map((t) => (
                    <button
                      key={t.who + t.age}
                      onClick={() => setTour(-2)}
                      className="flex w-full items-center gap-3 border-b border-line py-3 text-left transition-colors last:border-0 hover:bg-hover"
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.status === "needs" ? "bg-wait" : "bg-ok"}`}
                      />
                      <span className="w-28 shrink-0 truncate text-[13px] font-medium">{t.who}</span>
                      <span className="flex-1 truncate text-[13px] text-ink-2">{t.snippet}</span>
                      <span className="shrink-0 text-[11.5px] text-ink-3">{t.age}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Closing beat. */}
        <Reveal>
          <div className="mt-12 flex flex-col items-center border-t border-line pt-14 text-center">
            <p className="text-xl font-semibold tracking-[-0.01em]">This could be your business by tomorrow.</p>
            <p className="mt-2 max-w-md text-sm text-ink-2">
              {BRAND} learns from your website in minutes. Start supervised, and let it earn its autonomy.
            </p>
            <Link
              href="/onboarding"
              prefetch
              className="press-glow ripple-host mt-6 rounded-lg bg-white px-7 py-3 text-sm font-medium text-black transition-all duration-150 hover:bg-white/90 active:scale-[0.97]"
            >
              {COPY.cta.makeYours}
            </Link>
            <p className="mt-3 text-[13px] text-ink-3">7 days free · no card required</p>
          </div>
        </Reveal>
      </div>

      {/* Persistent gold CTA, bottom-right (spec §3). */}
      <Link
        href="/onboarding"
        prefetch
        className="press-glow fixed bottom-5 right-5 z-50 rounded-full px-5 py-3 text-sm font-semibold text-black shadow-lg transition-all duration-150 hover:scale-[1.03] active:scale-[0.97]"
        style={{ background: "var(--brass)" }}
      >
        {COPY.cta.makeYours}
      </Link>

      {/* Spotlight tour (spec §3): dim room, one panel lit, value copy, Next. */}
      {tour !== null && tour >= 0 && (
        <>
          <div className="spotlight" />
          <div className="fixed inset-x-0 bottom-24 z-[61] flex justify-center px-6">
            <div className="moment-glow w-full max-w-md rounded-[12px] border border-brass bg-raised p-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-brass">
                {tour + 1} / {COPY.demo.tour.length}
              </p>
              <p className="mt-1.5 text-[15px] font-medium">{COPY.demo.tour[tour]!.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{COPY.demo.tour[tour]!.body}</p>
              <div className="mt-4 flex items-center gap-3">
                {tour < COPY.demo.tour.length - 1 ? (
                  <button
                    onClick={() => setTour(tour + 1)}
                    className="press-glow ripple-host rounded-lg bg-white px-4 py-2 text-sm font-medium text-black active:scale-[0.97]"
                  >
                    Next
                  </button>
                ) : (
                  <Link
                    href="/onboarding"
                    prefetch
                    className="press-glow ripple-host rounded-lg px-4 py-2 text-sm font-semibold text-black active:scale-[0.97]"
                    style={{ background: "var(--brass)" }}
                  >
                    {COPY.cta.makeYours}
                  </Link>
                )}
                <button onClick={() => setTour(null)} className="text-[13px] text-ink-3 hover:text-ink-2">
                  Skip tour
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Dead-end nudge: any interaction on fake data pushes toward signup. */}
      {tour === -2 && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6" onClick={() => setTour(null)}>
          <div className="moment-glow w-full max-w-sm rounded-[14px] border border-brass bg-raised p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-[15px] font-medium">This is a live demo</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
              Open your own inbox to reply, approve, and watch {BRAND} handle the rest.
            </p>
            <Link
              href="/onboarding"
              prefetch
              className="press-glow ripple-host mt-4 inline-block rounded-lg px-5 py-2.5 text-sm font-semibold text-black active:scale-[0.97]"
              style={{ background: "var(--brass)" }}
            >
              {COPY.cta.makeYours}
            </Link>
            <button onClick={() => setTour(null)} className="mt-3 block w-full text-[13px] text-ink-3 hover:text-ink-2">
              Keep looking around
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

/** Highlight ring for the spotlight tour's current stop. */
function tourRing(tour: number | null, stop: number): string {
  return tour !== null && tour === stop ? "relative z-[61] ring-2 ring-brass" : "";
}
