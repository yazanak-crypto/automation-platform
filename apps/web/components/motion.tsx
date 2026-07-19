"use client";

import { useEffect, useRef, useState } from "react";

/** 3D tilt-with-glare wrapper (video/2026 study). Pointer-driven perspective;
 *  settles home on leave; disabled under reduced motion. */
export function Tilt({ children, max = 7 }: { children: React.ReactNode; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const glare = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (e: PointerEvent) => {
      const r = node.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      node.style.transform = `perspective(900px) rotateX(${-py * max}deg) rotateY(${px * max}deg) translateZ(0)`;
      if (glare.current) {
        glare.current.style.background = `radial-gradient(420px circle at ${((px + 0.5) * 100).toFixed(1)}% ${((py + 0.5) * 100).toFixed(1)}%, rgba(255,255,255,0.07), transparent 60%)`;
      }
    };
    const onLeave = () => {
      node.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
      if (glare.current) glare.current.style.background = "transparent";
    };
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
    };
  }, [max]);

  return (
    <div ref={ref} className="relative transition-transform duration-200 ease-out will-change-transform">
      {children}
      <div ref={glare} className="pointer-events-none absolute inset-0 rounded-[inherit]" aria-hidden />
    </div>
  );
}

/** Magnetic wrapper: the element leans toward the cursor inside its field. */
export function Magnetic({ children, strength = 0.25 }: { children: React.ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (e: PointerEvent) => {
      const r = node.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      node.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
    };
    const onLeave = () => { node.style.transform = "translate(0,0)"; };
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
    };
  }, [strength]);
  return (
    <div ref={ref} className="inline-block transition-transform duration-200 ease-out will-change-transform">
      {children}
    </div>
  );
}

/** Brass burst: 10 particles radiating from the click point. The reward
 *  physics for the two big commitments (approve, go live). */
export function useBurst() {
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);
  function burst(e: React.MouseEvent) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = Date.now();
    setBursts((b) => [...b, { id, x: e.clientX, y: e.clientY }]);
    setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 700);
  }
  const node = (
    <>
      {bursts.map((b) => (
        <span key={b.id} className="pointer-events-none fixed z-[9999]" style={{ left: b.x, top: b.y }} aria-hidden>
          {Array.from({ length: 10 }).map((_, i) => (
            <span
              key={i}
              className="burst-dot"
              style={{
                ["--bx" as string]: `${Math.cos((i / 10) * Math.PI * 2) * (26 + (i % 3) * 12)}px`,
                ["--by" as string]: `${Math.sin((i / 10) * Math.PI * 2) * (26 + (i % 3) * 12)}px`,
                animationDelay: `${i * 8}ms`,
              }}
            />
          ))}
        </span>
      ))}
    </>
  );
  return { burst, burstNode: node };
}
