"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Wordmark } from "./wordmark";
import { COPY } from "@/lib/tokens";

/**
 * Branded route transition (spec §1). The overlay is tied to REAL navigation
 * state via useTransition: isPending stays true from router.push until the
 * destination's server components finish rendering and commit — so the loading
 * state lasts exactly as long as the navigation, never a fixed timeout. A long
 * safety cap only guards against a genuinely hung request.
 */
export function TransitionLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [line, setLine] = useState(0);
  const [safetyElapsed, setSafetyElapsed] = useState(false);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cycle microcopy + arm the safety cap only while genuinely navigating.
  useEffect(() => {
    if (!pending) {
      setSafetyElapsed(false);
      if (safety.current) clearTimeout(safety.current);
      return;
    }
    const cycle = setInterval(() => setLine((l) => (l + 1) % COPY.overlay.lines.length), 420);
    safety.current = setTimeout(() => setSafetyElapsed(true), 15000);
    return () => {
      clearInterval(cycle);
      if (safety.current) clearTimeout(safety.current);
    };
  }, [pending]);

  const showOverlay = pending && !safetyElapsed;

  return (
    <>
      <Link
        href={href}
        prefetch
        className={className}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) return; // let new-tab through
          e.preventDefault();
          // isPending is true until the destination RSC render commits.
          startTransition(() => router.push(href));
        }}
      >
        {children}
      </Link>
      {showOverlay && (
        <div className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-bg" aria-live="polite">
          <div className="shimmer-line" />
          <div className="pulse-once">
            <Wordmark size="lg" />
          </div>
          <p className="tnum mt-4 font-mono text-[12px] text-ink-3">{COPY.overlay.lines[line]}</p>
        </div>
      )}
    </>
  );
}
