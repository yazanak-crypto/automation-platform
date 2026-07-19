import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Public surfaces (no auth). The guided showroom /demo is public — it IS the
// pre-signup dashboard a visitor sees (spec §2/§3).
const isPublicRoute = createRouteMatcher([
  "/",
  "/demo(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webchat(.*)",
  "/widget.js",
  "/api/webhooks/stripe",
]);

const isDashboardRoute = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const { userId } = await auth();

  // Spec §2: an unauthenticated visitor never lands on the real dashboard —
  // they're routed to the guided showroom instead of a bare sign-in wall.
  // (Onboarding/subscription gating happens in the app layout, which has DB
  //  access; the edge can't query Postgres.)
  if (!userId && isDashboardRoute(req)) {
    return NextResponse.redirect(new URL("/demo", req.url));
  }

  await auth.protect();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
