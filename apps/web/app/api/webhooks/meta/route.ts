import {
  ingestInstagramMessage,
  ingestWhatsAppMessage,
  parseInstagramWebhook,
  parseWhatsAppWebhook,
  resolveInstagramChannel,
  resolveWhatsAppChannel,
  verifyMetaSignature,
} from "@platform/channels";
import { after, NextResponse } from "next/server";
import { enqueueDraftJob } from "@/lib/jobs";

// Meta webhook receiver (Instagram + WhatsApp; Facebook reuses this route).
// Inbound is push-based: Meta POSTs events here. We verify the payload
// signature with the app secret, normalize, and feed new messages into the
// SAME draft pipeline web chat and email use. No Meta-specific parsing lives
// here — that stays in the channels package.

export const dynamic = "force-dynamic";
// Signature verification needs the exact raw bytes — never let Next parse/cache.
export const runtime = "nodejs";

/** Subscription handshake: Meta calls GET with a challenge to verify the URL. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const appSecret = process.env.META_APP_SECRET;
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!appSecret || !verifyMetaSignature(raw, signature, appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const object = (payload as { object?: string })?.object;

  // Ack first, then ingest. `after()` (not a bare floating promise) is what
  // keeps the work alive once the response is sent — on serverless the sandbox
  // can be frozen the instant a handler returns, so an un-awaited promise is
  // silently lost. Meta treats a slow response as a failure and redelivers, and
  // it never retries a 200 — so anything thrown in here must not be swallowed
  // in a way that loses a customer message.
  if (object === "whatsapp_business_account") {
    after(() => processWhatsApp(payload));
  } else if (object === "instagram") {
    after(() => processInstagram(payload));
  }

  return NextResponse.json({ received: true });
}

async function processWhatsApp(payload: unknown): Promise<void> {
  const { events, skipped } = parseWhatsAppWebhook(payload);
  for (const s of skipped) {
    // Visible on purpose: an image or voice note the AI can't read is a real
    // customer waiting, not a no-op.
    console.warn(`[meta.webhook] whatsapp: unsupported message ${s.mid} (${s.type})`);
  }

  // Group by business number so we resolve each channel once per batch.
  const byNumber = new Map<string, typeof events>();
  for (const e of events) {
    const bucket = byNumber.get(e.phoneNumberId);
    if (bucket) bucket.push(e);
    else byNumber.set(e.phoneNumberId, [e]);
  }

  for (const [phoneNumberId, group] of byNumber) {
    const resolved = await resolveWhatsAppChannel(phoneNumberId);
    if (!resolved) {
      console.warn(`[meta.webhook] whatsapp: no active channel for number ${phoneNumberId}`);
      continue;
    }
    for (const event of group) {
      try {
        const ingested = await ingestWhatsAppMessage(resolved.channel, event);
        // `duplicate` = Meta redelivered one we already answered. Re-enqueueing
        // would draft (and possibly auto-send) a second reply.
        if (ingested && !ingested.duplicate) {
          await enqueueDraftJob({
            workspaceId: resolved.channel.workspaceId,
            conversationId: ingested.conversationId,
            messageId: ingested.messageId,
          });
        }
      } catch (err) {
        console.error(`[meta.webhook] whatsapp ingest failed for ${event.mid}:`, err);
      }
    }
  }
}

async function processInstagram(payload: unknown): Promise<void> {
  const events = parseInstagramWebhook(payload);
  const byAccount = new Map<string, typeof events>();
  for (const e of events) {
    const bucket = byAccount.get(e.igAccountId);
    if (bucket) bucket.push(e);
    else byAccount.set(e.igAccountId, [e]);
  }

  for (const [igAccountId, group] of byAccount) {
    const resolved = await resolveInstagramChannel(igAccountId);
    if (!resolved) continue; // not ours / disabled — ack silently
    for (const event of group) {
      try {
        const ingested = await ingestInstagramMessage(resolved.channel, event);
        if (ingested && !ingested.duplicate) {
          await enqueueDraftJob({
            workspaceId: resolved.channel.workspaceId,
            conversationId: ingested.conversationId,
            messageId: ingested.messageId,
          });
        }
      } catch (err) {
        // Log and keep going — one bad event shouldn't abort the whole batch.
        console.error(`[meta.webhook] ingest failed for ${igAccountId}:`, err);
      }
    }
  }
}
