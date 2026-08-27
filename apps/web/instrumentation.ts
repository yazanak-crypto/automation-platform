import * as Sentry from "@sentry/nextjs";
import { sentryEnvironment, sentryRelease, tracesSampleRate } from "./sentry.shared";

// Audit P1-10: server-side error capture, gated on SENTRY_DSN (no-op without).
//
// `register()` runs once per runtime, so this covers BOTH the Node server
// (route handlers, server components) and the Edge runtime (middleware). They
// need separate inits — an event raised in middleware, like the Clerk handshake
// failures, is invisible if only the Node runtime is initialised.

export function register() {
  if (!process.env.SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: sentryEnvironment(),
    release: sentryRelease(),
    tracesSampleRate: tracesSampleRate(),
    // Named so a Sentry event says which process raised it. Web and worker
    // share a DSN; without this they are one indistinguishable stream.
    serverName: process.env.NEXT_RUNTIME === "edge" ? "web-edge" : "web-server",
  });

  Sentry.setTag("service", "web");
  Sentry.setTag("runtime", process.env.NEXT_RUNTIME ?? "nodejs");
}

/**
 * Next 15 hands every uncaught request error here — route handlers, server
 * components, middleware. Without it, a thrown error becomes a 500 the user
 * sees and nothing anyone can read afterwards.
 */
export const onRequestError = Sentry.captureRequestError;
