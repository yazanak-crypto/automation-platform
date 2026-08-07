import { expect, test, type Page } from "@playwright/test";

/**
 * Regression test for the onboarding redirect loop.
 *
 * The bug was NOT in the database. Production logs proved the guard and the
 * onboarding write agreed on the same workspace, the write persisted, and the
 * guard then never ran again — the browser served /dashboard from Next's
 * client Router Cache, replaying an RSC payload fetched while onboarding was
 * still `pending`. That payload IS the redirect back to /onboarding, so the
 * user bounced forever while the database looked perfect.
 *
 * Two details make this test able to actually catch that regression, and both
 * must be preserved if it is ever rewritten:
 *
 *   1. It visits /dashboard BEFORE finishing onboarding. That is what puts the
 *      poisoned redirect payload in the client router cache. Without this step
 *      the cache is empty, router.push has nothing stale to replay, and the
 *      test passes even against the broken build.
 *
 *   2. Every post-onboarding navigation is a CLIENT-SIDE click, never
 *      page.goto(). A full document load bypasses the router cache entirely,
 *      which is exactly the code path that always worked. Using page.goto here
 *      would silently neuter the test.
 *
 * Requires Clerk test credentials + a real database, so it self-skips unless
 * E2E_FULL=1. Clerk test mode: any address ending +clerk_test@example.com
 * verifies with the fixed code 424242.
 */

const ONBOARDING = /\/onboarding/;

async function signUpFreshUser(page: Page, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole("button", { name: /continue|sign up/i }).first().click();

  // Clerk renders a segmented one-time-code field; filling the first input
  // distributes the digits.
  const code = page.locator('input[autocomplete="one-time-code"]').first();
  await code.waitFor({ state: "visible", timeout: 30_000 });
  await code.fill("424242");

  // Land wherever Clerk sends us; the app guard takes over from there.
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-up"), { timeout: 30_000 });
}

test.describe("onboarding redirect loop", () => {
  test.skip(process.env.E2E_FULL !== "1", "set E2E_FULL=1 with Clerk test keys + a database");

  test("finishing onboarding lands on the dashboard and never bounces back", async ({ page }) => {
    // Track every URL the page lands on, so a transient bounce through
    // /onboarding fails the test even if the final URL looks correct.
    const visited: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) visited.push(frame.url());
    });

    const email = `e2e-loop-${Date.now()}+clerk_test@example.com`;
    await signUpFreshUser(page, email);

    // Step 1 — poison the router cache exactly the way a real user does.
    // Onboarding is still `pending`, so the server answers /dashboard with a
    // redirect to /onboarding and Next caches that payload.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(ONBOARDING);

    // Step 2 — finish onboarding via Skip. This is a client-side transition:
    // the app writes the status, invalidates the router cache, then pushes.
    const skipPoint = visited.length;
    await page.getByRole("button", { name: /skip for now/i }).click();

    // Step 3 — the assembling beat plays (~1.9s), then the dashboard. On the
    // broken build the cached redirect replayed here and we ended up back on
    // /onboarding instead.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    // Step 4 — a reload proves the server agrees the user is onboarded (this
    // is the part that always worked, and it must keep working).
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    // Step 5 — client-side navigation between app routes. Each of these
    // re-evaluates the guard through the same cache the bug lived in.
    for (const label of ["Conversations", "Knowledge", "Channels", "Overview"]) {
      await page.getByRole("link", { name: label, exact: true }).first().click();
      await expect(page).not.toHaveURL(ONBOARDING);
    }

    // Nothing after the Skip click may have touched /onboarding, not even for
    // a single intermediate navigation.
    const afterSkip = visited.slice(skipPoint);
    expect(
      afterSkip.filter((u) => u.includes("/onboarding")),
      `bounced back to onboarding after completing it; navigation trail: ${afterSkip.join(" → ")}`,
    ).toEqual([]);
  });
});
