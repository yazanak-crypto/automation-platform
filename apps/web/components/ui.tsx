"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/* The Operator System primitives (Design Direction §2). Every page composes
 * these — no page invents its own chrome, spinner text, or empty state. */

// ── Layout ──────────────────────────────────────────────────────────────────

export function Page({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto w-full ${wide ? "max-w-6xl" : "max-w-4xl"} px-5 py-8 md:px-10 md:py-10 pb-24 md:pb-10`}>
      {children}
    </main>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-8">
      {back && (
        <Link
          href={back.href}
          className="mb-3 inline-block text-[13px] text-ink-3 transition-colors hover:text-ink-2"
        >
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em]">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-2">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function Section({
  label,
  children,
  right,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mt-10 first:mt-0 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">{label}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Raised surface = "you can act here". Everything else sits on the page. */
export function Card({
  children,
  className = "",
  tone,
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "wait" | "stop" | "brass";
}) {
  const edge =
    tone === "wait"
      ? "border-l-2 border-l-wait"
      : tone === "stop"
        ? "border-l-2 border-l-stop"
        : tone === "brass"
          ? "border-l-2 border-l-brass"
          : "";
  return (
    <div className={`lit rounded-[10px] border border-line bg-raised p-4 ${edge} ${className}`}>
      {children}
    </div>
  );
}

// ── Buttons ─────────────────────────────────────────────────────────────────

const BTN = {
  primary:
    "bg-white text-black hover:bg-white/90 font-medium",
  ghost:
    "border border-line text-ink-2 hover:border-line-strong hover:text-ink",
  danger:
    "border border-stop/30 text-stop hover:bg-stop-dim",
  ok: "bg-ok/90 text-black font-medium hover:bg-ok",
} as const;

export function Button({
  variant = "ghost",
  size = "md",
  className = "",
  onPointerDown,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BTN;
  size?: "sm" | "md" | "lg";
}) {
  const pad = size === "sm" ? "px-3 py-1.5 text-[13px]" : size === "lg" ? "px-6 py-2.5 text-sm" : "px-4 py-2 text-sm";
  return (
    <button
      className={`ripple-host rounded-lg transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${pad} ${BTN[variant]} ${className}`}
      onPointerDown={(e) => {
        // Click physics: a ripple from the press point, every button, 450ms.
        const host = e.currentTarget;
        const r = host.getBoundingClientRect();
        const d = Math.max(r.width, r.height);
        const s = document.createElement("span");
        s.className = "ripple";
        s.style.width = s.style.height = `${d}px`;
        s.style.left = `${e.clientX - r.left - d / 2}px`;
        s.style.top = `${e.clientY - r.top - d / 2}px`;
        host.appendChild(s);
        setTimeout(() => s.remove(), 500);
        onPointerDown?.(e);
      }}
      {...props}
    />
  );
}

// ── Status language (no raw enums, one meaning per color) ───────────────────

const PILL_TONES = {
  ok: "bg-ok-dim text-ok",
  wait: "bg-wait-dim text-wait",
  stop: "bg-stop-dim text-stop",
  neutral: "bg-hover text-ink-2",
  brass: "bg-brass-dim text-brass",
} as const;

export function Pill({
  tone = "neutral",
  dot = false,
  children,
}: {
  tone?: keyof typeof PILL_TONES;
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${PILL_TONES[tone]}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Human vocabulary for machine states — the only place enums meet the UI. */
export function modePill(mode: string, status?: string) {
  if (status === "paused") return <Pill tone="neutral">Paused</Pill>;
  if (mode === "smart") return <Pill tone="ok" dot>Smart · on duty</Pill>;
  return <Pill tone="brass" dot>Supervised · in training</Pill>;
}

export function conversationStatusPill(status: string, pendingDraft?: boolean) {
  if (pendingDraft) return <Pill tone="wait" dot>Draft waiting</Pill>;
  if (status === "waiting_approval") return <Pill tone="wait" dot>Needs you</Pill>;
  if (status === "closed") return <Pill tone="neutral">Closed</Pill>;
  return <Pill tone="ok" dot>Open</Pill>;
}

// ── System feedback ─────────────────────────────────────────────────────────

export function Notice({
  tone,
  title,
  children,
  href,
}: {
  tone: "ok" | "wait" | "stop" | "brass";
  title: React.ReactNode;
  children?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <div
      className={`rise rounded-[10px] border border-line bg-raised p-4 border-l-2 ${
        tone === "ok" ? "border-l-ok" : tone === "wait" ? "border-l-wait" : tone === "stop" ? "border-l-stop" : "border-l-brass"
      } ${href ? "transition-colors hover:bg-hover" : ""}`}
    >
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{children}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function InlineError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className="rise mt-3 text-[13px] text-stop">{children}</p>;
}

// ── States: loading, empty ──────────────────────────────────────────────────

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line py-3.5">
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-12" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rise flex flex-col items-start rounded-[10px] border border-dashed border-line px-6 py-10">
      <p className="text-[15px] font-medium">{title}</p>
      {children && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-2">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── Time ────────────────────────────────────────────────────────────────────

export function relativeTime(iso: string | Date): string {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function RelativeTime({ value }: { value: string | Date }) {
  // Render on client only to avoid SSR/client clock mismatch.
  const [text, setText] = useState<string>("");
  useEffect(() => {
    setText(relativeTime(value));
    const t = setInterval(() => setText(relativeTime(value)), 30_000);
    return () => clearInterval(t);
  }, [value]);
  return <time className="tnum text-[12px] text-ink-3">{text}</time>;
}
