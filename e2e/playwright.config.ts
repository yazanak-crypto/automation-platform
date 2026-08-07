import { defineConfig } from "@playwright/test";

// AC-4.2 harness. Full journey requires CLERK keys + DB + Redis + worker; the
// smoke project runs against just the web app. `pnpm e2e` locally, gated job in CI.

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // E2E_BUILD=1 runs a real production build instead of `next dev`.
        // This matters for the onboarding-loop regression test: the client
        // Router Cache — where that bug lived — behaves differently under
        // `next dev` (no prerender, different prefetch/stale semantics), so a
        // dev server can pass while production is broken. CI sets E2E_BUILD=1.
        command: process.env.E2E_BUILD === "1"
          ? "pnpm --filter @platform/web build && pnpm --filter @platform/web start"
          : "pnpm --filter @platform/web dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: process.env.E2E_BUILD === "1" ? 300_000 : 120_000,
        cwd: "..",
      },
});
