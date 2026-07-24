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
