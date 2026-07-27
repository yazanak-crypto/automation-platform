import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { Tilt } from "@/components/motion";
import { Reveal } from "@/components/reveal";
import { RingField } from "@/components/ring-field";
import { TransitionLink } from "@/components/transition-link";
import { Wordmark } from "@/components/wordmark";
import { PLANS } from "@platform/core";
import { BRAND } from "@/lib/brand";
import { COPY } from "@/lib/tokens";

// Landing (video study applied): sticky quiet nav, badge pill, hero over the
// brass horizon, product frame emerging from the light, reveal-on-scroll
// feature beats. Principles borrowed; visuals our own.

const Check = () => (
  <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="var(--brass)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="7" opacity="0.35" />
    <path d="M5 8.2 7.2 10.4 11 6" />
  </svg>
);

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col overflow-hidden">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <Wordmark href="/" size="lg" />
          <div className="flex items-center gap-2">
            <SignedOut>
              <Link
                href="/demo"
                prefetch
                className="rounded-lg px-4 py-1.5 text-sm text-ink-2 transition-colors hover:text-ink"
              >
                {COPY.cta.loggedOut}
              </Link>
              <SignInButton>
                <button className="press-glow rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-black transition-all duration-150 hover:bg-white/90 active:scale-[0.97]">
                  {COPY.cta.startFree}
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <TransitionLink
                href="/dashboard"
                className="press-glow inline-block rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-black transition-all duration-150 hover:bg-white/90 active:scale-[0.97]"
              >
                {COPY.cta.active}
              </TransitionLink>
            </SignedIn>
          </div>
        </div>
      </header>

      {/* Hero: cathedral composition over the brass horizon. */}
      <section className="relative flex w-full flex-col items-center px-6 pt-24 text-center sm:pt-32">
        {/* The stage: cinematic brass rings, full-bleed, dimmed so the headline
            is always the brightest element. */}
        <RingField className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[130vh] w-[130vw] -translate-x-1/2 -translate-y-1/2 opacity-90" />
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center">
        <span className="rise inline-flex items-center gap-2 rounded-full border border-line bg-raised px-3.5 py-1.5 text-[12px] text-ink-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--brass)" }} />
          Early access — the first AI employee for customer conversations
        </span>
        <h1 className="rise mt-7 text-[42px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[56px]">
          It learns your business.
          <br />
          It talks to your customers.
          <br />
          <span className="text-ink-3">You stay in control.</span>
        </h1>
        <p className="rise mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-ink-2">
          {BRAND} reads your website, learns your voice and policies, and handles conversations
          across your channels — answering the routine instantly, bringing you everything that
          needs judgment.
        </p>
        <div className="rise mt-9 flex flex-col items-center gap-3">
          <SignedOut>
            <SignInButton>
              <button className="press-glow rounded-lg bg-white px-7 py-3 text-sm font-medium text-black transition-all duration-150 hover:bg-white/90 active:scale-[0.97]">
                Start your free trial
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <TransitionLink
              href="/dashboard"
              className="press-glow inline-block rounded-lg bg-white px-7 py-3 text-sm font-medium text-black transition-all duration-150 hover:bg-white/90 active:scale-[0.97]"
            >
              {COPY.cta.active}
            </TransitionLink>
          </SignedIn>
          <SignedOut>
            <Link href="/demo" prefetch className="text-[13px] text-ink-3 underline underline-offset-4 transition-colors hover:text-ink-2">
              or {COPY.cta.loggedOut.toLowerCase()} first →
            </Link>
          </SignedOut>
          <p className="text-[13px] text-ink-3">7 days free · no card required</p>
        </div>

        {/* The product frame emerging from the light (video study). */}
        <Reveal>
          <Tilt>
          <div className="lit moment-glow mx-auto mt-16 w-full max-w-2xl rounded-t-[14px] border border-b-0 border-line bg-raised p-5 text-left">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-[13px] font-medium">Good morning</span>
              <span className="rounded-full bg-ok-dim px-2 py-0.5 text-[11px] font-medium text-ok">
                2 automations on duty
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-4">
              {[
                ["31", "handled for you"],
                ["6", "leads found"],
                ["~2h 10m", "time saved"],
              ].map(([v, l]) => (
                <div key={l}>
                  <p className="tnum text-xl font-semibold" style={{ color: "var(--brass)" }}>{v}</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-3">{l}</p>
                </div>
              ))}
            </div>
          </div>
          </Tilt>
        </Reveal>
        </div>
      </section>

      {/* Feature beats: reveal on scroll, brass checks, no boxes. */}
      <section className="mx-auto w-full max-w-3xl space-y-20 border-t border-line px-6 py-24">
        <Reveal>
          <div className="grid gap-8 sm:grid-cols-[1fr_1.2fr]">
            <h2 className="text-xl font-semibold tracking-[-0.01em]">
              It starts supervised.
              <span className="block text-ink-3">It earns autonomy.</span>
            </h2>
            <ul className="space-y-3 text-sm leading-relaxed text-ink-2">
              <li className="flex gap-3"><Check />Every reply waits for your approval while your AI is in training.</li>
              <li className="flex gap-3"><Check />Approve its work and it graduates: routine questions answered instantly, in your voice.</li>
              <li className="flex gap-3"><Check />Refunds, complaints, negotiations — always brought to you. No exceptions.</li>
            </ul>
          </div>
        </Reveal>

        <Reveal>
          <div className="grid gap-8 sm:grid-cols-[1fr_1.2fr]">
            <h2 className="text-xl font-semibold tracking-[-0.01em]">
              A brain you can read.
              <span className="block text-ink-3">And correct.</span>
            </h2>
            <ul className="space-y-3 text-sm leading-relaxed text-ink-2">
              <li className="flex gap-3"><Check />{BRAND} learns your business from your website — you confirm every fact before it&apos;s used.</li>
              <li className="flex gap-3"><Check />Set boundaries in plain language: &ldquo;never offer discounts&rdquo; means never.</li>
              <li className="flex gap-3"><Check />Update a policy once — every automation uses it on the next reply.</li>
            </ul>
          </div>
        </Reveal>

        <Reveal>
          <div className="grid gap-8 sm:grid-cols-[1fr_1.2fr]">
            <h2 className="text-xl font-semibold tracking-[-0.01em]">
              Every action,
              <span className="block text-ink-3">explained.</span>
            </h2>
            <ul className="space-y-3 text-sm leading-relaxed text-ink-2">
              <li className="flex gap-3"><Check />Ask &ldquo;why this reply?&rdquo; on anything — see the reasoning and the facts it used.</li>
              <li className="flex gap-3"><Check />A complete ledger of everything your AI did, in plain language.</li>
              <li className="flex gap-3"><Check />Pause anytime. Switch back to supervised anytime. Your business, your call.</li>
            </ul>
          </div>
        </Reveal>

        <Reveal>
          <div id="pricing" className="border-t border-line pt-16">
            <div className="text-center">
              <h2 className="text-xl font-semibold tracking-[-0.01em]">Simple, honest pricing.</h2>
              <p className="mt-2 text-sm text-ink-2">
                Start free for 7 days — no card. Every plan is priced by the customer conversations
                it covers, not confusing usage units.
              </p>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {(["trial", "starter", "pro"] as const).map((id) => {
                const p = PLANS[id];
                const convos = Math.round(p.monthlyCredits / 4);
                return (
                  <div key={id} className="rounded-xl border border-line bg-raised p-5">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {id === "trial" ? "Free" : `$${p.priceMonthlyUsd}`}
                      {id !== "trial" && <span className="text-sm font-normal text-ink-3">/mo</span>}
                    </p>
                    <p className="mt-2 text-[13px] text-ink-2">
                      {id === "trial"
                        ? "Full product for 7 days"
                        : `About ${convos.toLocaleString()} customer conversations / month`}
                    </p>
                    {id !== "trial" && p.setupFeeUsd > 0 && (
                      <p className="mt-1 text-[12px] text-ink-3">
                        + ${p.setupFeeUsd} one-time setup
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-center text-[12px] text-ink-3">
              Cancel anytime. Your AI pauses if you run out — it never charges you by surprise.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="flex flex-col items-center border-t border-line pt-16 text-center">
            <p className="text-xl font-semibold tracking-[-0.01em]">Put {BRAND} on duty.</p>
            <div className="mt-6">
              <SignedOut>
                <SignInButton>
                  <button className="rounded-lg bg-white px-7 py-3 text-sm font-medium text-black transition-all duration-150 hover:bg-white/90 active:scale-[0.98]">
                    Start your 7-day free trial
                  </button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <Link
                  href="/dashboard"
                  className="rounded-lg bg-white px-7 py-3 text-sm font-medium text-black transition-all duration-150 hover:bg-white/90 active:scale-[0.98]"
                >
                  Open dashboard
                </Link>
              </SignedIn>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="mx-auto flex w-full max-w-5xl flex-col items-center gap-2 px-6 py-6 text-center text-[12px] text-ink-3 sm:flex-row sm:justify-between">
        <span>© {new Date().getFullYear()} {BRAND}</span>
        <nav className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-ink-2">Privacy</Link>
          <Link href="/terms" className="hover:text-ink-2">Terms</Link>
          <Link href="/refunds" className="hover:text-ink-2">Refunds</Link>
        </nav>
      </footer>
    </main>
  );
}
