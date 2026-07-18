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
        command: "pnpm --filter @platform/web dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
        cwd: "..",
      },
});
