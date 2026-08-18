import { describe, expect, it } from "vitest";
import {
  CORE_QUESTIONS,
  VERTICALS,
  answeredCount,
  detectVertical,
  getQuestionSet,
  getVertical,
  isAnswered,
  isVisible,
  visibleQuestions,
  type AnswerValue,
} from "../src/verticals";

const CHIP_INPUTS = ["chips", "chips_plus_text", "single_select"];

describe("vertical registry integrity", () => {
  it("every vertical has a unique id and non-empty questions", () => {
    const ids = VERTICALS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const v of VERTICALS) {
      expect(v.questions.length, `${v.id} has no questions`).toBeGreaterThan(0);
      expect(v.label).toBeTruthy();
      expect(v.blurb).toBeTruthy();
    }
  });

  it("question ids are unique within each full set, core included", () => {
    // A collision would silently overwrite one answer with another's value.
    for (const v of VERTICALS) {
      const ids = getQuestionSet(v.id).map((q) => q.id);
      expect(new Set(ids).size, `${v.id} has duplicate question ids`).toBe(ids.length);
    }
  });

  it("choice inputs always ship options, and free-text inputs never do", () => {
    for (const v of VERTICALS) {
      for (const q of getQuestionSet(v.id)) {
        if (CHIP_INPUTS.includes(q.input)) {
          expect(q.options?.length, `${v.id}/${q.id} needs options`).toBeGreaterThan(0);
        }
        if (q.input === "short_text" || q.input === "long_text") {
          expect(q.options, `${v.id}/${q.id} should not have options`).toBeUndefined();
        }
      }
    }
  });

  it("every showIf points at a question that exists and is asked earlier", () => {
    // A forward or dangling reference means a question that can never appear.
    for (const v of VERTICALS) {
      const set = getQuestionSet(v.id);
      set.forEach((q, i) => {
        if (!q.showIf) return;
        const targetIndex = set.findIndex((x) => x.id === q.showIf!.question);
        expect(targetIndex, `${v.id}/${q.id} depends on missing question`).toBeGreaterThanOrEqual(0);
        expect(targetIndex, `${v.id}/${q.id} depends on a later question`).toBeLessThan(i);
      });
    }
  });

  it("keeps every set within the 12–13 question budget", () => {
    // The flow is sold as ~2 minutes. Silent growth is how that promise breaks.
    for (const v of VERTICALS) {
      const total = getQuestionSet(v.id).length;
      expect(total, `${v.id} has ${total} questions`).toBeLessThanOrEqual(17);
      expect(total, `${v.id} has only ${total} questions`).toBeGreaterThanOrEqual(10);
    }
  });

  it("asks the highest-value question in every vertical", () => {
    for (const v of VERTICALS) {
      expect(getQuestionSet(v.id).some((q) => q.id === "never_do")).toBe(true);
    }
  });
});

describe("detectVertical", () => {
  it("matches on industry keywords", () => {
    expect(detectVertical("Dental clinic")).toBe("clinic");
    expect(detectVertical("Wholesale food distributor")).toBe("distributor");
    expect(detectVertical("Real estate agency")).toBe("real_estate");
    expect(detectVertical("Online fashion boutique")).toBe("retail");
    expect(detectVertical("Specialty coffee roaster and café")).toBe("restaurant");
    expect(detectVertical("Digital marketing agency")).toBe("services");
  });

  it("falls back to `other` rather than guessing wrongly", () => {
    expect(detectVertical(undefined)).toBe("other");
    expect(detectVertical("")).toBe("other");
    expect(detectVertical("   ")).toBe("other");
    expect(detectVertical("artisanal widget conglomerate")).toBe("other");
  });

  it("is case-insensitive", () => {
    expect(detectVertical("REAL ESTATE")).toBe("real_estate");
  });

  it("always resolves to a real vertical", () => {
    expect(getVertical("nonsense").id).toBe("other");
    expect(getVertical(null).id).toBe("other");
  });
});

describe("conditional visibility", () => {
  const q = { id: "x", label: "x", input: "short_text" as const, showIf: { question: "sw", equals: true } };

  it("hides a dependent question until its switch is on", () => {
    expect(isVisible(q, {})).toBe(false);
    expect(isVisible(q, { sw: false })).toBe(false);
    expect(isVisible(q, { sw: true })).toBe(true);
  });

  it("counts only visible questions toward progress", () => {
    const values: Record<string, AnswerValue> = { takes_appointments: false };
    const visible = visibleQuestions("clinic", values).map((x) => x.id);
    expect(visible).not.toContain("booking_channels");
    expect(visible).toContain("takes_appointments");

    const withOn = visibleQuestions("clinic", { takes_appointments: true }).map((x) => x.id);
    expect(withOn).toContain("booking_channels");
  });
});

describe("isAnswered", () => {
  it("treats false as a real answer but empty values as unanswered", () => {
    expect(isAnswered(false)).toBe(true);
    expect(isAnswered(undefined)).toBe(false);
    expect(isAnswered("")).toBe(false);
    expect(isAnswered("  ")).toBe(false);
    expect(isAnswered([])).toBe(false);
    expect(isAnswered(["Cash"])).toBe(true);
  });

  it("handles the compound shapes", () => {
    expect(isAnswered({ selected: [], text: "" })).toBe(false);
    expect(isAnswered({ selected: [], text: "never promise dates" })).toBe(true);
    expect(isAnswered({ varies: true })).toBe(true);
    expect(isAnswered({ from: undefined, to: undefined })).toBe(false);
    expect(isAnswered({ from: 10, to: 50, currency: "USD" })).toBe(true);
  });

  it("counts a closed-every-day week as unanswered", () => {
    const allClosed = Object.fromEntries(
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { closed: true }]),
    ) as never;
    expect(isAnswered(allClosed)).toBe(false);
  });

  it("reports progress over the visible set", () => {
    const { answered, total } = answeredCount("retail", { what_you_do: "We sell rugs" });
    expect(answered).toBe(1);
    expect(total).toBe(visibleQuestions("retail", { what_you_do: "x" }).length);
  });
});

describe("core questions", () => {
  it("asks never_do as chips plus free text, not a bare list", () => {
    const nd = CORE_QUESTIONS.find((q) => q.id === "never_do")!;
    expect(nd.input).toBe("chips_plus_text");
    expect(nd.options!.length).toBeGreaterThanOrEqual(6);
    expect(nd.allowCustom).toBe(true);
  });

  it("uses a structured input for hours rather than a text box", () => {
    expect(CORE_QUESTIONS.find((q) => q.id === "hours")!.input).toBe("weekly_hours");
  });
});
