"use client";

import { useEffect, useRef } from "react";

/**
 * The landing stage (design evolution). Massive soft luminous brass rings —
 * flowing energy, not graphics. Each layer rotates at its own speed/thickness
 * and breathes in opacity. The cursor never MOVES the rings; presence only
 * speeds their rotation, shifts perspective a touch, and lifts light intensity,
 * all easing back to idle when the cursor stills. Pure canvas, GPU-friendly,
 * 60fps, reduced-motion aware. Atmosphere behind the headline — never content.
 */
export function RingField({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const c = canvas.getContext("2d");
    if (!c) return;
    const ctx = c;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    let w = 0, h = 0, raf = 0, running = true;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * DPR; canvas.height = h * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Layered rings: radius fraction, base ellipse tilt, rotation speed,
    // thickness, opacity phase. Radii skew large so light lives at the edges.
    const rings = [
      { rf: 0.55, tilt: 0.82, spd: 0.06, th: 2.4, phase: 0.0 },
      { rf: 0.70, tilt: 0.70, spd: -0.045, th: 1.6, phase: 1.2 },
      { rf: 0.85, tilt: 0.60, spd: 0.032, th: 3.0, phase: 2.4 },
      { rf: 1.02, tilt: 0.52, spd: -0.024, th: 1.3, phase: 3.5 },
      { rf: 1.22, tilt: 0.46, spd: 0.018, th: 2.0, phase: 4.6 },
    ];

    // Idle vs presence, all eased (lerp) — nothing snaps.
    let boost = 0, boostTarget = 0;        // 0 idle → 1 active
    let tiltX = 0, tiltXTarget = 0;        // perspective shift (subtle)
    let rot = 0;                            // accumulated rotation
    let lastMove = 0;

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    function frame(now: number) {
      if (!running) return;

      // Presence decays after the cursor stills → smooth return to idle.
      if (now - lastMove > 120) { boostTarget = 0; tiltXTarget = 0; }
      boost = lerp(boost, boostTarget, 0.045);
      tiltX = lerp(tiltX, tiltXTarget, 0.05);

      const speedMul = reduced ? 0 : 1 + boost * 1.6; // presence speeds rotation
      rot += 0.0016 * speedMul;

      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.46;
      const base = Math.min(w, h);

      for (const ring of rings) {
        const R = base * ring.rf;
        // Perspective: cursor x nudges the ellipse tilt a hair (never a translate).
        const ry = R * (ring.tilt + tiltX * 0.06);
        const breathe = reduced ? 0.5 : 0.5 + Math.sin(now / 2600 + ring.phase) * 0.5;
        const alpha = (0.05 + breathe * 0.09) * (0.7 + boost * 0.6);

        const grad = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
        grad.addColorStop(0, `rgba(212,184,114,0)`);
        grad.addColorStop(0.5, `rgba(212,184,114,${alpha})`);
        grad.addColorStop(1, `rgba(212,184,114,0)`);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot * ring.spd * 40 + ring.phase);
        ctx.beginPath();
        ctx.ellipse(0, 0, R, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = grad;
        ctx.lineWidth = ring.th;
        ctx.shadowColor = `rgba(212,184,114,${0.35 + boost * 0.3})`;
        ctx.shadowBlur = 24 + boost * 16;
        ctx.stroke();
        ctx.restore();
      }

      if (!reduced) raf = requestAnimationFrame(frame);
    }

    const onMove = (e: MouseEvent) => {
      lastMove = performance.now();
      boostTarget = 1;
      const r = canvas.getBoundingClientRect();
      tiltXTarget = ((e.clientX - r.left) / r.width - 0.5) * 2; // -1..1
    };
    window.addEventListener("mousemove", onMove, { passive: true });

    const io = new IntersectionObserver(([en]) => {
      const vis = !!en?.isIntersecting;
      if (vis && !running) { running = true; if (!reduced) raf = requestAnimationFrame(frame); }
      else if (!vis) { running = false; cancelAnimationFrame(raf); }
    });
    io.observe(canvas);

    raf = requestAnimationFrame(frame);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
