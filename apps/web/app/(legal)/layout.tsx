import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { LEGAL } from "@/lib/legal";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Wordmark href="/" />
          <Link href="/" className="text-sm text-ink-2 hover:text-ink">
            ← Home
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">{children}</main>
      {/* Cross-links so every policy page reaches the others in one click.
          Paddle's verification checks these URLs; a page that is only
          reachable from the homepage footer is easy to strand in a redesign. */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-5 gap-y-2 px-6 py-6 text-[12px] text-ink-3">
          <Link href="/pricing" className="hover:text-ink-2">Pricing</Link>
          <Link href="/terms" className="hover:text-ink-2">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-ink-2">Privacy Policy</Link>
          <Link href="/refunds" className="hover:text-ink-2">Refund Policy</Link>
          <span className="ml-auto">{LEGAL.entity}</span>
        </div>
      </footer>
    </div>
  );
}
