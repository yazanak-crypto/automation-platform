import {
  getActiveChannelByWidgetKey,
  getVisitorView,
  isValidVisitorId,
  markChannelConnected,
  originAllowed,
} from "@platform/channels";
import { recordBlockedOrigin, takeLimit } from "@platform/core";
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
  { params }: { params: Promise<{ widgetKey: string; visitorId: string }> },
) {
  const ctx = await guard(req, (await params).widgetKey);
  return ctx ? preflight(ctx.origin) : forbidden();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ widgetKey: string; visitorId: string }> },
) {
  const { widgetKey, visitorId } = await params;
  const ctx = await guard(req, widgetKey);
  if (!ctx) return forbidden();
  if (!isValidVisitorId(visitorId)) return forbidden();

  if (!(await takeLimit(`wc:poll:${visitorId}`, 60, 60))) {
    return corsJson({ error: "Too fast" }, ctx.origin, 429);
  }

  await markChannelConnected(ctx.channel.id);
  const view = await getVisitorView(ctx.channel.workspaceId, ctx.channel.id, visitorId);
  return corsJson(
    {
      status: view.conversation?.status ?? null,
      messages: view.messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.body,
      })),
    },
    ctx.origin,
  );
}

export const dynamic = "force-dynamic";
