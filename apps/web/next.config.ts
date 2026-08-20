import { config } from "dotenv";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// Env policy: platform/.env (monorepo root) is the single source of truth.
// Next only auto-reads .env from apps/web — load the root one explicitly.
// Values already in the environment (e.g. Vercel dashboard vars) win.
config({ path: resolve(__dirname, "../../.env") });

const isDev = process.env.NODE_ENV !== "production";

// ── Content-Security-Policy ─────────────────────────────────────────────────
// Third-party origins we legitimately load or talk to. Keeping them explicit
// (rather than a blanket https:) is the whole point of the policy.
//   • Clerk        — auth widgets, session API, telemetry, avatars
//   • Cloudflare   — Turnstile bot-check embedded by Clerk
//   • Nango        — client SDK posts to api.nango.dev during channel connect
//   • Stripe       — checkout/billing (defensive: covers Elements if added)
//   • Sentry       — client error reporting (no-op if DSN unset)
// Custom Clerk domain: a PRODUCTION Clerk instance serves clerk-js from
// clerk.<your-domain>, which `*.clerk.com` does NOT match. Without this the
// script is CSP-blocked and every Clerk button silently does nothing.
// Set CLERK_FRONTEND_API_DOMAIN=clerk.ovanth.com (bare host). Leave unset on a
// development instance, which already resolves under *.clerk.accounts.dev.
const clerkCustomDomain = process.env.CLERK_FRONTEND_API_DOMAIN
  ?.trim()
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");
const clerk = [
  "https://*.clerk.accounts.dev",
  "https://*.clerk.com",
  ...(clerkCustomDomain ? [`https://${clerkCustomDomain}`] : []),
];
// Paddle Checkout: script from the CDN, the overlay itself in an iframe, and
// API calls from the browser. Both sandbox and production hosts are listed so a
// sandbox test does not fail with a blank overlay and no error — a missing CSP
// entry shows up as "the checkout never opens", with nothing in the logs.
const paddle = {
  script: ["https://cdn.paddle.com", "https://sandbox-cdn.paddle.com"],
  frame: ["https://buy.paddle.com", "https://sandbox-buy.paddle.com", "https://checkout.paddle.com", "https://sandbox-checkout.paddle.com"],
  connect: ["https://api.paddle.com", "https://sandbox-api.paddle.com", "https://checkout-service.paddle.com", "https://sandbox-checkout-service.paddle.com"],
};

const csp = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'self'`,
  `form-action 'self' https://checkout.stripe.com`,
  // 'unsafe-inline' keeps Clerk/Next/styled-jsx working without a nonce
  // pipeline; 'unsafe-eval' is dev-only (React Refresh). No dangerouslySetInnerHTML
  // exists in the app, so residual inline-script risk is low.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${clerk.join(" ")} https://challenges.cloudflare.com https://js.stripe.com ${paddle.script.join(" ")}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https://img.clerk.com`,
  `font-src 'self' data:`,
  `worker-src 'self' blob:`,
  `connect-src 'self' ${clerk.join(" ")} https://clerk-telemetry.com https://api.nango.dev https://api.stripe.com ${paddle.connect.join(" ")} https://*.sentry.io https://*.ingest.sentry.io`,
  `frame-src 'self' ${clerk.join(" ")} https://challenges.cloudflare.com https://js.stripe.com https://hooks.stripe.com ${paddle.frame.join(" ")}`,
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // 2 years, subdomains, preload-eligible. Ignored by browsers over plain HTTP
  // (localhost), so it's safe to send everywhere.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@platform/db", "@platform/ai", "@platform/brain"],
  // BullMQ loads its Lua command files via dynamic require() — webpack can't
  // statically analyze that and emits "Critical dependency: the request of a
  // dependency is an expression". Keep it (and its Redis client) as runtime
  // externals on the server so Next require()s them from node_modules instead
  // of bundling. Server routes run in the Node runtime, so this is safe.
  serverExternalPackages: ["bullmq", "ioredis"],
  // Don't advertise the framework.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
