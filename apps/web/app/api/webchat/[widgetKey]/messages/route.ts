import {
  appendVisitorMessage,
  getActiveChannelByWidgetKey,
  getOrCreateOpenConversation,
  markChannelConnected,
  originAllowed,
  upsertVisitorContact,
} from "@platform/channels";
import { recordBlockedOrigin, takeLimit, webchatDraftQueue } from "@platform/core";
import { webchatInboundSchema } from "@platform/schemas";
import { type NextRequest } from "next/server";
import { corsJson, forbidden, preflight } from "@/lib/cors";

async function guard(req: NextRequest, widgetKey: string) {
  const channel = await getActiveChannelByWidgetKey(widgetKey);
  if (!channel) return null;
  const origin = req.headers.get("origin");
  if (!originAllowed(origin, channel.config.allowedOrigins)) {
    await recordBlockedOrigin(widgetKey, origin);
    return null;
  }
  return { channel, origin: origin! };
}

export async function OPTIONS(
  req: NextRequest,
  { params }: { params: Promise<{ widgetKey: string }> },
) {
  const ctx = await guard(req, (await params).widgetKey);
  return ctx ? preflight(ctx.origin) : forbidden();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ widgetKey: string }> },
) {
  const ctx = await guard(req, (await params).widgetKey);
  if (!ctx) return forbidden();
  const { channel, origin } = ctx;

  const parsed = webchatInboundSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return corsJson({ error: "Invalid message" }, origin, 400);
  const { visitorId, body, clientMessageId, email } = parsed.data;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const allowed =
    (await takeLimit(`wc:v:${visitorId}`, 20, 3600)) &&
    (await takeLimit(`wc:ip:${ip}`, 100, 3600)) &&
    (await takeLimit(`wc:ws:${channel.workspaceId}`, 500, 86400));
  if (!allowed) return corsJson({ error: "Too many messages" }, origin, 429);

  const contact = await upsertVisitorContact(channel.workspaceId, visitorId, email);
  const conversation = await getOrCreateOpenConversation(
    channel.workspaceId,
    channel.id,
    contact.id,
  );
  const { message, duplicate } = await appendVisitorMessage({
    workspaceId: channel.workspaceId,
    conversationId: conversation.id,
    body,
    clientMessageId,
  });

  if (!duplicate) {
    await webchatDraftQueue().add(
      "draft",
      {
        workspaceId: channel.workspaceId,
        conversationId: conversation.id,
        messageId: message.id,
      },
      { jobId: `draft-${message.id}`, attempts: 2, removeOnComplete: { age: 3600 }, removeOnFail: { age: 86400 } },
    );
    await markChannelConnected(channel.id);
  }

  return corsJson({ conversationId: conversation.id, messageId: message.id }, origin, 201);
}

export const dynamic = "force-dynamic";
