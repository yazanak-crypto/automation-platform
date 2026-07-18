import * as Sentry from "@sentry/nextjs";

// Audit P1-10: server-side error capture, gated on SENTRY_DSN (no-op without).

export function register() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
  }
}

export const onRequestError = Sentry.captureRequestError;
