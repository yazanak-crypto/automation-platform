import { describe, expect, it } from "vitest";
import { ContextUnavailableError, getContextPack } from "../src/contextPack";

// The three-state contract for order_history. Assembling a real pack needs a
// database (covered by the integration suite); what is pinned here is the
// distinction between "not requested", "requested and empty", and "requested
// but unfulfillable" — the one that has already gone wrong on this platform.

describe("order_history fails fast when it cannot be fulfilled", () => {
  it("throws ContextUnavailableError when contactId was not threaded through", async () => {
    // The bug this prevents: without a contactId there is no customer to look
    // up, so a silent empty history would read exactly like a first-time buyer
    // — for every customer, forever, with nothing anywhere saying so. That is
    // the answers.vertical failure repeated, where dropped facts looked
    // identical to no facts.
    await expect(
      getContextPack("11111111-1111-1111-1111-111111111111", ["order_history"]),
    ).rejects.toBeInstanceOf(ContextUnavailableError);
  });

  it("names the need and the reason, so the log says what to fix", async () => {
    const err = await getContextPack("11111111-1111-1111-1111-111111111111", ["order_history"]).catch(
      (e) => e as Error,
    );
    expect(err.message).toContain("order_history");
    expect(err.message).toContain("contactId");
  });

  it("throws BEFORE touching the database", async () => {
    // A wiring bug should not cost a round of queries, and this assertion is
    // also what lets the test run at all without a database: if the guard were
    // below the profile lookup, this would fail on a connection error instead
    // of a ContextUnavailableError.
    const err = await getContextPack("11111111-1111-1111-1111-111111111111", ["order_history"]).catch(
      (e) => e as Error,
    );
    expect(err.name).toBe("ContextUnavailableError");
  });

  it("does not throw for other needs that have no contactId requirement", async () => {
    // Only order_history carries the requirement; asking for boundaries with no
    // contactId must reach the database rather than being rejected up front.
    const err = await getContextPack("11111111-1111-1111-1111-111111111111", ["boundaries"]).catch(
      (e) => e as Error,
    );
    expect(err?.name).not.toBe("ContextUnavailableError");
  });
});
