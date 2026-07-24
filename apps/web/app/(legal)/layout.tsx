import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

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
    </div>
  );
}
