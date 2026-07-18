import { expect, test } from "@playwright/test";

// Smoke slice of AC-4.2: public surfaces work and the security posture holds.

test("landing page renders the promise", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("AI that works");
  await expect(page.getByText("Nothing sends without you.")).toBeVisible();
});

test("widget bundle is served", async ({ request }) => {
  const res = await request.get("/widget.js");
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("platform_visitor_");
});

test("webchat API refuses unknown widget keys and missing origins", async ({ request }) => {
  const res = await request.post("/api/webchat/00000000-0000-4000-8000-000000000000/messages", {
    data: {
      visitorId: "00000000-0000-4000-8000-000000000001",
      body: "hi",
      clientMessageId: "00000000-0000-4000-8000-000000000002",
    },
  });
  expect(res.status()).toBe(403);
});

test("app routes require auth", async ({ page }) => {
  const res = await page.goto("/dashboard");
  // Clerk middleware redirects unauthenticated users to sign-in.
  expect(res?.url()).not.toContain("/dashboard");
});
