import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

// Landing: one calm screen. The product is the proof; this page opens the door.

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col overflow-hidden">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Wordmark href="/" size="lg" />
        <SignedOut>
          <SignInButton>
            <button className="rounded-lg px-4 py-1.5 text-sm text-ink-2 transition-colors hover:text-ink">
              Sign in
            </button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <Link href="/dashboard" className="text-sm text-ink-2 transition-colors hover:text-ink">
            Open dashboard →
          </Link>
        </SignedIn>
      </header>

      <section className="horizon mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 pb-24">
        <p className="mb-5 text-[13px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--brass)" }}>
          The AI operator for your business
        </p>
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[52px]">
          It learns your business.
          <br />
          It talks to your customers.
          <br />
          <span className="text-ink-3">You stay in control.</span>
        </h1>
        <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-2">
          An AI that reads your website, learns your voice and policies, and handles customer
          conversations across your channels — answering the routine instantly, and bringing you
          everything that needs judgment.
        </p>
        <div className="mt-9 flex items-center gap-5">
          <SignedOut>
            <SignInButton>
              <button className="rounded-lg bg-white px-6 py-3 text-sm font-medium text-black transition-all duration-150 hover:bg-white/90 active:scale-[0.98]">
                Start free
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="rounded-lg bg-white px-6 py-3 text-sm font-medium text-black transition-all duration-150 hover:bg-white/90 active:scale-[0.98]"
            >
              Open dashboard
            </Link>
          </SignedIn>
          <p className="text-[13px] text-ink-3">Live in 10 minutes · no card required</p>
        </div>

        <div className="mt-16 flex flex-col gap-2.5 border-l border-line pl-5 text-[13.5px] text-ink-3">
          <p>Nothing is ever sent without your approval — until you decide it's earned autonomy.</p>
          <p>Every AI action is recorded and explained in plain language.</p>
          <p>Refunds, complaints, and judgment calls always come to you.</p>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-5xl px-6 py-6 text-[12px] text-ink-3">
        © {new Date().getFullYear()}
      </footer>
    </main>
  );
}
