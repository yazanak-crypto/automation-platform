"use client";

import { useEffect, useRef } from "react";

/**
 * The Ovanth orbit: a living 3D scene of automations at work. Channel nodes
 * orbit a brass core; message pulses travel the connection beams. Canvas 2D
 * with depth-faked 3D (scale/opacity by z), mouse parallax, 60fps, zero deps.
 * Pauses off-screen and honors prefers-reduced-motion (renders one static frame).
 */
export function Orbit({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx0 = canvas.getContext("2d");
    if (!ctx0) return;
    const ctx = ctx0; // const binding so TS keeps the narrowing inside closures

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    let w = 0, h = 0, raf = 0, running = true;
    let mx = 0, my = 0; // parallax target (-1..1)

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * DPR; canvas.height = h * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Three orbital rings, nodes with phase offsets. z comes from sin of angle.
    const rings = [
      { r: 0.30, tilt: 0.42, speed: 0.00022, nodes: 3, phase: 0.0 },
      { r: 0.44, tilt: 0.36, speed: -0.00016, nodes: 4, phase: 1.7 },
      { r: 0.58, tilt: 0.30, speed: 0.0001, nodes: 5, phase: 3.1 },
    ];
    // Pulses: dots traveling from a node toward the core.
    interface Pulse { ring: number; node: number; t: number; speed: number }
    let pulses: Pulse[] = [];
    let nextPulse = 0;

    const BRASS = "212,184,114";

    function nodePos(ring: (typeof rings)[0], i: number, now: number) {
      const a = ring.phase + (i / ring.nodes) * Math.PI * 2 + now * ring.speed;
      const R = Math.min(w, h) * ring.r;
      const x = Math.cos(a) * R;
      const y = Math.sin(a) * R * ring.tilt;
      const z = Math.sin(a); // -1 (back) .. 1 (front)
      return { x, y, z };
    }

    function frame(now: number) {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2 + mx * 10;
      const cy = h / 2 + my * 8;

      // Core: layered brass glow + dot.
      const breathe = reduced ? 1 : 1 + Math.sin(now / 1200) * 0.06;
      for (const [rad, alpha] of [[46, 0.05], [30, 0.09], [16, 0.16]] as const) {
        ctx.beginPath();
        ctx.arc(cx, cy, rad * breathe, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${BRASS},${alpha})`;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${BRASS},0.95)`;
      ctx.fill();

      // Rings (ellipse paths, faint).
      for (const ring of rings) {
        const R = Math.min(w, h) * ring.r;
        ctx.beginPath();
        ctx.ellipse(cx, cy, R, R * ring.tilt, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Nodes back-to-front for depth.
      const drawn: { x: number; y: number; z: number; ri: number; ni: number }[] = [];
      rings.forEach((ring, ri) => {
        for (let i = 0; i < ring.nodes; i++) {
          const p = nodePos(ring, i, now);
          drawn.push({ x: cx + p.x + mx * (8 + ri * 6), y: cy + p.y + my * (6 + ri * 4), z: p.z, ri, ni: i });
        }
      });
      drawn.sort((a, b) => a.z - b.z);
      for (const n of drawn) {
        const depth = (n.z + 1) / 2; // 0..1
        const size = 2 + depth * 2.6;
        const alpha = 0.25 + depth * 0.6;
        // Beam to core (only front-ish nodes, very faint).
        if (n.z > -0.2) {
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(cx, cy);
          ctx.strokeStyle = `rgba(255,255,255,${0.02 + depth * 0.03})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(n.x, n.y, size, 0, Math.PI * 2);
        ctx.fillStyle = n.ri === 0 ? `rgba(${BRASS},${alpha})` : `rgba(244,244,245,${alpha * 0.8})`;
        ctx.fill();
      }

      // Message pulses: node → core, brass, ease-in.
      if (!reduced && now > nextPulse) {
        const ri = Math.floor(Math.random() * rings.length);
        pulses.push({ ring: ri, node: Math.floor(Math.random() * rings[ri]!.nodes), t: 0, speed: 0.006 + Math.random() * 0.004 });
        nextPulse = now + 700 + Math.random() * 900;
      }
      pulses = pulses.filter((p) => p.t < 1);
      for (const p of pulses) {
        p.t += p.speed;
        const ring = rings[p.ring]!;
        const n = nodePos(ring, p.node, now);
        const ease = p.t * p.t;
        const x = cx + n.x * (1 - ease) + mx * 8;
        const y = cy + n.y * (1 - ease) + my * 6;
        ctx.beginPath();
        ctx.arc(x, y, 2.2 * (1 - p.t * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${BRASS},${0.9 * (1 - p.t * 0.3)})`;
        ctx.fill();
      }

      if (!reduced) raf = requestAnimationFrame(frame);
    }

    const onMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      my = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMouse, { passive: true });

    // Pause when off-screen.
    const io = new IntersectionObserver(([entry]) => {
      const visible = !!entry?.isIntersecting;
      if (visible && !running) {
        running = true;
        if (!reduced) raf = requestAnimationFrame(frame);
      } else if (!visible) {
        running = false;
        cancelAnimationFrame(raf);
      }
    });
    io.observe(canvas);

    raf = requestAnimationFrame(frame);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("mousemove", onMouse);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
