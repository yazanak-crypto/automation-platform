import { describe, expect, it } from "vitest";
import {
  pickAckLanguage,
  renderAcknowledgement,
  renderCancellation,
  renderConfirmation,
} from "../src/orderMessages";

describe("pickAckLanguage", () => {
  it("uses Arabic only when the business replies in Arabic AND the customer wrote in it", () => {
    expect(pickAckLanguage({ businessLanguages: ["Arabic", "English"], customerMessageIsRtl: true })).toBe("ar");
    expect(pickAckLanguage({ businessLanguages: ["Arabic", "English"], customerMessageIsRtl: false })).toBe("en");
  });

  it("never switches to Arabic for a business that does not reply in it", () => {
    // The customer writing in Arabic does not license the business to start
    // answering in a language it never chose.
    expect(pickAckLanguage({ businessLanguages: ["English"], customerMessageIsRtl: true })).toBe("en");
  });

  it("falls back to English when languages are unanswered", () => {
    expect(pickAckLanguage({})).toBe("en");
    expect(pickAckLanguage({ businessLanguages: [], customerMessageIsRtl: true })).toBe("en");
    expect(pickAckLanguage({ businessLanguages: null, customerMessageIsRtl: true })).toBe("en");
  });

  it("matches the language name case- and space-insensitively", () => {
    expect(pickAckLanguage({ businessLanguages: [" arabic "], customerMessageIsRtl: true })).toBe("ar");
  });
});

describe("acknowledgement frames", () => {
  const args = { summary: "2× فتوش, 1× Margherita", businessName: "Dar Aliya" };

  it("acknowledges receipt without confirming anything", () => {
    // The whole point: received, not agreed. If either frame ever starts
    // saying "confirmed", the owner's decision has been pre-empted.
    const en = renderAcknowledgement({ ...args, language: "en" });
    expect(en).toContain("will confirm shortly");
    expect(en.toLowerCase()).not.toMatch(/\bis confirmed\b|\bconfirmed:/);

    const ar = renderAcknowledgement({ ...args, language: "ar" });
    expect(ar).toContain("تم استلام"); // "received"
    expect(ar).toContain("سيؤكده"); // "will confirm it"
    expect(ar).not.toContain("تم تأكيد"); // NOT "confirmed"
  });

  it("carries the item summary verbatim, in both frames", () => {
    for (const language of ["en", "ar"] as const) {
      const out = renderAcknowledgement({ ...args, language });
      expect(out).toContain("2× فتوش");
      expect(out).toContain("1× Margherita");
      expect(out).toContain("Dar Aliya");
    }
  });

  it("quotes no price and promises no time", () => {
    for (const language of ["en", "ar"] as const) {
      const out = renderAcknowledgement({ summary: "1× Pizza", businessName: "B", language });
      expect(out).not.toMatch(/\d+\s*(USD|AED|\$|LBP)/i);
      expect(out).not.toMatch(/minutes|دقيقة/i);
    }
  });
});

describe("confirmation and cancellation frames", () => {
  const args = { summary: "2× فتوش", businessName: "Dar Aliya" };

  it("confirmation states the order IS confirmed — the owner has decided by then", () => {
    expect(renderConfirmation({ ...args, language: "en" })).toContain("confirmed");
    expect(renderConfirmation({ ...args, language: "ar" })).toContain("تم تأكيد");
  });

  it("cancellation invents no reason", () => {
    // We do not know why the owner cancelled, and guessing on their behalf to a
    // customer is worse than saying nothing. The owner can edit it before send.
    const en = renderCancellation({ ...args, language: "en" });
    expect(en).toMatch(/couldn't confirm/i);
    expect(en).not.toMatch(/out of stock|closed|unavailable/i);
    expect(renderCancellation({ ...args, language: "ar" })).toContain("نعتذر");
  });

  it("every frame includes the summary so the customer knows which order", () => {
    for (const render of [renderAcknowledgement, renderConfirmation, renderCancellation]) {
      for (const language of ["en", "ar"] as const) {
        expect(render({ ...args, language })).toContain("2× فتوش");
      }
    }
  });
});
