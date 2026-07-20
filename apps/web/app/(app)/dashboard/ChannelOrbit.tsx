"use client";

import { useEffect, useRef } from "react";
import { useDashboard } from "./DashboardProvider";

// The AI Core hero (concept faithful): channel badges slowly orbit a breathing
// brass core. Real, connected channels glow; the rest are dimmed "soon". Pure
// CSS rings + rAF badge positioning — no libs. Reduced-motion → static ring.

const NODES = [
  { key: "web_chat", label: "Website", color: "#5B8DEF" },
  { key: "email", label: "Email", color: "#E5765B" },
  { key: "whatsapp", label: "WhatsApp", color: "#3FBF6F" },
  { key: "instagram", label: "Instagram", color: "#C7568F" },
  { key: "messenger", label: "Messenger", color: "#4A7DF0" },
  { key: "voice", label: "Voice", color: "#3FA98C" },
  { key: "calendar", label: "Calendar", color: "#C79B4A" },
  { key: "crm", label: "CRM", color: "#8A8FA3" },
] as const;

export default function ChannelOrbit() {
  const wrap = useRef<HTMLDivElement>(null);
  const badges = useRef<(HTMLDivElement | null)[]>([]);
  const { data } = useDashboard();
  const connected = new Set(data?.connectedTypes ?? []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const place = (t: number) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const rx = rect.width * 0.4;
      const ry = rect.height * 0.36;
      badges.current.forEach((b, i) => {
        if (!b) return;
        const a = (i / NODES.length) * Math.PI * 2 + t * 0.00006;
        const x = cx + Math.cos(a) * rx;
        const y = cy + Math.sin(a) * ry;
        b.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      });
      if (!reduced) raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={wrap} className="relative h-[340px] w-full overflow-hidden rounded-[16px] border border-line bg-raised">
      {/* concentric rings */}
      {[0.5, 0.72, 0.94].map((s) => (
        <div
          key={s}
          className="absolute left-1/2 top-1/2 rounded-[50%] border border-line"
          style={{ width: `${s * 88}%`, height: `${s * 80}%`, transform: "translate(-50%,-50%)" }}
        />
      ))}

      {/* core */}
      <div className="absolute left-1/2 top-1/2 flex h-[104px] w-[104px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full">
        <div className="core-breathe absolute inset-0 rounded-full" style={{ boxShadow: "0 0 60px 8px rgba(212,184,114,0.35)", border: "1.5px solid rgba(212,184,114,0.6)" }} />
        <p className="relative text-[15px] font-semibold" style={{ color: "var(--brass)" }}>Otto</p>
        <p className="relative text-[10px] text-ink-3">Always working</p>
      </div>

      {/* channel badges */}
      {NODES.map((n, i) => {
        const live = connected.has(n.key);
        return (
          <div
            key={n.key}
            ref={(el) => { badges.current[i] = el; }}
            className="absolute left-0 top-0 flex flex-col items-center gap-1"
            style={{ opacity: live ? 1 : 0.4 }}
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold text-white"
              style={{
                background: live ? n.color : "var(--bg-hover)",
                boxShadow: live ? `0 0 16px -2px ${n.color}` : "none",
                border: live ? "none" : "1px solid var(--line)",
              }}
            >
              {n.label[0]}
            </div>
            <span className="text-[9.5px] text-ink-3">{n.label}</span>
          </div>
        );
      })}
    </div>
  );
}
