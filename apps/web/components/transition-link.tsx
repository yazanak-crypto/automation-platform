"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Wordmark } from "./wordmark";
import { COPY } from "@/lib/tokens";

/**
 * Branded route transition (spec §1): pressed feedback <100ms, overlay with
 * gold shimmer sweep + wordmark pulse + cycling microcopy. Hard ceiling 1.2s —
 * the overlay never outlives the navigation; if the route resolves faster it
 * disappears with it. Prefetch happens via next/link on hover/viewport.
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
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [line, setLine] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Route changed or ceiling hit → overlay gone.
  useEffect(() => {
    setActive(false);
    if (timer.current) clearTimeout(timer.current);
  }, [pathname]);

  useEffect(() => {
    if (!active) return;
    const cycle = setInterval(() => setLine((l) => (l + 1) % COPY.overlay.lines.length), 420);
    timer.current = setTimeout(() => setActive(false), 1200);
    return () => {
      clearInterval(cycle);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active]);

  return (
    <>
      <Link
        href={href}
        prefetch
        className={className}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) return;
          e.preventDefault();
          setActive(true);
          router.push(href);
        }}
      >
        {children}
      </Link>
      {active && (
        <div className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-bg" aria-hidden>
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
