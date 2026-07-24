"use client";

import { Wordmark } from "@/components/wordmark";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <Wordmark size="lg" href="/" />
      <div>
        <p className="text-2xl font-semibold tracking-[-0.01em]">Something went wrong</p>
        <p className="mt-2 text-sm text-ink-2">
          A hiccup on our end — your data is safe. Try again in a moment.
        </p>
      </div>
      <button
        onClick={reset}
        className="press-glow rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition-transform active:scale-[0.97]"
      >
        Try again
      </button>
    </main>
  );
}
