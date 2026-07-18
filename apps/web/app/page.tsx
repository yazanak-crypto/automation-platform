import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import Link from "next/link";

// Landing (audit P1-7): one honest, premium screen. The product is the
// marketing; this page just opens the door.

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="text-sm font-semibold tracking-tight">Platform</span>
        <SignedOut>
          <SignInButton>
            <button className="rounded-lg px-4 py-1.5 text-sm text-neutral-300 transition-colors hover:text-white">
              Sign in
            </button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <Link href="/dashboard" className="text-sm text-neutral-300 hover:text-white">
            Open dashboard →
          </Link>
        </SignedIn>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          AI that works for your business.
          <span className="block text-neutral-500">You stay in control.</span>
        </h1>
        <p className="mt-5 max-w-md text-neutral-400">
          Activate AI automations that understand your business, answer your customers, and never
          act without your approval.
        </p>
        <div className="mt-8 flex items-center gap-4">
          <SignedOut>
            <SignInButton>
              <button className="rounded-lg bg-white px-6 py-2.5 font-medium text-black transition-transform duration-150 hover:scale-[1.02]">
                Start free
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="rounded-lg bg-white px-6 py-2.5 font-medium text-black transition-transform duration-150 hover:scale-[1.02]"
            >
              Open dashboard
            </Link>
          </SignedIn>
        </div>
        <p className="mt-6 text-xs text-neutral-600">
          Every AI action is explained. Nothing sends without you.
        </p>
      </section>

      <footer className="px-6 py-5 text-center text-xs text-neutral-600">
        © {new Date().getFullYear()} Platform
      </footer>
    </main>
  );
}
