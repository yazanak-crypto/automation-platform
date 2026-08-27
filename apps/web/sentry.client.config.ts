import * as Sentry from "@sentry/nextjs";
import { sentryEnvironment, sentryRelease, tracesSampleRate } from "./sentry.shared";

// Browser-side capture. Loaded by withSentryConfig in next.config.ts.
//
// This was the missing half: the CSP in next.config.ts has allowed
// https://*.sentry.io and https://*.ingest.sentry.io under connect-src since
// before this file existed, so browser reporting was clearly intended — but
// nothing ever called Sentry.init() on the client, so a crash in the setup
// wizard or the conversation view left no trace anywhere.
//
// The DSN must be NEXT_PUBLIC_ here: it is compiled into the bundle and is
// meant to be public. A Sentry DSN is a write-only ingest key, not a secret —
// it cannot read events. The server-side SENTRY_DSN stays separate so that
// omitting the public one turns off browser reporting on its own.

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: sentryEnvironment(),
    release: sentryRelease(),
    tracesSampleRate: tracesSampleRate(),
    // Session replay is deliberately OFF. This app shows real customer
    // conversations; recording those into a third party is a data-protection
    // decision, not a debugging convenience.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Browser extensions and cross-origin script noise drown out real bugs.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
    ],
    beforeSend(event) {
      // Clerk's dev-instance handshake failures are configuration, not defects,
      // and they fire on every request once keys are mismatched.
      const msg = event.exception?.values?.[0]?.value ?? "";
      if (msg.includes("Handshake token verification failed")) return null;
      return event;
    },
  });

  Sentry.setTag("service", "web");
  Sentry.setTag("runtime", "browser");
}
