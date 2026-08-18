import { describe, expect, it } from "vitest";
import { validatePrefill } from "../src/prefill";

// The validator is the only thing standing between a confident model and a
// fabricated fact the AI will repeat to customers. These tests are adversarial
// on purpose: they assume the model is plausible, fluent and wrong.

const PAGE = `
Rugs of Beirut. We sell handmade wool rugs, woven in Lebanon.
We are open Monday to Friday from 9am to 6pm.
Delivery is available across Beirut and Mount Lebanon for a flat fee of 5 USD.
We accept cash and bank transfer.
`;

describe("validatePrefill — rule 1: evidence required and real", () => {
  it("keeps a value whose source sentence appears on the site", () => {
    const r = validatePrefill(
      "retail",
      [
        {
          questionId: "what_you_do",
          value: "We sell handmade wool rugs, woven in Lebanon",
          evidence: "We sell handmade wool rugs, woven in Lebanon.",
        },
      ],
      PAGE,
    );
    expect(r.values.what_you_do).toBe("We sell handmade wool rugs, woven in Lebanon");
    expect(r.guessed).toEqual(["what_you_do"]);
    expect(r.rejected).toHaveLength(0);
  });

  it("drops a value with no source sentence at all", () => {
    const r = validatePrefill(
      "retail",
      [{ questionId: "what_you_do", value: "We sell rugs" }],
      PAGE,
    );
    expect(r.values).toEqual({});
    expect(r.rejected[0]!.reason).toMatch(/no source sentence/);
  });

  it("drops a value whose evidence is NOT on the site — the fabrication case", () => {
    // The most dangerous failure: fluent, specific, entirely invented.
    const r = validatePrefill(
      "retail",
      [
        {
          questionId: "return_window",
          value: "30 days",
          evidence: "We offer a generous 30 day return policy on all items.",
        },
      ],
      PAGE,
    );
    expect(r.values).toEqual({});
    expect(r.rejected[0]!.reason).toMatch(/not found on the site/);
  });

  it("rejects trivially short evidence that would match almost anything", () => {
    const r = validatePrefill(
      "retail",
      [{ questionId: "what_you_do", value: "Rugs", evidence: "rugs" }],
      PAGE,
    );
    expect(r.values).toEqual({});
  });

  it("tolerates whitespace and smart-quote differences in the quote", () => {
    const r = validatePrefill(
      "retail",
      [
        {
          questionId: "what_you_do",
          value: "Handmade rugs",
          evidence: "  We sell   handmade wool rugs,\n woven in Lebanon.  ",
        },
      ],
      PAGE,
    );
    expect(r.values.what_you_do).toBe("Handmade rugs");
  });
});

describe("validatePrefill — rule 2: never infer booleans from absence", () => {
  it("drops a switch whose value is not an explicit boolean", () => {
    for (const bad of ["yes", "true", 1, null, undefined]) {
      const r = validatePrefill(
        "retail",
        [
          {
            questionId: "accepts_returns",
            value: bad,
            evidence: "We accept cash and bank transfer.",
          },
        ],
        PAGE,
      );
      expect(r.values.accepts_returns, `accepted ${JSON.stringify(bad)}`).toBeUndefined();
    }
  });

  it("keeps false ONLY when a real sentence supports it", () => {
    const page = `${PAGE}\nWe do not accept returns under any circumstances.`;
    const r = validatePrefill(
      "retail",
      [
        {
          questionId: "accepts_returns",
          value: false,
          evidence: "We do not accept returns under any circumstances.",
        },
      ],
      page,
    );
    expect(r.values.accepts_returns).toBe(false);
  });

  it("does not let a site's silence become a 'no'", () => {
    // PAGE says nothing about returns. A model claiming false with borrowed
    // evidence from an unrelated line must not get through — the sentence is
    // real, so this is caught by shape, not by the evidence check.
    const r = validatePrefill(
      "retail",
      [
        {
          questionId: "accepts_returns",
          value: "not mentioned",
          evidence: "We accept cash and bank transfer.",
        },
      ],
      PAGE,
    );
    expect(r.values.accepts_returns).toBeUndefined();
  });
});

describe("validatePrefill — rule 3: partial beats confident", () => {
  it("keeps the days the site states and leaves the rest unset", () => {
    const r = validatePrefill(
      "retail",
      [
        {
          questionId: "hours",
          value: {
            mon: { closed: false, open: "09:00", close: "18:00" },
            tue: { closed: false, open: "09:00", close: "18:00" },
            wed: { closed: false, open: "09:00", close: "18:00" },
            thu: { closed: false, open: "09:00", close: "18:00" },
            fri: { closed: false, open: "09:00", close: "18:00" },
          },
          evidence: "We are open Monday to Friday from 9am to 6pm.",
        },
      ],
      PAGE,
    );
    const hours = r.values.hours as Record<string, unknown>;
    expect(Object.keys(hours).sort()).toEqual(["fri", "mon", "thu", "tue", "wed"]);
    // Saturday and Sunday are absent, NOT assumed closed.
    expect(hours.sat).toBeUndefined();
    expect(hours.sun).toBeUndefined();
  });

  it("drops days with unusable times rather than inventing them", () => {
    const r = validatePrefill(
      "retail",
      [
        {
          questionId: "hours",
          value: {
            mon: { closed: false, open: "9am", close: "6pm" },
            tue: { closed: false, open: "09:00", close: "18:00" },
          },
          evidence: "We are open Monday to Friday from 9am to 6pm.",
        },
      ],
      PAGE,
    );
    const hours = r.values.hours as Record<string, unknown>;
    expect(hours.mon).toBeUndefined();
    expect(hours.tue).toBeDefined();
  });

  it("returns nothing when no day survives", () => {
    const r = validatePrefill(
      "retail",
      [
        {
          questionId: "hours",
          value: { mon: { closed: false, open: "morning" } },
          evidence: "We are open Monday to Friday from 9am to 6pm.",
        },
      ],
      PAGE,
    );
    expect(r.values.hours).toBeUndefined();
  });
});

describe("validatePrefill — shape enforcement", () => {
  const ev = { evidence: "Delivery is available across Beirut and Mount Lebanon for a flat fee of 5 USD." };

  it("rejects a single_select option we never offered", () => {
    const r = validatePrefill(
      "retail",
      [{ questionId: "delivery_time", value: "Within the hour", ...ev }],
      PAGE,
    );
    expect(r.values.delivery_time).toBeUndefined();
    expect(r.rejected[0]!.reason).toMatch(/did not fit/);
  });

  it("accepts a valid single_select option", () => {
    const r = validatePrefill(
      "retail",
      [{ questionId: "delivery_time", value: "1–2 days", ...ev }],
      PAGE,
    );
    expect(r.values.delivery_time).toBe("1–2 days");
  });

  it("keeps custom chips, since owners have their own areas", () => {
    const r = validatePrefill(
      "retail",
      [{ questionId: "delivery_areas", value: ["Beirut", "Mount Lebanon"], ...ev }],
      PAGE,
    );
    expect(r.values.delivery_areas).toEqual(["Beirut", "Mount Lebanon"]);
  });

  it("rejects a price range with no usable numbers", () => {
    const r = validatePrefill(
      "retail",
      [{ questionId: "delivery_fee", value: { currency: "USD" }, ...ev }],
      PAGE,
    );
    expect(r.values.delivery_fee).toBeUndefined();
  });

  it("keeps a price range with a real figure", () => {
    const r = validatePrefill(
      "retail",
      [{ questionId: "delivery_fee", value: { from: 5, currency: "USD" }, ...ev }],
      PAGE,
    );
    expect(r.values.delivery_fee).toEqual({ from: 5, currency: "USD" });
  });

  it("ignores questions that belong to another vertical", () => {
    const r = validatePrefill(
      "retail",
      [{ questionId: "commission", value: "2.5%", ...ev }],
      PAGE,
    );
    expect(r.values.commission).toBeUndefined();
    expect(r.rejected[0]!.reason).toMatch(/not a question in this vertical/);
  });

  it("takes the first of duplicate answers and reports the rest", () => {
    const r = validatePrefill(
      "retail",
      [
        { questionId: "what_you_do", value: "First", evidence: "We sell handmade wool rugs, woven in Lebanon." },
        { questionId: "what_you_do", value: "Second", evidence: "We sell handmade wool rugs, woven in Lebanon." },
      ],
      PAGE,
    );
    expect(r.values.what_you_do).toBe("First");
    expect(r.rejected[0]!.reason).toBe("duplicate");
  });
});

describe("validatePrefill — output contract", () => {
  it("marks everything it keeps as guessed, so nothing grounds unconfirmed", () => {
    const r = validatePrefill(
      "retail",
      [
        { questionId: "what_you_do", value: "Rugs shop", evidence: "We sell handmade wool rugs, woven in Lebanon." },
        { questionId: "payment_methods", value: ["Cash"], evidence: "We accept cash and bank transfer." },
      ],
      PAGE,
    );
    expect(r.guessed.sort()).toEqual(Object.keys(r.values).sort());
    expect(r.guessed).toHaveLength(2);
  });

  it("returns empty structures for an empty proposal", () => {
    expect(validatePrefill("retail", [], PAGE)).toEqual({
      values: {},
      guessed: [],
      rejected: [],
    });
  });
});

// A second fixture from a different region. The Lebanese one above is a valid
// case and stays; this proves the pipeline is not quietly shaped around it —
// free-entry areas, a non-USD currency, and local insurers all have to survive.
const GULF_PAGE = `
Al Noor Medical Centre, Dubai Marina.
We are open Saturday to Thursday, 8am to 8pm. Friday closed.
Consultations start from 250 AED.
We accept Daman, Thiqa and ADNIC insurance.
We serve patients across Dubai Marina, JLT and Al Barsha.
`;

describe("validatePrefill — a Gulf business, not just a Levantine one", () => {
  it("keeps free-entry areas the option list never contained", () => {
    const r = validatePrefill(
      "clinic",
      [
        {
          questionId: "services",
          value: ["General consultation"],
          evidence: "Al Noor Medical Centre, Dubai Marina.",
        },
      ],
      GULF_PAGE,
    );
    expect(r.values.services).toEqual(["General consultation"]);
  });

  it("accepts insurers that are not on any list we ship", () => {
    const r = validatePrefill(
      "clinic",
      [
        {
          questionId: "insurers",
          value: ["Daman", "Thiqa", "ADNIC"],
          evidence: "We accept Daman, Thiqa and ADNIC insurance.",
        },
      ],
      GULF_PAGE,
    );
    expect(r.values.insurers).toEqual(["Daman", "Thiqa", "ADNIC"]);
  });

  it("accepts a non-USD currency", () => {
    // AED was literally unenterable before the currency list was removed.
    const r = validatePrefill(
      "clinic",
      [
        {
          questionId: "consultation_fee",
          value: { from: 250, currency: "AED" },
          evidence: "Consultations start from 250 AED.",
        },
      ],
      GULF_PAGE,
    );
    expect(r.values.consultation_fee).toEqual({ from: 250, currency: "AED" });
  });

  it("handles a Saturday-to-Thursday week without assuming a Mon-Fri shape", () => {
    const r = validatePrefill(
      "clinic",
      [
        {
          questionId: "hours",
          value: {
            sat: { closed: false, open: "08:00", close: "20:00" },
            sun: { closed: false, open: "08:00", close: "20:00" },
            mon: { closed: false, open: "08:00", close: "20:00" },
            fri: { closed: true },
          },
          evidence: "We are open Saturday to Thursday, 8am to 8pm.",
        },
      ],
      GULF_PAGE,
    );
    const hours = r.values.hours as Record<string, { closed: boolean }>;
    expect(hours.sat.closed).toBe(false);
    expect(hours.fri.closed).toBe(true);
    // Tuesday/Wednesday were not stated in this payload, so they stay unset.
    expect(hours.tue).toBeUndefined();
  });
});
