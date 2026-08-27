"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Wordmark } from "@/components/wordmark";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The error was previously destructured away and never looked at: a user saw
  // "Something went wrong" and no record of what went wrong existed anywhere.
  // React only passes it here, so this is the one chance to report it.
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: "route" } });
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <Wordmark size="lg" href="/" />
      <div>
        <p className="text-2xl font-semibold tracking-[-0.01em]">Something went wrong</p>
        <p className="mt-2 text-sm text-ink-2">
          A hiccup on our end — your data is safe. Try again in a moment.
        </p>
        {/* The digest is what ties this screen to the server-side log entry.
            Without it a support conversation starts from nothing. */}
        {error.digest && (
          <p className="mt-3 font-mono text-[11px] text-ink-3">Reference: {error.digest}</p>
        )}
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
