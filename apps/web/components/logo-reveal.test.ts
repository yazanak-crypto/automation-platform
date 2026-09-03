import { describe, expect, it } from "vitest";
import { arrivedFromOutside, hasSeenCookie, shouldPlayReveal } from "./logo-reveal";

// Frequency rules for the opening reveal. "Plays once per session" is the kind
// of claim that is easy to believe and easy to get wrong, so the matrix is
// asserted rather than described.

const ORIGIN = "https://ovanth.com";
const base = {
  seen: false,
  signedIn: false,
  pathname: "/",
  referrer: "",
  origin: ORIGIN,
};

describe("hasSeenCookie", () => {
  it("finds the flag on its own and among others", () => {
    expect(hasSeenCookie("ovr=1")).toBe(true);
    expect(hasSeenCookie("__session=abc; ovr=1; other=2")).toBe(true);
    expect(hasSeenCookie("other=2; ovr=1")).toBe(true);
  });

  it("is false when absent or empty", () => {
    expect(hasSeenCookie("")).toBe(false);
    expect(hasSeenCookie("__session=abc; other=2")).toBe(false);
  });

  it("does not match a lookalike name or value", () => {
    // A substring check would accept all three of these.
    expect(hasSeenCookie("discovr=1")).toBe(false);
    expect(hasSeenCookie("ovr=10")).toBe(false);
    expect(hasSeenCookie("xovr=1")).toBe(false);
  });

  it("is false for the flag set to anything but 1", () => {
    expect(hasSeenCookie("ovr=0")).toBe(false);
    expect(hasSeenCookie("ovr=")).toBe(false);
  });
});

describe("arrivedFromOutside", () => {
  it("counts an empty referrer as outside — that is a direct hit", () => {
    expect(arrivedFromOutside("", ORIGIN)).toBe(true);
  });

  it("counts our own pages as inside", () => {
    expect(arrivedFromOutside(`${ORIGIN}/dashboard`, ORIGIN)).toBe(false);
    expect(arrivedFromOutside(`${ORIGIN}/`, ORIGIN)).toBe(false);
  });

  it("counts another origin as outside", () => {
    expect(arrivedFromOutside("https://mail.google.com/", ORIGIN)).toBe(true);
    // Same host, different scheme/port is still a different origin.
    expect(arrivedFromOutside("http://ovanth.com/", ORIGIN)).toBe(true);
  });

  it("treats an unparseable referrer as outside rather than throwing", () => {
    expect(arrivedFromOutside("not a url", ORIGIN)).toBe(true);
  });
});

describe("shouldPlayReveal", () => {
  it("plays for a first visit to the marketing page", () => {
    expect(shouldPlayReveal(base)).toBe(true);
  });

  it("never plays once the session flag is set", () => {
    // This single rule is what makes a hard refresh, a client-side navigation
    // and a repeat visit all quiet: they all read the same flag.
    expect(shouldPlayReveal({ ...base, seen: true })).toBe(false);
    expect(shouldPlayReveal({ ...base, seen: true, pathname: "/dashboard" })).toBe(false);
    expect(shouldPlayReveal({ ...base, seen: true, signedIn: true })).toBe(false);
  });

  describe("signed-in deep link into the app", () => {
    it("is suppressed when arriving from outside", () => {
      expect(
        shouldPlayReveal({
          ...base,
          signedIn: true,
          pathname: "/dashboard",
          referrer: "https://mail.google.com/",
        }),
      ).toBe(false);
    });

    it("is suppressed on a direct hit with no referrer", () => {
      expect(
        shouldPlayReveal({ ...base, signedIn: true, pathname: "/conversations", referrer: "" }),
      ).toBe(false);
    });

    it("is suppressed on nested app routes", () => {
      expect(
        shouldPlayReveal({ ...base, signedIn: true, pathname: "/settings/team", referrer: "" }),
      ).toBe(false);
    });

    it("still plays when the same user arrives from our own marketing page", () => {
      // Not a deep link — they walked in through the front door.
      expect(
        shouldPlayReveal({
          ...base,
          signedIn: true,
          pathname: "/dashboard",
          referrer: `${ORIGIN}/`,
        }),
      ).toBe(true);
    });

    it("still plays for a SIGNED-OUT visitor deep-linking to an app route", () => {
      // They are about to hit the sign-in wall, not their work.
      expect(
        shouldPlayReveal({ ...base, signedIn: false, pathname: "/dashboard", referrer: "" }),
      ).toBe(true);
    });

    it("still plays for a signed-in user landing on a marketing or legal page", () => {
      for (const pathname of ["/", "/pricing", "/terms", "/demo"]) {
        expect(shouldPlayReveal({ ...base, signedIn: true, pathname, referrer: "" })).toBe(true);
      }
    });
  });

  it("does not mistake a lookalike path for an app route", () => {
    // "/billing-guide" is marketing; "/billing" is the app. A bare
    // startsWith without the boundary check would swallow both.
    expect(
      shouldPlayReveal({ ...base, signedIn: true, pathname: "/billing-guide", referrer: "" }),
    ).toBe(true);
    expect(shouldPlayReveal({ ...base, signedIn: true, pathname: "/billing", referrer: "" })).toBe(
      false,
    );
  });
});
