import { describe, expect, it } from "vitest";
import { renderAnswerFacts } from "../src/verticals/facts";

// These strings are stringified straight into the drafting prompt, so they are
// effectively prompt text. The tests guard meaning, not formatting.

describe("renderAnswerFacts", () => {
  it("renders each input type as an unambiguous sentence", () => {
    const { facts } = renderAnswerFacts({
      vertical: "retail",
      values: {
        what_you_do: "We sell handmade rugs",
        hours: {
          mon: { closed: false, open: "09:00", close: "18:00" },
          tue: { closed: false, open: "09:00", close: "18:00" },
          wed: { closed: false, open: "09:00", close: "18:00" },
          thu: { closed: false, open: "09:00", close: "18:00" },
          fri: { closed: false, open: "09:00", close: "18:00" },
          sat: { closed: false, open: "10:00", close: "14:00" },
          sun: { closed: true },
        },
        payment_methods: ["Cash", "Whish"],
        accepts_returns: true,
        delivery_fee: { from: 3, to: 8, currency: "USD" },
        delivery_areas: ["Beirut", "Mount Lebanon"],
      },
    });
    const joined = facts.join("\n");
    expect(joined).toContain("What the business does: We sell handmade rugs");
    expect(joined).toContain("Sunday: closed");
    expect(joined).toContain("Saturday: 10:00–14:00");
    expect(joined).toContain("Accepted payment methods: Cash, Whish");
    expect(joined).toContain("3–8 USD");
    expect(joined).toMatch(/Do you accept returns: yes/);
  });

  it("states a varying price as a refusal to quote, not a missing number", () => {
    // The model must not fill in a plausible figure of its own.
    const { facts } = renderAnswerFacts({
      vertical: "services",
      values: { typical_price: { varies: true } },
    });
    expect(facts.join()).toContain("do not quote a specific price");
    expect(facts.join()).not.toMatch(/\d/);
  });

  it("turns never_do into hard rules, never into quotable facts", () => {
    const { facts, rules } = renderAnswerFacts({
      vertical: "retail",
      values: {
        never_do: { selected: ["Give discounts", "Quote prices"], text: "Never promise same-day delivery" },
      },
    });
    expect(rules).toContain("Never give discounts");
    expect(rules).toContain("Never quote prices");
    expect(rules).toContain("Never promise same-day delivery");
    expect(facts.join()).not.toContain("discount");
  });

  it("EXCLUDES answers the AI guessed and the owner hasn't corrected", () => {
    // The pack's rule is that only confirmed information enters it. Grounding a
    // customer-facing reply on our own guess would launder an inference into a
    // stated fact.
    const values = { what_you_do: "We sell rugs", hours: { mon: { closed: false, open: "09:00", close: "17:00" } } };
    const all = renderAnswerFacts({ vertical: "retail", values });
    expect(all.facts.length).toBe(2);

    const withGuess = renderAnswerFacts({ vertical: "retail", values, guessed: ["hours"] });
    expect(withGuess.facts.length).toBe(1);
    expect(withGuess.facts.join()).toContain("We sell rugs");
    expect(withGuess.facts.join()).not.toContain("09:00");
  });

  it("excludes a guessed never_do from the rules as well", () => {
    const values = { never_do: { selected: ["Give discounts"] } };
    expect(renderAnswerFacts({ vertical: "retail", values }).rules).toHaveLength(1);
    expect(
      renderAnswerFacts({ vertical: "retail", values, guessed: ["never_do"] }).rules,
    ).toHaveLength(0);
  });

  it("skips unanswered and empty values instead of emitting blank facts", () => {
    const { facts } = renderAnswerFacts({
      vertical: "retail",
      values: {
        what_you_do: "",
        delivery_areas: [],
        delivery_fee: {},
        free_delivery_over: "   ",
      },
    });
    expect(facts).toEqual([]);
  });

  it("renders a boolean false as 'no' rather than dropping the answer", () => {
    // "We don't accept returns" is information the AI needs, not an absence.
    const { facts } = renderAnswerFacts({
      vertical: "retail",
      values: { accepts_returns: false },
    });
    expect(facts.join()).toMatch(/: no$/);
  });

  it("ignores answers that belong to a different vertical's question set", () => {
    const { facts } = renderAnswerFacts({
      vertical: "retail",
      values: { commission: "2.5% of the sale price" },
    });
    expect(facts.join()).not.toContain("2.5%");
  });

  it("returns empty structures for an empty profile", () => {
    expect(renderAnswerFacts({})).toEqual({ facts: [], rules: [] });
  });
});
