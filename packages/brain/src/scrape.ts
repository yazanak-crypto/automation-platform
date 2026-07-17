import { safeFetchHtml } from "./ssrf";

// Deliberately naive scraper (plan §3, founder guardrail 1): homepage + up to
// 4 same-origin links matching interesting keywords. No JS rendering, no
// recursion, no sitemaps. A site we can't read is a soft outcome, not an error.

export interface ScrapedPage {
  url: string;
  title: string;
  text: string;
}

const INTERESTING = /about|faq|service|product|pricing|policy|contact|story/i;
const MAX_EXTRA_PAGES = 4;
const MAX_TEXT_PER_PAGE = 20_000;

export function htmlToText(html: string): { title: string; text: string } {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  // Keep heading structure as markdown-ish markers for the model.
  s = s.replace(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, _l, inner) => {
    return `\n## ${String(inner).replace(/<[^>]+>/g, " ").trim()}\n`;
  });
  s = s
    .replace(/<(br|p|div|li|tr|section|article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return { title, text: s.slice(0, MAX_TEXT_PER_PAGE) };
}

export function extractInterestingLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < MAX_EXTRA_PAGES) {
    const href = m[1] ?? "";
    const label = (m[2] ?? "").replace(/<[^>]+>/g, " ");
    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      continue;
    }
    if (abs.origin !== base.origin) continue;
    if (!INTERESTING.test(abs.pathname) && !INTERESTING.test(label)) continue;
    const key = abs.pathname.replace(/\/$/, "");
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(abs.toString());
  }
  return out;
}

export async function scrapeSite(url: string): Promise<ScrapedPage[]> {
  const home = await safeFetchHtml(url);
  if (!home) return [];
  const pages: ScrapedPage[] = [];
  const homeText = htmlToText(home.html);
  pages.push({ url: home.finalUrl, ...homeText });

  for (const link of extractInterestingLinks(home.html, home.finalUrl)) {
    try {
      const page = await safeFetchHtml(link);
      if (page) pages.push({ url: page.finalUrl, ...htmlToText(page.html) });
    } catch {
      // A single bad subpage never fails the ingest.
    }
  }
  return pages;
}
