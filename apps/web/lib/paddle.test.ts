import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isEntitlingPaddleStatus,
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
  vi.stubEnv("PADDLE_PRICE_STARTER", "pri_starter_recurring");
  vi.stubEnv("PADDLE_PRICE_STARTER_SETUP", "pri_starter_setup");
  vi.stubEnv("PADDLE_PRICE_PRO", "pri_pro_recurring");
  vi.stubEnv("PADDLE_PRICE_PRO_SETUP", "pri_pro_setup");
}

describe("plan ↔ price mapping", () => {
  it("maps each plan to its recurring and setup price", () => {
    withPaddleEnv();
    expect(paddlePriceForPlan("starter")).toBe("pri_starter_recurring");
    expect(paddleSetupPriceForPlan("starter")).toBe("pri_starter_setup");
    expect(paddlePriceForPlan("pro")).toBe("pri_pro_recurring");
    expect(paddleSetupPriceForPlan("pro")).toBe("pri_pro_setup");
  });

  it("never sells the trial", () => {
    withPaddleEnv();
    expect(paddlePriceForPlan("trial")).toBeNull();
    expect(paddleSetupPriceForPlan("trial")).toBeNull();
  });

  it("reverses a recurring price back to its plan", () => {
    withPaddleEnv();
    expect(planForPaddlePrice("pri_starter_recurring")).toBe("starter");
    expect(planForPaddlePrice("pri_pro_recurring")).toBe("pro");
  });

  it("does not resolve a SETUP price to a plan", () => {
    // The webhook reads the subscription's recurring item. If a setup price
    // resolved too, a one-off charge could be mistaken for a subscription.
    withPaddleEnv();
    expect(planForPaddlePrice("pri_starter_setup")).toBeNull();
    expect(planForPaddlePrice("pri_pro_setup")).toBeNull();
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
