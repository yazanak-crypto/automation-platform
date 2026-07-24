# Platform

Premium AI automation platform. Architecture and product decisions live in the
Obsidian vault (`knowledege/AI Platform HQ/06 - Decisions`) — start with
Decision 002 (roadmap), 003/005 (architecture), 009 (this repo's structure),
010 (M1 acceptance criteria).

## Structure

- `apps/web` — Next.js: marketing, marketplace, activation, dashboard, `/internal` founder admin
- `apps/worker` — BullMQ workers + ExecutionAdapter host
- `packages/db` — Drizzle schema + migrations (source of truth: our ledger, never the engine). **After any schema change, run `pnpm --filter @platform/db db:migrate` — see [docs/DATABASE-MIGRATIONS.md](docs/DATABASE-MIGRATIONS.md).**
- `packages/ai` — AI gateway: **every** LLM call goes through `callAi` and is cost-logged
- `packages/brain` — Business Profile primitive
- `packages/channels` — ChannelAdapter interface + adapters
- `packages/execution` — ExecutionAdapter; the only package that may know the engine
- `packages/schemas`, `packages/core`, `packages/ui`
- `automations/` — catalog-as-code
- `widget/` — embeddable website-chat widget
- `infra/` — docker-compose for local Postgres(pgvector)/Redis/Activepieces

## Local dev

```sh
pnpm install
docker compose -f infra/docker-compose.yml up -d
cp .env.example .env   # fill Clerk + Anthropic keys
pnpm dev
```

## Rules (lint-enforced as the code grows)

1. No LLM call outside `@platform/ai`.
2. No engine (Activepieces) types outside `@platform/execution`.
3. No provider tokens in our DB or logs — Nango only.
4. The `runs` ledger is the source of truth; the engine's logs are debugging aids.
