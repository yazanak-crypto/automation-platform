import * as Sentry from "@sentry/node";
import { paddleSyncConfigured, reconcilePaddleSubscriptions } from "@platform/core";

// Scheduled drift repair for Paddle subscriptions.
//
// Webhooks are the fast path; this is the one that is allowed to be slow but
// must not be allowed to miss. Paddle retries a failing endpoint exactly three
// times over ~2 minutes and then drops the event permanently, so any brief
// outage silently strips entitlement from everyone who paid during it. An
// hourly sweep bounds that damage to at most an hour instead of forever.
//
// Runs in the worker rather than a Vercel cron because the worker already holds
// the production credential, is a single process (so two sweeps cannot race),
// and has no execution time limit.

const INTERVAL_MS = 60 * 60 * 1000;
// Long enough that a cold worker cannot spam Paddle on a crash-restart loop.
const STARTUP_DELAY_MS = 60 * 1000;

async function sweep() {
  if (!paddleSyncConfigured()) return;
  try {
    const { checked, repaired, skipped } = await reconcilePaddleSubscriptions();

    // A repair means a webhook was lost — that is worth a loud line, because it
    // is the only evidence the push path failed.
    for (const r of repaired) {
      console.warn(
        `[billing.reconcile] REPAIRED workspace ${r.workspaceId}: ${r.from} -> ${r.to} ` +
          `(a webhook was missed)`,
      );
    }
    for (const s of skipped) {
      console.error(`[billing.reconcile] skipped subscription ${s.id}: ${s.reason}`);
    }
    if (repaired.length === 0 && skipped.length === 0) {
      console.log(`[billing.reconcile] ${checked} subscription(s) in sync`);
    }
  } catch (err) {
    // Never throws: a Paddle outage must not take down the worker that also
    // drafts replies and delivers messages.
    console.error("[billing.reconcile] sweep failed:", err);
    Sentry.captureException(err);
  }
}

export function startBillingReconcile() {
  if (!paddleSyncConfigured()) {
    console.log("[billing.reconcile] PADDLE_API_KEY not set — reconciliation disabled");
    return () => {};
  }
  const first = setTimeout(() => void sweep(), STARTUP_DELAY_MS);
  const timer = setInterval(() => void sweep(), INTERVAL_MS);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
