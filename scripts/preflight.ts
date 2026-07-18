/**
 * First Boot preflight — validates every external service before `pnpm dev`.
 * Run: pnpm preflight
 * Each check prints PASS / FAIL / SKIP with a fix hint. Exits 1 on any FAIL.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "..", ".env") });

type Result = { name: string; status: "PASS" | "FAIL" | "SKIP"; detail: string };

/** Every network check gets a hard deadline — a hung check is a failed check. */
function withTimeout<T>(p: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms / 1000}s (service unreachable?)`)), ms)),
  ]);
}
const results: Result[] = [];
const add = (name: string, status: Result["status"], detail: string) =>
  results.push({ name, status, detail });

async function checkDatabase() {
  if (!process.env.DATABASE_URL) return add("Postgres (Neon)", "FAIL", "DATABASE_URL missing in .env");
  try {
    const { db } = await import("@platform/db");
    const rows = await withTimeout(db().execute("SELECT count(*)::int AS n FROM automations"));
    const n = (rows as unknown as { rows: { n: number }[] }).rows?.[0]?.n ?? (rows as any)[0]?.n;
    if (n === undefined) return add("Postgres (Neon)", "PASS", "connected (couldn't read catalog count)");
    if (n === 0) return add("Catalog seed", "FAIL", "0 automations — run: pnpm --filter @platform/catalog seed");
    add("Postgres (Neon)", "PASS", `connected, catalog has ${n} automation(s)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(msg)) {
      add("Postgres (Neon)", "FAIL", "connected but not migrated — run: pnpm --filter @platform/db db:migrate");
    } else {
      add("Postgres (Neon)", "FAIL", `cannot connect: ${msg.slice(0, 120)}`);
    }
  }
}

async function checkRedis() {
  if (!process.env.REDIS_URL) return add("Redis (Upstash)", "FAIL", "REDIS_URL missing in .env");
  try {
    const { redis } = await import("@platform/core");
    const r = redis();
    const pong = await withTimeout(r.ping());
    r.disconnect();
    add("Redis (Upstash)", pong === "PONG" ? "PASS" : "FAIL", `ping → ${pong}`);
  } catch (err) {
    add("Redis (Upstash)", "FAIL", `cannot connect: ${(err as Error).message.slice(0, 120)}`);
  }
}

async function checkAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return add("Anthropic", "FAIL", "ANTHROPIC_API_KEY missing in .env");
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    const res = await withTimeout(client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8,
      messages: [{ role: "user", content: "Say OK" }],
    }), 20000);
    const text = res.content.find((b) => b.type === "text");
    add("Anthropic", "PASS", `live call ok (${res.usage.input_tokens} tokens in) → "${text && "text" in text ? text.text.slice(0, 20) : "?"}"`);
  } catch (err) {
    add("Anthropic", "FAIL", `API call failed: ${(err as Error).message.slice(0, 120)}`);
  }
}

function checkClerk() {
  const pub = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const sec = process.env.CLERK_SECRET_KEY;
  if (!pub || !sec) return add("Clerk", "FAIL", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY missing");
  if (!pub.startsWith("pk_") || !sec.startsWith("sk_")) {
    return add("Clerk", "FAIL", "keys look malformed (expect pk_… / sk_…)");
  }
  add("Clerk", "PASS", `keys present (${pub.startsWith("pk_test") ? "test" : "live"} mode)`);
}

async function checkNango() {
  if (!process.env.NANGO_SECRET_KEY) {
    return add("Nango (Gmail)", "SKIP", "NANGO_SECRET_KEY unset — email channel disabled, web chat unaffected");
  }
  try {
    const res = await withTimeout(fetch("https://api.nango.dev/config", {
      headers: { Authorization: `Bearer ${process.env.NANGO_SECRET_KEY}` },
    }));
    if (!res.ok) return add("Nango (Gmail)", "FAIL", `auth failed: ${res.status}`);
    const data = (await res.json()) as { configs?: { unique_key: string }[] };
    const hasGmail = data.configs?.some((c) => c.unique_key === "google-mail");
    add(
      "Nango (Gmail)",
      hasGmail ? "PASS" : "FAIL",
      hasGmail
        ? "authenticated, google-mail integration configured"
        : "authenticated but no 'google-mail' integration — add it in the Nango dashboard",
    );
  } catch (err) {
    add("Nango (Gmail)", "FAIL", (err as Error).message.slice(0, 120));
  }
}

function checkOptional() {
  add("Sentry", process.env.SENTRY_DSN ? "PASS" : "SKIP", process.env.SENTRY_DSN ? "DSN set" : "unset — errors go to console only");
  add("Voyage (embeddings)", process.env.VOYAGE_API_KEY ? "PASS" : "SKIP", process.env.VOYAGE_API_KEY ? "set" : "unset — knowledge retrieval uses recency fallback");
  add("Founder emails", process.env.FOUNDER_EMAILS ? "PASS" : "SKIP", process.env.FOUNDER_EMAILS ?? "unset — /internal will be inaccessible");
}

const ICONS = { PASS: "✅", FAIL: "❌", SKIP: "⏭️ " };

(async () => {
  console.log("\nFirst Boot preflight\n────────────────────");
  await checkDatabase();
  await checkRedis();
  await checkAnthropic();
  checkClerk();
  await checkNango();
  checkOptional();
  for (const r of results) {
    console.log(`${ICONS[r.status]} ${r.name.padEnd(22)} ${r.detail}`);
  }
  const fails = results.filter((r) => r.status === "FAIL");
  console.log(
    fails.length === 0
      ? "\nAll required services ready. Run: pnpm dev\n"
      : `\n${fails.length} check(s) failing — fix the ❌ lines above, then re-run: pnpm preflight\n`,
  );
  process.exit(fails.length === 0 ? 0 : 1);
})();
