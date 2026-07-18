// Gmail transport for the EmailAdapter. ALL Gmail-specific knowledge lives in
// this file — nothing outside the channels package may import it (the same
// isolation rule as the execution adapter, Decision 003).

const NANGO_BASE = "https://api.nango.dev";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export class ReconnectRequiredError extends Error {}

/** Fresh access token from Nango — raw tokens never touch our DB (Decision 003 §9). */
export async function nangoAccessToken(nangoConnectionId: string): Promise<string> {
  const key = process.env.NANGO_SECRET_KEY;
  if (!key) throw new Error("NANGO_SECRET_KEY not configured");
  const res = await fetch(
    `${NANGO_BASE}/connection/${encodeURIComponent(nangoConnectionId)}?provider_config_key=google-mail`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  if (res.status === 404 || res.status === 400) {
    throw new ReconnectRequiredError("Gmail connection missing or revoked");
  }
  if (!res.ok) throw new Error(`Nango token fetch failed: ${res.status}`);
  const data = (await res.json()) as { credentials?: { access_token?: string } };
  const token = data.credentials?.access_token;
  if (!token) throw new ReconnectRequiredError("Gmail connection has no usable token");
  return token;
}

async function gmail<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new ReconnectRequiredError(`Gmail auth failed: ${res.status}`);
  }
  if (!res.ok) throw new Error(`Gmail API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function gmailProfile(token: string): Promise<{ emailAddress: string }> {
  return gmail(token, "/profile");
}

export interface GmailHeader { name: string; value: string }
export interface GmailPayload {
  mimeType?: string;
  headers?: GmailHeader[];
  body?: { data?: string };
  parts?: GmailPayload[];
}
export interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  payload?: GmailPayload;
}

export async function listRecentInboxIds(token: string, newerThanDays = 2): Promise<string[]> {
  const q = encodeURIComponent(
    `in:inbox -category:promotions -category:social newer_than:${newerThanDays}d`,
  );
  const data = await gmail<{ messages?: { id: string }[] }>(
    token,
    `/messages?q=${q}&maxResults=25`,
  );
  return (data.messages ?? []).map((m) => m.id);
}

export async function getMessage(token: string, id: string): Promise<GmailMessage> {
  return gmail(token, `/messages/${id}?format=full`);
}

// ── Parsing (pure, unit-tested) ─────────────────────────────────────────────

export function header(msg: GmailMessage, name: string): string | undefined {
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

/** "Jane Doe <jane@x.com>" → { name: "Jane Doe", email: "jane@x.com" } */
export function parseAddress(raw: string | undefined): { name?: string; email: string } | null {
  if (!raw) return null;
  const angled = /<([^<>\s]+@[^<>\s]+)>/.exec(raw);
  if (angled?.[1]) {
    const name = raw.slice(0, angled.index).replace(/["']/g, "").trim();
    return { name: name || undefined, email: angled[1].toLowerCase() };
  }
  const bare = /^[^\s@]+@[^\s@]+$/.exec(raw.trim());
  return bare ? { email: raw.trim().toLowerCase() } : null;
}

function b64urlDecode(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** Prefer text/plain; fall back to stripped text/html; cap length. */
export function extractBody(payload: GmailPayload | undefined, cap = 8000): string {
  if (!payload) return "";
  const flat: GmailPayload[] = [];
  const walk = (p: GmailPayload) => {
    flat.push(p);
    p.parts?.forEach(walk);
  };
  walk(payload);
  const plain = flat.find((p) => p.mimeType === "text/plain" && p.body?.data);
  if (plain?.body?.data) return b64urlDecode(plain.body.data).slice(0, cap).trim();
  const html = flat.find((p) => p.mimeType === "text/html" && p.body?.data);
  if (html?.body?.data) {
    return b64urlDecode(html.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, cap)
      .trim();
  }
  return "";
}

// ── Sending (threaded reply) ────────────────────────────────────────────────

export function buildReplyMime(args: {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const subject = /^re:/i.test(args.subject) ? args.subject : `Re: ${args.subject}`;
  // RFC 2047 encode the subject for non-ASCII safety.
  const encSubject = /^[\x20-\x7e]*$/.test(subject)
    ? subject
    : `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
  const lines = [
    `To: ${args.to}`,
    `Subject: ${encSubject}`,
    ...(args.inReplyTo ? [`In-Reply-To: ${args.inReplyTo}`] : []),
    ...(args.references ? [`References: ${args.references}`] : []),
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(args.body, "utf8").toString("base64"),
  ];
  return Buffer.from(lines.join("\r\n"), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendReply(
  token: string,
  threadId: string,
  raw: string,
): Promise<{ id: string }> {
  return gmail(token, "/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw, threadId }),
  });
}
