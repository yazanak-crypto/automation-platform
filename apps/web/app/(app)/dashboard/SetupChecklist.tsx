import Link from "next/link";
import { BRAND } from "@/lib/brand";

/**
 * Never-empty dashboard (spec §4). Until channels + an activation exist, the
 * first view is a guided checklist that keeps selling — not blank panels.
 */
export default function SetupChecklist({
  brainConfirmed,
  hasChannel,
  hasActivation,
}: {
  brainConfirmed: boolean;
  hasChannel: boolean;
  hasActivation: boolean;
}) {
  const steps = [
    {
      done: brainConfirmed,
      title: "Teach it your business",
      body: "Confirm what Otto learned from your website — its voice, policies, and FAQs.",
      href: "/onboarding",
      cta: "Review the brain",
    },
    {
      done: hasChannel,
      title: "Connect a channel",
      body: "Add website chat or email so customer messages start arriving in one inbox.",
      href: "/channels",
      cta: "Connect a channel",
    },
    {
      done: hasActivation,
      title: "Put your first automation on duty",
      body: `Activate the Lead Concierge. It starts supervised — you approve every reply until you trust it.`,
      href: "/marketplace",
      cta: "Browse automations",
    },
  ];
  const remaining = steps.filter((s) => !s.done).length;
  const next = steps.find((s) => !s.done);

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">
          Get {BRAND} on duty
        </h2>
        <span className="tnum text-[12px] text-ink-3">
          {steps.length - remaining} / {steps.length} done
        </span>
      </div>

      <div className="space-y-2.5">
        {steps.map((s) => {
          const isNext = s === next;
          return (
            <div
              key={s.title}
              className={`lit flex items-center gap-4 rounded-[10px] border bg-raised p-4 ${
                isNext ? "border-l-2 border-l-brass border-line" : "border-line"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] ${
                  s.done ? "bg-ok-dim text-ok" : "bg-hover text-ink-3"
                }`}
              >
                {s.done ? "✓" : ""}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${s.done ? "text-ink-3 line-through" : ""}`}>{s.title}</p>
                {!s.done && <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{s.body}</p>}
              </div>
              {!s.done && (
                <Link
                  href={s.href}
                  prefetch
                  className={`press-glow shrink-0 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-all active:scale-[0.97] ${
                    isNext ? "bg-white text-black hover:bg-white/90" : "border border-line text-ink-2 hover:text-ink"
                  }`}
                >
                  {s.cta}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
