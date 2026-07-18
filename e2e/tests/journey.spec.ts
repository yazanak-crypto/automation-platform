import { expect, test } from "@playwright/test";

/**
 * AC-4.2 happy path: signup → onboard → activate → visitor message → approve
 * → reply visible. Requires a full stack (DB, Redis, worker, Anthropic key)
 * plus Clerk test credentials — so it self-skips unless E2E_FULL=1.
 *
 * Clerk test mode: emails ending +clerk_test@example.com with code 424242.
 */
test.describe("full journey", () => {
  test.skip(process.env.E2E_FULL !== "1", "set E2E_FULL=1 with a full stack running");

  test("signup → brain → channel → activate → approve → reply", async ({ page }) => {
    const email = `founder+clerk_test@example.com`;

    await page.goto("/");
    await page.getByRole("button", { name: "Start free" }).click();
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByLabel(/code/i).fill("424242");

    // Onboarding (manual path — deterministic without a scrape target)
    await page.getByPlaceholder("Acme Studio").fill("E2E Test Studio");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /Looks right/ }).click();

    await expect(page).toHaveURL(/dashboard/);
    // The rest of the journey (channel setup → widget message → approval) is
    // exercised via the API-level integration tests; extend here as the
    // pilot-readiness pass hardens selectors.
  });
});
