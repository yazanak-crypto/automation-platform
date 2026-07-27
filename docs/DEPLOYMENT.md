# Production deployment & operations

Two long-running processes: the **web app** (`apps/web`, Next.js) and the **worker**
(`apps/worker`, BullMQ + pollers). Both read env from the monorepo-root `.env`.

## 1. Environment validation (do this first)
```bash
pnpm preflight   # checks DB, Redis, Clerk, Anthropic, Nango, Stripe, Email, Meta, Sentry
```
Deploy only when all **required** rows pass: `DATABASE_URL`, `REDIS_URL`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ANTHROPIC_API_KEY`.
Required for the full product: `NANGO_SECRET_KEY` + `NEXT_PUBLIC_NANGO_PUBLIC_KEY`,
`STRIPE_*`, `RESEND_API_KEY` + `NOTIFICATIONS_FROM_EMAIL`, `META_APP_SECRET` +
`META_WEBHOOK_VERIFY_TOKEN`, `SENTRY_DSN`, and `NEXT_PUBLIC_APP_URL`.
See `.env.example` for the complete list.

## 2. Database migrations (release step)
```bash
pnpm --filter @platform/db db:migrate
```
Run this **before** starting the new web/worker versions. See `docs/DATABASE-MIGRATIONS.md`.

## 3. Web app
```bash
pnpm --filter @platform/web build
pnpm --filter @platform/web start   # or deploy to Vercel
```
- Health probe: **`GET /api/health`** → 200 `{ ok, checks:{ db, redis, worker } }`, 503 if db/redis down.
- Point your uptime monitor (Better Uptime / Pingdom / Vercel) at `/api/health` and alert on
  non-200 **and** on `checks.worker !== "ok"` (a stale/down worker means no AI replies).

## 4. Worker (must auto-restart)
The worker runs from TS source via `tsx` (do not reintroduce a tsc build — see
`memory`/`docs`): `pnpm --filter @platform/worker start`.

Run it under a supervisor with an automatic restart policy so a crash self-heals:
- **Docker/Compose:** `restart: always`
- **systemd:** `Restart=always` + `RestartSec=5`
- **PM2:** `pm2 start "pnpm --filter @platform/worker start" --name ovanth-worker`

The worker exits on uncaught exceptions (after flushing Sentry) specifically so the supervisor
restarts a clean process. It writes `worker:heartbeat` to Redis every 60s; `/api/health` reports
staleness if it stops.

## 5. Monitoring & alerting
- **Errors:** set `SENTRY_DSN` (both web and worker init Sentry when it's set).
- **Uptime:** monitor `/api/health` (covers web + db + redis + worker liveness).
- **Logs:** capture stdout/stderr from both processes in your host's log drain.

## 6. Backups / DR
Neon provides point-in-time recovery — confirm the retention window meets your RPO. Redis
(Upstash) holds only queues/rate-limits/cache (regenerable); no durable-data backup needed.

## 7. Background jobs (owned by the worker)
- `webchat.draft` queue — AI drafting + delivery (BullMQ).
- Email polling (Gmail) every 2 min; idle-conversation sweep hourly; heartbeat every 60s.
All run inside the single worker process — keep exactly one instance unless you add distributed
locking beyond the existing per-conversation Redis lock.

## 8. Data-subject requests
Export: in-app (Settings → Data). Deletion: follow `docs/GDPR-DELETION.md`.

## 9. Before enabling BILLING_ENABLED (Stripe)
Billing currently runs on manual bank/Whish payments (`/checkout` → `payments` table →
`/admin` review). All Stripe code is present but inert: `billingConfigured()` requires
`BILLING_ENABLED=true`, so checkout, the portal, and the Stripe webhook all return
"not configured" today.

**Blocker — resolve before flipping the flag.** `applySubscriptionState()` in
`packages/core/src/billing.ts` writes `workspaces.plan` unconditionally and never reads
`workspaces.paid_through`. Manual payments write *both* columns. Once the Stripe webhook
is live, a single event can silently undo a paying manual customer:

- A **non-active** Stripe status forces `plan` back to `"trial"` while `paid_through` is
  still in the future. `getCreditStatus()` then sees `manualActive === true` with plan
  `"trial"` (`isPlanId("trial")` is true), so the customer keeps access but silently drops
  to the 300-credit trial allowance — after paying for Starter or Premium.
- An **active** Stripe status overwrites a manually-set plan, leaving a `paid_through`
  that belongs to a different plan than the one now stored.

Decide which source of truth wins and enforce it in `applySubscriptionState()`. Either:
- skip the `workspaces.plan` write while `paid_through` is in the future (manual wins until
  it lapses), or
- clear `paid_through` when a Stripe subscription becomes active (Stripe takes over).

Checklist:
- [ ] Resolve the `applySubscriptionState()` / `paid_through` collision above.
- [ ] Registered company + LIVE Stripe keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
- [ ] Create live prices and set `STRIPE_PRICE_*` (see `scripts/stripe-setup.ts`; its
      `lookup` keys are still the legacy `otto_*` values — do not rename them if prices
      already exist).
- [ ] Point the Stripe webhook at `/api/webhooks/stripe` and verify the signing secret.
- [ ] Decide what happens to workspaces already on a manual `paid_through` at cutover.
- [ ] Set `BILLING_ENABLED=true` and redeploy (the flag is read at runtime, but redeploy
      so nothing is served from a stale build).
