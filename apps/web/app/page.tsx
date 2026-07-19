import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { Magnetic, Tilt } from "@/components/motion";
import { Orbit } from "@/components/orbit";
import { Reveal } from "@/components/reveal";
import { Wordmark } from "@/components/wordmark";
import { BRAND } from "@/lib/brand";

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
              <SignInButton>
                <button className="rounded-lg px-4 py-1.5 text-sm text-ink-2 transition-colors hover:text-ink">
                  Sign in
                </button>
              </SignInButton>
              <SignInButton>
                <button className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-black transition-all duration-150 hover:bg-white/90 active:scale-[0.98]">
                  Start free
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <Link
                href="/dashboard"
                className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-black transition-all duration-150 hover:bg-white/90 active:scale-[0.98]"
              >
                Open dashboard
              </Link>
            </SignedIn>
          </div>
        </div>
      </header>

      {/* Hero: cathedral composition over the brass horizon. */}
      <section className="horizon relative mx-auto flex w-full max-w-3xl flex-col items-center px-6 pt-24 text-center sm:pt-32">
        <Orbit className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] w-full opacity-70" />
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
            <Magnetic>
              <SignInButton>
                <button className="rounded-lg bg-white px-7 py-3 text-sm font-medium text-black transition-all duration-150 hover:bg-white/90 active:scale-[0.98]">
                  Start free
                </button>
              </SignInButton>
            </Magnetic>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="rounded-lg bg-white px-7 py-3 text-sm font-medium text-black transition-all duration-150 hover:bg-white/90 active:scale-[0.98]"
            >
              Open dashboard
            </Link>
          </SignedIn>
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

      <footer className="mx-auto w-full max-w-5xl px-6 py-6 text-center text-[12px] text-ink-3">
        © {new Date().getFullYear()} {BRAND}
      </footer>
    </main>
  );
}
