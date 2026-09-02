import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isEntitlingPaddleStatus,
  paddleErrorInfo,
  paddleConfigured,
  paddlePriceForPlan,
  paddleSetupPriceForPlan,
  paymentProvider,
  planForPaddlePrice,
} from "./paddle";

// Price↔plan mapping decides what a customer is charged and what they get.
// A silent null here sells the wrong plan or grants nothing.

afterEach(() => vi.unstubAllEnvs());

function withPaddleEnv() {
  vi.stubEnv("PADDLE_API_KEY", "pdl_test_key");
  vi.stubEnv("PADDLE_WEBHOOK_SECRET", "pdl_ntfset_secret");
  vi.stubEnv("PADDLE_PRICE_ENTRY", "pri_entry_recurring");
  // Entry is the ONLY plan with a setup price — the other three are
  // month-to-month with no upfront charge, so they have no *_SETUP var to stub.
  vi.stubEnv("PADDLE_PRICE_ENTRY_SETUP", "pri_entry_setup");
  vi.stubEnv("PADDLE_PRICE_STARTER", "pri_starter_recurring");
  vi.stubEnv("PADDLE_PRICE_GROWTH", "pri_growth_recurring");
  vi.stubEnv("PADDLE_PRICE_PRO", "pri_pro_recurring");
}

describe("plan ↔ price mapping", () => {
  it("maps every payable plan to its recurring price", () => {
    withPaddleEnv();
    expect(paddlePriceForPlan("entry")).toBe("pri_entry_recurring");
    expect(paddlePriceForPlan("starter")).toBe("pri_starter_recurring");
    expect(paddlePriceForPlan("growth")).toBe("pri_growth_recurring");
    expect(paddlePriceForPlan("pro")).toBe("pri_pro_recurring");
  });

  it("has a setup price for Entry and for nothing else", () => {
    // Pinned because the pricing copy, amountDueFor() and paddle-verify's
    // trial-period rule all branch on setupFeeUsd > 0. A second plan growing a
    // setup price has to be a deliberate change in all four places.
    withPaddleEnv();
    expect(paddleSetupPriceForPlan("entry")).toBe("pri_entry_setup");
    expect(paddleSetupPriceForPlan("starter")).toBeNull();
    expect(paddleSetupPriceForPlan("growth")).toBeNull();
    expect(paddleSetupPriceForPlan("pro")).toBeNull();
  });

  it("never sells the trial", () => {
    withPaddleEnv();
    expect(paddlePriceForPlan("trial")).toBeNull();
    expect(paddleSetupPriceForPlan("trial")).toBeNull();
  });

  it("reverses a recurring price back to its plan", () => {
    withPaddleEnv();
    expect(planForPaddlePrice("pri_entry_recurring")).toBe("entry");
    expect(planForPaddlePrice("pri_starter_recurring")).toBe("starter");
    expect(planForPaddlePrice("pri_growth_recurring")).toBe("growth");
    expect(planForPaddlePrice("pri_pro_recurring")).toBe("pro");
  });

  it("does not resolve a SETUP price to a plan", () => {
    // The webhook reads the subscription's recurring item. If a setup price
    // resolved too, a one-off charge could be mistaken for a subscription.
    withPaddleEnv();
    expect(planForPaddlePrice("pri_entry_setup")).toBeNull();
  });

  it("returns null for an unknown or empty price rather than guessing", () => {
    withPaddleEnv();
    expect(planForPaddlePrice("pri_something_else")).toBeNull();
    expect(planForPaddlePrice("")).toBeNull();
  });

  it("does not match when the env var is unset — empty must not equal empty", () => {
    // With no price configured, an event carrying an empty price id must not
    // resolve to a plan by both sides being falsy.
    vi.stubEnv("PADDLE_PRICE_STARTER", "");
    expect(planForPaddlePrice("")).toBeNull();
  });
});

describe("status mapping", () => {
  it("entitles active and trialing", () => {
    // trialing is a PAYING customer: they paid the setup fee, and the recurring
    // price is mid-trial for its first 30 days.
    expect(isEntitlingPaddleStatus("active")).toBe(true);
    expect(isEntitlingPaddleStatus("trialing")).toBe(true);
  });

  it("does not entitle anything else", () => {
    for (const s of ["canceled", "past_due", "paused", "", "ACTIVE"]) {
      expect(isEntitlingPaddleStatus(s), s).toBe(false);
    }
  });
});

describe("provider selection", () => {
  it("needs both the API key and the webhook secret", () => {
    vi.stubEnv("PADDLE_API_KEY", "k");
    vi.stubEnv("PADDLE_WEBHOOK_SECRET", "");
    expect(paddleConfigured()).toBe(false);
    vi.stubEnv("PADDLE_WEBHOOK_SECRET", "s");
    expect(paddleConfigured()).toBe(true);
  });

  it("prefers Paddle when both providers are configured", () => {
    withPaddleEnv();
    vi.stubEnv("BILLING_ENABLED", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    expect(paymentProvider()).toBe("paddle");
  });

  it("falls back to Stripe only when it is explicitly enabled", () => {
    vi.stubEnv("PADDLE_API_KEY", "");
    vi.stubEnv("PADDLE_WEBHOOK_SECRET", "");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("BILLING_ENABLED", "");
    expect(paymentProvider()).toBeNull();
    vi.stubEnv("BILLING_ENABLED", "true");
    expect(paymentProvider()).toBe("stripe");
  });

  it("is null with nothing configured, so the manual path stays the route", () => {
    vi.stubEnv("PADDLE_API_KEY", "");
    vi.stubEnv("PADDLE_WEBHOOK_SECRET", "");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("BILLING_ENABLED", "");
    expect(paymentProvider()).toBeNull();
  });
});

describe("paddleErrorInfo", () => {
  it("extracts the code and detail from a real Paddle SDK error", () => {
    // Verbatim from the sandbox failure that 500'd the checkout: no default
    // payment link set on the account. The code is the whole diagnosis, so this
    // pins the exact shape we depend on.
    const err = Object.assign(new Error("no default payment link"), {
      type: "request_error",
      code: "transaction_default_checkout_url_not_set",
      detail:
        "Cannot create a transaction or open a checkout as no default payment link has been set for this account. Set in the Paddle dashboard, then try again.",
      documentationUrl:
        "https://developer.paddle.com/v1/errors/transactions/transaction_default_checkout_url_not_set",
      errors: null,
      retryAfter: null,
    });
    expect(paddleErrorInfo(err)).toEqual({
      code: "transaction_default_checkout_url_not_set",
      detail: err.detail,
    });
  });

  it("returns null for anything that is not a coded Paddle error", () => {
    // The caller falls back to String(err) and a generic code, so a null here
    // must never be mistaken for a successful extraction.
    expect(paddleErrorInfo(new Error("socket hang up"))).toBeNull();
    expect(paddleErrorInfo(null)).toBeNull();
    expect(paddleErrorInfo(undefined)).toBeNull();
    expect(paddleErrorInfo("boom")).toBeNull();
    expect(paddleErrorInfo({ code: 500 })).toBeNull();
    expect(paddleErrorInfo({ code: "" })).toBeNull();
  });

  it("tolerates a missing detail", () => {
    expect(paddleErrorInfo({ code: "forbidden" })).toEqual({ code: "forbidden", detail: "" });
  });
});
