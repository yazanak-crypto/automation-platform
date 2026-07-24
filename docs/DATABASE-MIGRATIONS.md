# Database migrations — the golden rule

**After ANY schema change, apply the migration before running or deploying the app.**
The code (Drizzle schema in `packages/db/src/schema.ts`) and the database must never
drift apart. If the schema adds a column but the DB doesn't have it, every `SELECT`
on that table fails with `column "…" does not exist` (Postgres `42703`) — which
crashes the whole authenticated app, since the first query on load is a workspace
lookup. (This is exactly what took the dashboard down after the `notification_settings`
column was added without migrating.)

## The two-step loop for every schema change
```bash
# 1. You edited packages/db/src/schema.ts — generate the migration SQL:
pnpm --filter @platform/db db:generate

# 2. Apply it to the target database (reads DATABASE_URL from platform/.env):
pnpm --filter @platform/db db:migrate
```
Commit the generated file in `packages/db/migrations/` alongside the schema change —
they always land together.

## On deploy (production)
Run migrations as a release step **before** the new app/worker starts serving:
```bash
pnpm --filter @platform/db db:migrate
```
Migrations are additive and idempotent (already-applied ones are skipped), so this is
safe to run on every deploy. CI already migrates the throwaway test DB before tests
(`.github/workflows/ci.yml`); production needs the same step in your deploy pipeline.

## Quick check when "a column doesn't exist" error appears
1. `git log --oneline -- packages/db/migrations` — is there a migration the DB hasn't seen?
2. `pnpm --filter @platform/db db:migrate` — apply pending ones.
3. Re-load the app.
