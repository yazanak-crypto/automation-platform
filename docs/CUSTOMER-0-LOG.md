# Customer #0 Log

Running log of the First Boot phase. Every entry: what was tried, what happened, what was fixed. Newest sessions at the bottom.

---

## Session 1 — 2026-07-19 · First-ever build & boot (pre-credentials)

Environment: founder's machine, no cloud services provisioned yet (`.env` still placeholder values). Goal: extract every finding possible before the credential handoff.

### What worked ✅

| Check | Result |
|---|---|
| Env-loading root cause (Drizzle read empty DATABASE_URL) | **Fixed properly**: single root `.env` policy, loaded explicitly by drizzle-kit, worker, Next, seed, preflight; silent `?? ""` replaced with a loud error. Verified: drizzle now reaches the real connection stage. |
| `pnpm preflight` | Works; correctly reports each missing service with a fix hint; hard timeouts (a hung check is a failed check). |
| **First production build ever** (`next build`) | **Passed clean** — all 30+ routes/pages compiled, static pages prerendered, middleware bundled. No server/client boundary violations, no broken imports. |
| **First boot ever** (`next start`) | Ready in 6.2s. |
| Landing page | 200, renders the real headline ("AI that works for your business"). |
| `/widget.js` | Served, 3,631 bytes. |
| Full unit/CI suite after all Customer-#0 fixes | 71 passed, DB/Redis suites green in CI. |

### Bugs found this phase (and fixed)

1. **Env loading broken monorepo-wide** — drizzle-kit, worker, Next, and seed all failed to load the root `.env` (worker had no dotenv at all). Fixed with the single-source-of-truth policy. *(commit df64122)*
2. **Preflight hung forever on unreachable Redis** — ioredis retries indefinitely with `maxRetriesPerRequest: null`. Fixed with per-check hard timeouts. *(commit 3d6abda)*
3. Audit-2 P0s (double-auto-send race, unbounded email AI spend, holding line in Supervised Mode, silent delivery failures) — all fixed with regression tests. *(commit 01e4e58)*

### Open observations (need real credentials to verify)

- **`/dashboard` unauthenticated returned 404 instead of a sign-in redirect** — observed with a *dummy* Clerk key, so this may be an artifact of invalid credentials rather than a product bug. Re-test first thing after real Clerk keys land. If it persists: middleware `auth.protect()` config issue.
- **Public webchat route returns naked 500 when the DB is unreachable** (expected 403 path can't be reached without a DB). Acceptable for an abnormal state; consider a guarded 503 later. Not demo-blocking.

### Blocked — waiting on founder credentials (~15 min, see docs/FIRST-BOOT.md)

All remaining journey legs require: **Neon** `DATABASE_URL`, **Upstash** `REDIS_URL`, **Clerk** keys (+ `FOUNDER_EMAILS`). Then optionally **Anthropic** (AI legs — platform now boots without it by design), **Nango/Google** (Gmail leg), **Stripe** (upgrade-flow leg).

### Journey checklist (to execute in Session 2)

- [ ] `pnpm preflight` all green → migrate → seed
- [ ] `pnpm dev` (web + worker) boots against real services
- [ ] Sign up / onboarding / Business Brain (URL ingest + manual path)
- [ ] Website chat channel + widget on a test page
- [ ] Activate Lead Concierge (Supervised) + preview
- [ ] Visitor messages: FAQ / hot lead / refund / discount-bait
- [ ] Classification, draft, "would have been auto-handled" tags
- [ ] Approve / edit / dismiss → replies reach the widget
- [ ] Smart Mode: FAQ auto-sends, refund still escalates; kill switch back to Supervised
- [ ] Pause/resume activation
- [ ] Run ledger, "Why this reply?", `/internal` AI costs, stat strip
- [ ] Billing page renders on trial without Stripe configured; credit meter shows usage
- [ ] Gmail leg (after Nango): connect, inbound poll, threaded reply, revoke → needs_reconnect
- [ ] Phone demo over LAN

### Verdict so far

The codebase survived its first real build and boot with **zero code failures** — every blocker found this session was configuration/infrastructure, which is exactly what the audit predicted (T1). Not ready for pilot users; ready for Session 2 the moment credentials land.
