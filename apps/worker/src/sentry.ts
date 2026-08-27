import * as Sentry from "@sentry/node";

// Worker error reporting. Imported by index.ts immediately after ./env, so the
// DSN is loaded before this runs.
//
// The worker matters more than the web app here: message delivery runs in this
// process. When a WhatsApp send failed for a whole workspace, the only record
// was a `runs.error_summary` row nobody was watching — the captureException
// beside it was a no-op because no DSN was ever set. Reporting is what turns
// that from "query production to find out" into "an alert".

/**
 * Which deployment this is. Explicit SENTRY_ENVIRONMENT wins; otherwise Railway
 * names it. Falls back to NODE_ENV so a local worker is labelled `development`
 * rather than silently sharing production's stream.
 */
export function sentryEnvironment(): string {
  return (
    process.env.SENTRY_ENVIRONMENT ||
    process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.NODE_ENV ||
    "development"
  );
}

function release(): string | undefined {
  return process.env.SENTRY_RELEASE || process.env.RAILWAY_GIT_COMMIT_SHA || undefined;
}

/** True once init has run, so callers can log the difference honestly. */
export function initSentry(): boolean {
  if (!process.env.SENTRY_DSN) return false;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: sentryEnvironment(),
    release: release(),
    // Errors are always sent in full; this governs traces only.
    tracesSampleRate: sentryEnvironment() === "production" ? 0.1 : 1.0,
    // Web and worker share a DSN. Without this they are one stream and
    // "is delivery broken?" cannot be answered from the Sentry UI.
    serverName: "worker",
  });

  Sentry.setTag("service", "worker");
  if (process.env.RAILWAY_REPLICA_ID) {
    Sentry.setTag("replica", process.env.RAILWAY_REPLICA_ID);
  }
  return true;
}
