/**
 * Pre-flight check for the Paddle integration. Read-only — reads prices and
 * webhook destinations and asserts they match what we ship. Changes nothing.
 *
 * Run: pnpm paddle:verify
 *
 * Covers the two failure modes that cost real money and produce no runtime
 * signal, both of which have already bitten us:
 *
 *   1. A recurring price with no 30-day trial → the customer is charged setup +
 *      monthly on day one instead of on day 31.
 *   2. PADDLE_WEBHOOK_SECRET not matching the live destination → the customer
 *      pays, Paddle reports the delivery as sent, and entitlement never lands.
 *
 * Both live in the Paddle dashboard rather than in this repo, so they are
 * checked against the live API and against PLANS, which is what the pricing
 * page promises.
 *
 * Why the trial check exists: the offer is ONE checkout with TWO items — a one-time setup
 * fee charged today, plus a monthly subscription whose first charge must land on
 * day 31. The 30-day delay lives on the RECURRING PRICE in the Paddle dashboard,
 * not in our code. If it is missing, Paddle charges setup + monthly immediately:
 * $898 on Starter, $1,398 on Premium. Nothing in the codebase can detect that at
 * runtime, and the customer finds out before we do.
 *
 * So the invariants are checked against the live Paddle API, where they actually
 * live, and against PLANS, which is what the pricing page promises.
 */
import { createHash } from "node:crypto";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "..", ".env") });

import { PLANS, type PlanId } from "@platform/core";
import { Environment, Paddle } from "@paddle/paddle-node-sdk";

const TRIAL_DAYS = 30;

interface Check {
  label: string;
  envVar: string;
  priceId: string | undefined;
  plan: PlanId;
  kind: "setup" | "recurring";
  expectedUsd: number;
}

let failures = 0;
const fail = (m: string) => {
  failures++;
  console.log(`  ✗ ${m}`);
};
const pass = (m: string) => console.log(`  ✓ ${m}`);

/**
 * Compare PADDLE_WEBHOOK_SECRET against every active webhook destination.
 *
 * This exists because it already went wrong: the env var held the notification
 * setting's ID (`ntfset_…`) rather than its signing key (`pdl_ntfset_…`). The
 * two are adjacent in the dashboard and share a prefix. Result: a successful
 * sandbox checkout, a receipt from Paddle, 26 webhook deliveries all rejected
 * with 400, and no plan change — with nothing anywhere saying why.
 *
 * Secrets are never printed; only lengths and a truncated hash.
 */
async function checkWebhookSecret(isProd: boolean) {
  const ours = process.env.PADDLE_WEBHOOK_SECRET;
  if (!ours) {
    fail("PADDLE_WEBHOOK_SECRET is not set — every webhook 503s and entitlement never lands");
    return;
  }
  if (ours.startsWith("ntfset_")) {
    fail(
      `PADDLE_WEBHOOK_SECRET looks like a notification-setting ID, not its signing key ` +
        `(expected a "pdl_ntfset_…" value from the destination's "Secret key" field)`,
    );
  }

  const host = isProd ? "api.paddle.com" : "sandbox-api.paddle.com";
  let settings: { description?: string; destination?: string; active?: boolean; endpoint_secret_key?: string }[];
  try {
    const res = await fetch(`https://${host}/notification-settings`, {
      headers: { Authorization: `Bearer ${process.env.PADDLE_API_KEY}` },
    });
    if (!res.ok) {
      fail(`could not list webhook destinations (HTTP ${res.status})`);
      return;
    }
    settings = ((await res.json()) as { data?: typeof settings }).data ?? [];
  } catch (err) {
    fail(`could not list webhook destinations: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const active = settings.filter((s) => s.active);
  if (!active.length) {
    fail("no ACTIVE webhook destination configured — subscription events go nowhere");
    return;
  }

  const digest = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);
  const match = active.find((s) => s.endpoint_secret_key === ours);
  if (match) {
    pass(`webhook secret matches active destination "${match.description ?? match.destination}"`);
    return;
  }

  fail(
    `PADDLE_WEBHOOK_SECRET matches NO active destination — every delivery will 400. ` +
      `ours: len ${ours.length}, sha256 ${digest(ours)}`,
  );
  for (const s of active) {
    const k = s.endpoint_secret_key;
    console.log(
      `      destination "${s.description ?? s.destination}" → ` +
        (k ? `len ${k.length}, sha256 ${digest(k)}` : "secret not returned by the API"),
    );
  }
}

(async () => {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) {
    console.error("PADDLE_API_KEY is not set — nothing to verify.");
    process.exit(1);
  }

  const isProd = process.env.PADDLE_ENV === "production";
  const paddle = new Paddle(apiKey, {
    environment: isProd ? Environment.production : Environment.sandbox,
  });

  console.log(`\nPaddle environment: ${isProd ? "PRODUCTION ⚠️" : "sandbox"}`);
  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
  // A live token in a sandbox build (or the reverse) fails at overlay-open time
  // with an opaque error, so check the prefixes agree.
  if (!clientToken) {
    fail("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is not set — the overlay cannot open");
  } else if (isProd && clientToken.startsWith("test_")) {
    fail("PADDLE_ENV=production but the client token is a test_ token");
  } else if (!isProd && !clientToken.startsWith("test_")) {
    fail("sandbox environment but the client token is not a test_ token");
  } else {
    pass(`client token matches the environment (${clientToken.slice(0, 5)}…)`);
  }
  // The webhook secret is checked against the LIVE destination, not just for
  // presence. A wrong secret is the worst failure this integration has: the
  // customer pays, Paddle reports the delivery as sent, and every event is
  // rejected at the door — so entitlement silently never lands.
  await checkWebhookSecret(isProd);

  // Derived from PLANS rather than listed by hand: a plan added there without a
  // Paddle price is now a verification FAILURE ("not set") instead of a plan
  // this script silently never checked. A setup check is emitted only for plans
  // that actually charge one — today that is Entry alone.
  const PAYABLE = ["entry", "starter", "growth", "pro"] as const;
  const RECURRING_ENV: Record<(typeof PAYABLE)[number], string> = {
    entry: "PADDLE_PRICE_ENTRY",
    starter: "PADDLE_PRICE_STARTER",
    growth: "PADDLE_PRICE_GROWTH",
    pro: "PADDLE_PRICE_PRO",
  };
  const SETUP_ENV: Partial<Record<(typeof PAYABLE)[number], string>> = {
    entry: "PADDLE_PRICE_ENTRY_SETUP",
  };

  const checks: Check[] = PAYABLE.flatMap((plan): Check[] => {
    const p = PLANS[plan];
    const recurringEnv = RECURRING_ENV[plan];
    const rows: Check[] = [
      {
        label: `${p.name} monthly`,
        envVar: recurringEnv,
        priceId: process.env[recurringEnv],
        plan,
        kind: "recurring",
        expectedUsd: p.priceMonthlyUsd,
      },
    ];
    const setupEnv = SETUP_ENV[plan];
    if (p.setupFeeUsd > 0 && setupEnv) {
      rows.unshift({
        label: `${p.name} setup`,
        envVar: setupEnv,
        priceId: process.env[setupEnv],
        plan,
        kind: "setup",
        expectedUsd: p.setupFeeUsd,
      });
    }
    return rows;
  });

  const seen = new Map<string, string>();

  for (const c of checks) {
    console.log(`\n${c.label}  (${c.envVar})`);
    if (!c.priceId) {
      fail(`${c.envVar} is not set`);
      continue;
    }
    // A copy-paste slip that points two roles at one price is invisible in the
    // dashboard and produces a plausible-looking but wrong checkout.
    const dupe = seen.get(c.priceId);
    if (dupe) fail(`same price id as ${dupe} — each role needs its own price`);
    seen.set(c.priceId, c.envVar);

    let price;
    try {
      price = await paddle.prices.get(c.priceId);
    } catch (err) {
      fail(`could not fetch ${c.priceId}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    const amount = Number(price.unitPrice?.amount ?? NaN);
    const currency = price.unitPrice?.currencyCode;
    const expectedMinor = c.expectedUsd * 100; // Paddle amounts are minor units

    if (currency !== "USD") fail(`currency is ${currency}, expected USD`);
    else pass("currency USD");

    if (amount !== expectedMinor) {
      fail(`amount is ${amount / 100} USD, expected ${c.expectedUsd} (from PLANS.${c.plan})`);
    } else {
      pass(`amount $${c.expectedUsd}`);
    }

    if (price.status !== "active") fail(`status is "${price.status}", expected "active"`);

    const cycle = price.billingCycle;
    const trial = price.trialPeriod;

    if (c.kind === "setup") {
      if (cycle) {
        fail(`has a billing cycle (${cycle.frequency} ${cycle.interval}) — must be one-time`);
      } else {
        pass("one-time (no billing cycle)");
      }
      if (trial) fail("a one-time price should not have a trial period");
    } else {
      if (!cycle) {
        fail("has NO billing cycle — this must be a recurring price");
      } else if (cycle.interval !== "month" || cycle.frequency !== 1) {
        fail(`billing cycle is every ${cycle.frequency} ${cycle.interval}, expected 1 month`);
      } else {
        pass("recurring monthly");
      }

      // The one that costs real money if it is wrong — and the expectation now
      // DEPENDS ON THE PLAN, because only Entry bundles a setup fee.
      //
      //   setup fee > 0  → the setup price is month one, so the recurring price
      //                    MUST carry a 30-day trial or the customer is charged
      //                    twice on day one.
      //   setup fee == 0 → the monthly price is the whole offer and must bill
      //                    immediately. A stray trial here gives away a free
      //                    month, silently, on every signup.
      const setupFeeUsd = PLANS[c.plan].setupFeeUsd;
      if (setupFeeUsd > 0) {
        if (!trial) {
          fail(
            `NO TRIAL PERIOD — the customer would be charged $${c.expectedUsd} on top of the ` +
              `$${setupFeeUsd} setup fee today ($${c.expectedUsd + setupFeeUsd} total) instead ` +
              `of on day ${TRIAL_DAYS + 1}`,
          );
        } else if (trial.interval !== "day" || trial.frequency !== TRIAL_DAYS) {
          fail(
            `trial is ${trial.frequency} ${trial.interval}(s), expected ${TRIAL_DAYS} days — ` +
              `first monthly charge would land on the wrong date`,
          );
        } else {
          pass(`${TRIAL_DAYS}-day trial → first monthly charge on day ${TRIAL_DAYS + 1}`);
        }
      } else if (trial) {
        fail(
          `has a ${trial.frequency} ${trial.interval}(s) trial, but ${PLANS[c.plan].name} has no ` +
            `setup fee — the first month would be given away free`,
        );
      } else {
        pass("no trial → billed monthly from day one, as advertised");
      }
    }
  }

  console.log(
    failures === 0
      ? "\n✅ All four prices match the advertised offer. Safe to run a test checkout.\n"
      : `\n❌ ${failures} problem(s) above. Fix in the Paddle dashboard before testing checkout.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
