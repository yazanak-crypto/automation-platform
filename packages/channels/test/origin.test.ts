import { describe, expect, it } from "vitest";
import { findBannedPhrase, isValidVisitorId, originAllowed } from "../src";

describe("originAllowed (AC-4.6)", () => {
  const allowed = ["https://acme.com", "acme-shop.com"];

  it("allows exact origins, normalizing scheme-less entries", () => {
    expect(originAllowed("https://acme.com", allowed)).toBe(true);
    expect(originAllowed("https://acme-shop.com", allowed)).toBe(true);
  });

  it("rejects everything else", () => {
    expect(originAllowed("https://evil.com", allowed)).toBe(false);
    expect(originAllowed("https://acme.com.evil.com", allowed)).toBe(false);
    expect(originAllowed("https://sub.acme.com", allowed)).toBe(false); // exact only
    expect(originAllowed("http://acme.com:8080", allowed)).toBe(false); // port differs
    expect(originAllowed(null, allowed)).toBe(false);
    expect(originAllowed("https://acme.com", [])).toBe(false);
    expect(originAllowed("https://acme.com", undefined)).toBe(false);
    expect(originAllowed("garbage", allowed)).toBe(false);
  });

  it("is case-insensitive on host", () => {
    expect(originAllowed("https://ACME.com", allowed)).toBe(true);
  });
});

describe("visitor id validation", () => {
  it("accepts only UUID-shaped opaque tokens", () => {
    expect(isValidVisitorId("6f9619ff-8b86-4d01-b42d-00cf4fc964ff")).toBe(true);
    expect(isValidVisitorId("../../etc/passwd")).toBe(false);
    expect(isValidVisitorId("1; DROP TABLE contacts")).toBe(false);
    expect(isValidVisitorId("")).toBe(false);
  });
});

describe("findBannedPhrase (boundary post-check, deterministic half)", () => {
  it("catches banned phrases case-insensitively", () => {
    expect(findBannedPhrase("We can offer you a DISCOUNT today", ["discount"])).toBe("discount");
    expect(findBannedPhrase("Happy to help!", ["discount", "refund guarantee"])).toBeNull();
    expect(findBannedPhrase("full refund guaranteed", ["refund guarantee"])).toBe("refund guarantee"); // substring match
    expect(findBannedPhrase("anything", [])).toBeNull();
  });
});
