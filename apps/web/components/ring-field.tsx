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

    // Layered rings: radius fraction, ellipse tilt, direction, thickness,
    // opacity phase. Bold + glowing (not thin lines) — brass light you can see.
    const rings = [
      { rf: 0.52, tilt: 0.80, dir: 1, th: 5.0, phase: 0.0 },
      { rf: 0.68, tilt: 0.68, dir: -1, th: 3.5, phase: 1.2 },
      { rf: 0.84, tilt: 0.58, dir: 1, th: 6.0, phase: 2.4 },
      { rf: 1.02, tilt: 0.50, dir: -1, th: 3.0, phase: 3.5 },
      { rf: 1.22, tilt: 0.44, dir: 1, th: 4.5, phase: 4.6 },
    ];

    // Rotation speed tracks cursor VELOCITY: fast cursor → fast spin, slow → slow,
    // still → gentle idle. All eased, nothing snaps.
    const IDLE = 1;            // baseline multiplier (slow circular motion)
    let speed = IDLE, speedTarget = IDLE;
    let rot = 0;
    let lastX = 0, lastY = 0, lastT = 0, primed = false;

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    function frame(now: number) {
      if (!running) return;

      speed = lerp(speed, speedTarget, 0.06);
      speedTarget = lerp(speedTarget, IDLE, 0.02); // decays back to idle when still
      rot += reduced ? 0 : 0.0022 * speed;

      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.46;
      const base = Math.min(w, h);
      const glowPulse = 0.85 + speed * 0.05;

      for (const ring of rings) {
        const R = base * ring.rf;
        const ry = R * ring.tilt;
        const breathe = reduced ? 0.7 : 0.6 + Math.sin(now / 2800 + ring.phase) * 0.4;
        // Bold, visible brass — high alpha, strong glow.
        const alpha = (0.16 + breathe * 0.16) * glowPulse;

        const grad = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
        grad.addColorStop(0, "rgba(212,184,114,0)");
        grad.addColorStop(0.5, `rgba(226,196,124,${alpha})`);
        grad.addColorStop(1, "rgba(212,184,114,0)");

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot * ring.dir + ring.phase);
        ctx.beginPath();
        ctx.ellipse(0, 0, R, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = grad;
        ctx.lineWidth = ring.th;
        ctx.lineCap = "round";
        ctx.shadowColor = "rgba(212,184,114,0.75)";
        ctx.shadowBlur = 40 + speed * 8;
        ctx.stroke();
        ctx.stroke(); // double pass → deeper, more luminous glow
        ctx.restore();
      }

      if (!reduced) raf = requestAnimationFrame(frame);
    }

    const onMove = (e: MouseEvent) => {
      const t = performance.now();
      if (primed) {
        const dt = Math.max(8, t - lastT);
        const dist = Math.hypot(e.clientX - lastX, e.clientY - lastY);
        const v = dist / dt; // px per ms
        // Map cursor velocity → spin multiplier (idle 1 → up to ~7).
        speedTarget = Math.min(7, IDLE + v * 2.2);
      }
      lastX = e.clientX; lastY = e.clientY; lastT = t; primed = true;
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
