"use client";

import { useEffect, useRef } from "react";

/** Scroll-reveal (video study): sections rise into view once, 350ms, CSS-driven.
 *  Respects prefers-reduced-motion via the .reveal styles in globals.css. */
export function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            node.classList.add("in");
            io.disconnect();
          }
        }
      },
      { threshold: 0.15 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="reveal" style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}
