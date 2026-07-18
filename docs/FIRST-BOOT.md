# First Boot — Customer #0 Runbook

Goal: run the entire product against real services, on this machine, then execute the full journey as Customer #0. Total founder time: ~30–40 minutes of account setup. Everything else is automated or done by Claude.

## Your part: create 4 accounts, paste 7 keys

Copy `.env.example` to `.env` in `platform/`, then fill as you go.

### 1. Neon (Postgres) — ~5 min · free
1. https://neon.tech → sign up → New project (name: `platform`, region: closest EU/US).
2. Copy the **connection string** (pooled) → `.env` `DATABASE_URL=`.

### 2. Upstash (Redis) — ~3 min · free
1. https://upstash.com → sign up → Create database (regional, closest region).
2. Copy the **ioredis URL** (starts `rediss://default:…`) → `.env` `REDIS_URL=`.

### 3. Clerk (auth) — ~5 min · free
1. https://clerk.com → sign up → Create application (name it; enable **Email** + **Google** sign-in).
2. From "API keys": `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…` and `CLERK_SECRET_KEY=sk_test_…` → `.env`.

### 4. Anthropic — ~3 min
1. https://console.anthropic.com → API keys → create key → `.env` `ANTHROPIC_API_KEY=`.
2. Set a **monthly spend limit** (e.g. $25) in console settings — belt and braces on top of our caps.

### 5. Also set in `.env`
- `FOUNDER_EMAILS=` your email (unlocks `/internal`).

### 6. Optional now, needed for the Gmail leg (~15 min)
1. https://nango.dev → sign up → add integration **google-mail**.
2. Google Cloud Console → create OAuth app → scopes `gmail.modify` → paste client id/secret into Nango (Nango's google-mail page documents this) → add `https://api.nango.dev/oauth/callback` as redirect URI. While unverified, add your own Gmail as a **test user**.
3. `.env`: `NANGO_SECRET_KEY=`, `NEXT_PUBLIC_NANGO_PUBLIC_KEY=`.
   *(Skip this section to start — web chat works without it; Gmail leg runs later.)*
- Sentry (optional now): https://sentry.io → new project (Node) → `SENTRY_DSN=`.

## Then run (Claude does this with you)

```sh
cd platform
pnpm preflight                          # validates every key/service with fix hints
pnpm --filter @platform/db db:migrate   # apply all 6 migrations
pnpm --filter @platform/catalog seed    # Lead Concierge into the catalog
pnpm preflight                          # should be all ✅
pnpm dev                                # web :3000 + worker
```

## The Customer #0 script (in order)

1. Sign up at http://localhost:3000 → onboarding with a real site URL → confirm brain → add a boundary ("Never offer discounts") + 2 FAQs.
2. Channels → set up Website chat → allowed site = wherever `test-site.html` is served → paste snippet into a local test page (`npx serve`).
3. Marketplace → Lead Concierge → Activate → Supervised → preview on a real question → Go live.
4. Visitor messages: an FAQ question, a lead ("what would a big order cost? need it by June"), a refund demand, a discount request. Verify: drafts + "would have been auto-handled" tag, escalation with reason, boundary hold.
5. Approve / edit / dismiss; verify widget receives replies; check "Why this reply?", run ledger, `/internal` costs, stat strip.
6. Switch to Smart Mode → repeat the FAQ question → verify instant auto-send + badge; refund still escalates. Switch back → verify drafting resumes (kill switch).
7. Pause activation → message → no AI. Resume → AI returns.
8. Gmail leg (once Nango is set): connect Gmail → email yourself from another account → verify poll → draft/auto path → threaded reply arrives. Revoke access in Google account → verify "needs reconnection" appears.
9. Phone demo: repeat 1–6 from a phone browser against your machine's LAN address (add it to Clerk's allowed origins + widget allowed sites).

Every bug found goes in `docs/CUSTOMER-0-LOG.md` (created during the run), gets fixed, and the affected leg re-runs.
