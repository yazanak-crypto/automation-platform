// Meta (Instagram / WhatsApp / Facebook) transport. ALL Meta-specific knowledge
// lives in this file — nothing outside the channels package may import it (same
// isolation rule as the Gmail transport, Decision 003).
//
// Instagram Business messaging uses the "Instagram API with Instagram Login"
// (graph.instagram.com). Nango holds and refreshes the long-lived IG user
// access token; raw tokens never touch our DB (Decision 003 §9). Inbound is
// webhook-driven (Meta pushes events) — not poll-driven like Gmail.

import { createHmac, timingSafeEqual } from "node:crypto";
// Reuse the canonical "reconnect needed" signal so `instanceof` is consistent
// across every Nango-backed transport.
import { ReconnectRequiredError } from "./gmail";
export { ReconnectRequiredError };

const NANGO_BASE = "https://api.nango.dev";
// Graph API version is pinned so behavior can't shift under us; bump deliberately.
const IG_GRAPH = "https://graph.instagram.com/v21.0";

/** Nango provider config keys. The user names these in the Nango dashboard. */
export const META_PROVIDERS = {
  instagram: "instagram",
} as const;
export type MetaProvider = keyof typeof META_PROVIDERS;

/** Fresh access token from Nango for any Meta provider. */
export async function metaAccessToken(
  nangoConnectionId: string,
  provider: MetaProvider,
): Promise<string> {
  const key = process.env.NANGO_SECRET_KEY;
  if (!key) throw new Error("NANGO_SECRET_KEY not configured");
  const providerConfigKey = META_PROVIDERS[provider];
  const res = await fetch(
    `${NANGO_BASE}/connection/${encodeURIComponent(nangoConnectionId)}?provider_config_key=${encodeURIComponent(providerConfigKey)}`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  if (res.status === 404 || res.status === 400) {
    throw new ReconnectRequiredError("Meta connection missing or revoked");
  }
  if (!res.ok) throw new Error(`Nango token fetch failed: ${res.status}`);
  const data = (await res.json()) as { credentials?: { access_token?: string } };
  const token = data.credentials?.access_token;
  if (!token) throw new ReconnectRequiredError("Meta connection has no usable token");
  return token;
}

/** Delete the Nango connection (real disconnect — revokes stored credentials). */
export async function deleteNangoConnection(
  nangoConnectionId: string,
  provider: MetaProvider,
): Promise<void> {
  const key = process.env.NANGO_SECRET_KEY;
  if (!key) throw new Error("NANGO_SECRET_KEY not configured");
  const res = await fetch(
    `${NANGO_BASE}/connection/${encodeURIComponent(nangoConnectionId)}?provider_config_key=${encodeURIComponent(META_PROVIDERS[provider])}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${key}` } },
  );
  // 404 = already gone; treat as success (idempotent disconnect).
  if (!res.ok && res.status !== 404) {
    throw new Error(`Nango connection delete failed: ${res.status}`);
  }
}

// ── Instagram Graph API ─────────────────────────────────────────────────────

async function ig<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const url = `${IG_GRAPH}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401 || res.status === 403) {
    throw new ReconnectRequiredError(`Instagram auth failed: ${res.status}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Instagram API ${path} failed: ${res.status} ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export interface IgProfile {
  /** The IG-scoped business account id — this is what inbound webhooks are keyed on. */
  id: string;
  username: string;
}

/** Verify the connection works and return the account we're managing. */
export async function igProfile(token: string): Promise<IgProfile> {
  const data = await ig<{ user_id?: string; id?: string; username?: string }>(
    token,
    "/me?fields=user_id,username",
  );
  const id = data.user_id ?? data.id;
  if (!id || !data.username) throw new ReconnectRequiredError("Instagram profile unavailable");
  return { id, username: data.username };
}

/** Send a text DM. `recipientId` is the sender's IG-scoped id (IGSID) from the inbound event. */
export async function sendInstagramMessage(
  token: string,
  recipientId: string,
  text: string,
): Promise<{ mid: string }> {
  const data = await ig<{ message_id?: string }>(token, "/me/messages", {
    method: "POST",
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
  if (!data.message_id) throw new Error("Instagram send returned no message id");
  return { mid: data.message_id };
}

// ── Webhook subscription (per connected account) ────────────────────────────
// After OAuth, the account must be subscribed to THIS app's webhooks or Meta
// delivers no message events for it — the connection would look healthy while
// silently receiving nothing. This is the step that makes a connection live.

export const IG_SUBSCRIBED_FIELDS = ["messages"] as const;

/** Subscribe the connected IG account to this app's `messages` webhooks. */
export async function subscribeInstagramWebhooks(token: string): Promise<void> {
  const fields = IG_SUBSCRIBED_FIELDS.join(",");
  const data = await ig<{ success?: boolean }>(
    token,
    `/me/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}`,
    { method: "POST" },
  );
  if (data.success === false) throw new Error("Instagram webhook subscription was rejected");
}

/** Currently subscribed fields for the account (diagnostics / status checks). */
export async function instagramSubscribedFields(token: string): Promise<string[]> {
  const data = await ig<{ data?: Array<{ subscribed_fields?: string[] }> }>(
    token,
    "/me/subscribed_apps",
  );
  return data.data?.[0]?.subscribed_fields ?? [];
}

/** True when the account is subscribed to every field we need to receive DMs. */
export async function isInstagramSubscribed(token: string): Promise<boolean> {
  const fields = await instagramSubscribedFields(token);
  return IG_SUBSCRIBED_FIELDS.every((f) => fields.includes(f));
}

// ── Webhook verification & parsing (pure, unit-tested) ──────────────────────

/**
 * Validate Meta's `X-Hub-Signature-256` header against the raw request body,
 * using the app secret. Constant-time compare; never throws on bad input.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const [scheme, provided] = signatureHeader.split("=");
  if (scheme !== "sha256" || !provided) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export interface InstagramInboundEvent {
  /** IG business account id the message was sent TO — routes to a connection. */
  igAccountId: string;
  /** Sender's IG-scoped id (IGSID) — the contact identity + reply recipient. */
  senderId: string;
  /** Provider message id — idempotency key. */
  mid: string;
  text: string;
  receivedAt: Date;
}

/**
 * Extract inbound text DMs from an Instagram webhook payload. Skips echoes of
 * our own outbound (`is_echo`), and non-message events (reads, deliveries,
 * reactions, attachment-only messages).
 */
export function parseInstagramWebhook(payload: unknown): InstagramInboundEvent[] {
  const p = payload as {
    object?: string;
    entry?: Array<{
      id?: string;
      messaging?: Array<{
        sender?: { id?: string };
        recipient?: { id?: string };
        timestamp?: number;
        message?: { mid?: string; text?: string; is_echo?: boolean };
      }>;
    }>;
  };
  if (p?.object !== "instagram" || !Array.isArray(p.entry)) return [];
  const out: InstagramInboundEvent[] = [];
  for (const entry of p.entry) {
    const igAccountId = entry.id;
    for (const m of entry.messaging ?? []) {
      const msg = m.message;
      if (!igAccountId || !msg || msg.is_echo) continue;
      const senderId = m.sender?.id;
      if (!senderId || !msg.mid || typeof msg.text !== "string" || !msg.text.trim()) continue;
      out.push({
        igAccountId,
        senderId,
        mid: msg.mid,
        text: msg.text,
        receivedAt: m.timestamp ? new Date(m.timestamp) : new Date(),
      });
    }
  }
  return out;
}
