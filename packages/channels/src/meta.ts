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
// WhatsApp Cloud API lives on the main Graph host, not graph.instagram.com.
const WA_GRAPH = "https://graph.facebook.com/v21.0";

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

// ── WhatsApp Cloud API ──────────────────────────────────────────────────────
// Unlike Instagram, WhatsApp credentials do NOT come from Nango: the Cloud API
// uses a long-lived System User token issued for one WhatsApp Business Account,
// supplied via env. Everything Meta-specific still stays inside this file.

export interface WhatsAppCredentials {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId?: string;
}

/**
 * Read the WhatsApp Cloud API credentials from env. Returns null when the
 * channel isn't configured, so callers degrade instead of throwing at import.
 */
export function whatsappCredentials(): WhatsAppCredentials | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!accessToken || !phoneNumberId) return null;
  return {
    accessToken,
    phoneNumberId,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || undefined,
  };
}

export interface WhatsAppInboundEvent {
  /** Business phone number id the message was sent TO — routes to a channel. */
  phoneNumberId: string;
  /** WhatsApp Business Account id (entry.id). Diagnostics/routing headroom. */
  wabaId: string;
  /** Sender's WhatsApp id (phone number, digits only) — identity + reply target. */
  waId: string;
  /** Provider message id (`wamid.…`) — the idempotency key. */
  mid: string;
  text: string;
  senderName?: string;
  receivedAt: Date;
}

/** A message we deliberately did not ingest, so the caller can log why. */
export interface WhatsAppSkipped {
  mid: string;
  /** Message type we can't handle yet, or "text:empty". */
  type: string;
}

/**
 * Extract inbound text messages from a WhatsApp Cloud API webhook payload.
 *
 * The shape differs from Instagram's in every important way:
 *   entry[].changes[].value.messages[]   (not entry[].messaging[])
 *   metadata.phone_number_id             (routing key, not entry.id)
 *   timestamp is UNIX SECONDS as a STRING (Instagram sends ms as a number) —
 *   treating them alike dates every message to 1970.
 *
 * Non-text messages are reported in `skipped` rather than dropped silently or,
 * worse, ingested as empty text — an image would otherwise become a blank
 * customer message the AI then tries to answer.
 */
export function parseWhatsAppWebhook(payload: unknown): {
  events: WhatsAppInboundEvent[];
  skipped: WhatsAppSkipped[];
} {
  const p = payload as {
    object?: string;
    entry?: Array<{
      id?: string;
      changes?: Array<{
        field?: string;
        value?: {
          metadata?: { phone_number_id?: string };
          contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
          messages?: Array<{
            from?: string;
            id?: string;
            timestamp?: string | number;
            type?: string;
            text?: { body?: string };
          }>;
        };
      }>;
    }>;
  };
  const events: WhatsAppInboundEvent[] = [];
  const skipped: WhatsAppSkipped[] = [];
  if (p?.object !== "whatsapp_business_account" || !Array.isArray(p.entry)) {
    return { events, skipped };
  }

  for (const entry of p.entry) {
    const wabaId = entry?.id ?? "";
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      // `statuses` payloads (delivered/read receipts) carry no `messages`.
      if (!phoneNumberId || !Array.isArray(value?.messages)) continue;

      // wa_id → profile name, so the contact gets a human label.
      const names = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c?.wa_id && c.profile?.name) names.set(c.wa_id, c.profile.name);
      }

      for (const m of value.messages) {
        if (!m?.id || !m.from) continue;
        if (m.type !== "text") {
          skipped.push({ mid: m.id, type: m.type ?? "unknown" });
          continue;
        }
        const text = m.text?.body;
        if (typeof text !== "string" || !text.trim()) {
          skipped.push({ mid: m.id, type: "text:empty" });
          continue;
        }
        const seconds = typeof m.timestamp === "string" ? Number(m.timestamp) : m.timestamp;
        events.push({
          phoneNumberId,
          wabaId,
          waId: m.from,
          mid: m.id,
          text,
          senderName: names.get(m.from),
          receivedAt:
            Number.isFinite(seconds) && seconds ? new Date(Number(seconds) * 1000) : new Date(),
        });
      }
    }
  }
  return { events, skipped };
}

/** Raised when Meta rejects a send because the 24-hour service window closed. */
export class OutsideServiceWindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutsideServiceWindowError";
  }
}

/**
 * Send a plain-text WhatsApp message. `to` is the sender's wa_id from inbound.
 *
 * Meta only allows free-form replies within 24 hours of the customer's last
 * message; outside that window a pre-approved template is required. We have no
 * templates configured, so that failure is surfaced explicitly rather than
 * looking like a generic network error.
 */
export async function sendWhatsAppMessage(
  creds: WhatsAppCredentials,
  to: string,
  text: string,
): Promise<{ mid: string }> {
  const res = await fetch(`${WA_GRAPH}/${encodeURIComponent(creds.phoneNumberId)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // 131047 = "Message failed to send because more than 24 hours have passed".
    if (detail.includes("131047") || detail.includes("re-engagement message")) {
      throw new OutsideServiceWindowError(
        "WhatsApp's 24-hour reply window has closed for this conversation; " +
          "an approved message template is required to reply.",
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new ReconnectRequiredError(`WhatsApp auth failed: ${res.status}`);
    }
    throw new Error(`WhatsApp send failed: ${res.status} ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as { messages?: Array<{ id?: string }> };
  const mid = data.messages?.[0]?.id;
  if (!mid) throw new Error("WhatsApp send returned no message id");
  return { mid };
}
