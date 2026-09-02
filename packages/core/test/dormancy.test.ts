import { describe, expect, it } from "vitest";
import { DEFAULT_DORMANCY_SETTINGS } from "@platform/schemas";
import { dominantCategory, resolveDormancySettings, type DormantItem } from "../src/dormancy";

// findDormantItems is DB-backed and exercised against production data in the
// PR; what is pinned here is the settings resolution and the banner's
// dominance rule — the two places a wrong answer is silent rather than loud.

describe("resolveDormancySettings", () => {
  it("defaults when the workspace has no dormancy block", () => {
    expect(resolveDormancySettings(null)).toEqual(DEFAULT_DORMANCY_SETTINGS);
    expect(resolveDormancySettings({})).toEqual(DEFAULT_DORMANCY_SETTINGS);
    expect(resolveDormancySettings({ maxAutoRisk: "medium" })).toEqual(DEFAULT_DORMANCY_SETTINGS);
  });

  it("reads a partial block, defaulting the rest", () => {
    const s = resolveDormancySettings({ dormancy: { orderHours: 4 } });
    expect(s.orderHours).toBe(4);
    expect(s.draftHours).toBe(24);
  });

  it("falls back to DEFAULTS on a malformed block, not to 'never dormant'", () => {
    // The dangerous direction. A corrupt blob read as "no thresholds" would
    // silently empty the very list that exists to show a backlog — the owner
    // would see nothing and conclude there was nothing.
    const s = resolveDormancySettings({ dormancy: { draftHours: "soon", orderHours: -3 } });
    expect(s).toEqual(DEFAULT_DORMANCY_SETTINGS);
  });

  it("keeps orders more urgent than drafts by default", () => {
    // A customer waiting on a yes/no is more time-sensitive than a reply the
    // owner has not sent yet. If this ever inverts it is probably a mistake.
    expect(DEFAULT_DORMANCY_SETTINGS.orderHours).toBeLessThan(
      DEFAULT_DORMANCY_SETTINGS.draftHours,
    );
  });

  it("keeps every default inside WhatsApp's 24-hour service window", () => {
    // Past 24h a free-form reply is impossible — only a paid template. A
    // threshold above that would surface the obligation only once it could no
    // longer be met normally.
    for (const v of Object.values(DEFAULT_DORMANCY_SETTINGS)) expect(v).toBeLessThanOrEqual(24);
  });
});

describe("dominantCategory", () => {
  const draft = (category: string | null): DormantItem => ({
    kind: "draft",
    conversationId: "c",
    since: new Date(),
    preview: "x",
    category,
  });

  it("names a category that accounts for most of the backlog", () => {
    const items = [draft("hours"), draft("hours"), draft("hours"), draft("faq")];
    expect(dominantCategory(items)).toEqual({ category: "hours", count: 3 });
  });

  it("stays SILENT when nothing dominates", () => {
    // Pointing at a category responsible for 2 items in 20 would send the owner
    // to loosen autonomy that fixes almost none of their backlog.
    const items = [draft("hours"), draft("faq"), draft("location"), draft("pricing_stated")];
    expect(dominantCategory(items)).toBeNull();
  });

  it("ignores items with no category rather than counting them as one", () => {
    const items = [draft("hours"), draft("hours"), draft(null), draft(null)];
    // 2 of 4 categorised items reach the 0.4 share of the TOTAL.
    expect(dominantCategory(items)).toEqual({ category: "hours", count: 2 });
  });

  it("returns null for an empty backlog instead of dividing by zero", () => {
    expect(dominantCategory([])).toBeNull();
  });

  it("respects a caller-supplied share", () => {
    const items = [draft("hours"), draft("faq"), draft("faq")];
    expect(dominantCategory(items, 0.9)).toBeNull();
    expect(dominantCategory(items, 0.6)).toEqual({ category: "faq", count: 2 });
  });
});
