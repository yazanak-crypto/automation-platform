import { describe, expect, it } from "vitest";
import { extractInterestingLinks, htmlToText } from "../src/scrape";

describe("htmlToText", () => {
  it("strips scripts, styles and tags but keeps content and headings", () => {
    const html = `<html><head><title>Acme Studio</title><style>body{}</style></head>
      <body><script>alert(1)</script><h1>We make chairs</h1><p>Hand-built in Vienna.</p></body></html>`;
    const { title, text } = htmlToText(html);
    expect(title).toBe("Acme Studio");
    expect(text).toContain("## We make chairs");
    expect(text).toContain("Hand-built in Vienna.");
    expect(text).not.toContain("alert(1)");
    expect(text).not.toContain("<p>");
  });

  it("decodes common entities", () => {
    expect(htmlToText("<p>Fish &amp; Chips</p>").text).toContain("Fish & Chips");
  });
});

describe("extractInterestingLinks", () => {
  const base = "https://acme.com/";
  it("keeps same-origin interesting links, drops externals and dupes", () => {
    const html = `
      <a href="/about">About us</a>
      <a href="/about/">About again</a>
      <a href="/faq">FAQ</a>
      <a href="https://evil.com/about">External about</a>
      <a href="/blog/post-1">Random post</a>
      <a href="/pricing">Pricing</a>`;
    const links = extractInterestingLinks(html, base);
    expect(links).toEqual([
      "https://acme.com/about",
      "https://acme.com/faq",
      "https://acme.com/pricing",
    ]);
  });

  it("caps at 4 links", () => {
    const html = ["/about", "/faq", "/pricing", "/services", "/products", "/contact"]
      .map((p) => `<a href="${p}">${p}</a>`)
      .join("");
    expect(extractInterestingLinks(html, base)).toHaveLength(4);
  });
});
