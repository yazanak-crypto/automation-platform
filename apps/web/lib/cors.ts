import { NextResponse } from "next/server";

// CORS for the two public webchat routes — the ONLY unauthenticated surface.
// The Access-Control-Allow-Origin is echoed only for origins on the channel's
// allowlist; everything else gets a plain 403 with no CORS headers.

export function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function corsJson(data: unknown, origin: string, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders(origin) });
}

export function preflight(origin: string) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
