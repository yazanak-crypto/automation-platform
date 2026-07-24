import {
  ingestInstagramMessage,
  parseInstagramWebhook,
  resolveInstagramChannel,
  verifyMetaSignature,
} from "@platform/channels";
import { NextResponse } from "next/server";
import { enqueueDraftJob } from "@/lib/jobs";

// Meta webhook receiver (Instagram first; WhatsApp/Facebook reuse this route).
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

  const events = parseInstagramWebhook(payload);
  // Group by IG account id so we resolve each channel once per batch.
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
        // Log and keep going — Meta redelivers, and one bad event shouldn't
        // 500 the whole batch (which would replay the good ones too).
        console.error(`[meta.webhook] ingest failed for ${igAccountId}:`, err);
      }
    }
  }

  // Always 200 once the signature is valid — Meta retries non-2xx aggressively.
  return NextResponse.json({ received: true });
}
