import { describe, expect, it } from "vitest";
import { renderDraftApprovalEmail } from "../src/notifications";

describe("renderDraftApprovalEmail", () => {
  const email = renderDraftApprovalEmail({
    customerMessage: "Do you ship to Canada?",
    suggestedReply: "Yes — we ship worldwide, usually 3–5 days.",
    reviewUrl: "https://app.ovanth.ai/conversations/abc",
  });

  it("uses the approval subject", () => {
    expect(email.subject).toBe("New customer message needs your approval");
  });

  it("includes the customer message, the suggested reply, and the review link", () => {
    for (const part of [email.text, email.html]) {
      expect(part).toContain("Do you ship to Canada?");
      expect(part).toContain("we ship worldwide");
      expect(part).toContain("https://app.ovanth.ai/conversations/abc");
    }
  });

  it("HTML-escapes customer content (no injection into the email body)", () => {
    const evil = renderDraftApprovalEmail({
      customerMessage: `<script>alert(1)</script>`,
      suggestedReply: "ok",
      reviewUrl: "https://x/y",
    });
    expect(evil.html).not.toContain("<script>alert(1)</script>");
    expect(evil.html).toContain("&lt;script&gt;");
  });
});
