import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

// SSRF guard for website ingestion (plan §6). Public http(s) URLs only;
// private/reserved IPs rejected at every redirect hop.

const BLOCKED_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT 100.64/10
];

export function isBlockedIp(ip: string): boolean {
  if (isIP(ip) === 4) return BLOCKED_V4.some((re) => re.test(ip));
  // v6: loopback, link-local, unique-local, unspecified, v4-mapped
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd"))
    return true;
  if (lower.startsWith("::ffff:")) return isBlockedIp(lower.slice(7));
  return false;
}

export function parsePublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new IngestUrlError("Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new IngestUrlError("Only http(s) URLs are supported");
  }
  if (url.username || url.password) {
    throw new IngestUrlError("URLs with credentials are not supported");
  }
  const host = url.hostname;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new IngestUrlError("Host not allowed");
  }
  if (isIP(host) && isBlockedIp(host)) {
    throw new IngestUrlError("Host not allowed");
  }
  return url;
}

export class IngestUrlError extends Error {}

async function assertResolvesPublic(url: URL): Promise<void> {
  const host = url.hostname;
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new IngestUrlError("Host not allowed");
    return;
  }
  const results = await lookup(host, { all: true }).catch(() => {
    throw new IngestUrlError("Host does not resolve");
  });
  if (results.length === 0) throw new IngestUrlError("Host does not resolve");
  if (results.some((r) => isBlockedIp(r.address))) {
    throw new IngestUrlError("Host not allowed");
  }
}

const MAX_REDIRECTS = 3;
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

/**
 * Fetch an HTML page with SSRF protection: public-IP re-check on every
 * redirect hop, 10s timeout, 2MB cap, text/html only.
 */
export async function safeFetchHtml(rawUrl: string): Promise<{
  finalUrl: string;
  html: string;
} | null> {
  let url = parsePublicHttpUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertResolvesPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "PlatformBrainBot/0.1 (+business profile setup)" },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      url = parsePublicHttpUrl(new URL(loc, url).toString());
      continue;
    }
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html") && !type.includes("application/xhtml")) return null;

    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(
      chunks.reduce((acc, c) => {
        const merged = new Uint8Array(acc.byteLength + c.byteLength);
        merged.set(acc);
        merged.set(c, acc.byteLength);
        return merged;
      }, new Uint8Array(0)),
    );
    return { finalUrl: url.toString(), html };
  }
  return null;
}
