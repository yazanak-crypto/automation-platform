// Sentry options shared by the server, edge and browser runtimes.
//
// Everything is derived from env so the same build behaves correctly wherever
// it runs, and so nothing here needs a DSN committed to the repo.

/**
 * Which deployment this is.
 *
 * Without it every event lands in one undifferentiated stream and a local
 * experiment is indistinguishable from a customer-facing failure — which is
 * exactly the state this replaces. Explicit SENTRY_ENVIRONMENT wins so a
 * one-off (a staging box, a bisect) can label itself; otherwise the platform
 * tells us. VERCEL_ENV is "production" | "preview" | "development".
 */
export function sentryEnvironment(): string {
  return (
    process.env.SENTRY_ENVIRONMENT ||
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development"
  );
}

/**
 * Which build this is. Ties an event to a commit, so "when did this start"
 * is answerable without guessing from timestamps.
 */
export function sentryRelease(): string | undefined {
  return (
    process.env.SENTRY_RELEASE ||
    process.env.NEXT_PUBLIC_SENTRY_RELEASE ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    undefined
  );
}

/**
 * Sample rate for performance traces.
 *
 * Errors are ALWAYS sent in full — this only governs tracing. Preview and local
 * runs trace everything because volume is trivial and a reproduction is worth
 * more there; production stays at 10% to keep the bill predictable.
 */
export function tracesSampleRate(): number {
  return sentryEnvironment() === "production" ? 0.1 : 1.0;
}
