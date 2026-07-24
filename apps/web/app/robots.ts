import type { MetadataRoute } from "next";

const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/demo", "/privacy", "/terms", "/refunds"],
        // Keep the authenticated app and API out of search indexes.
        disallow: ["/dashboard", "/settings", "/onboarding", "/internal", "/api/", "/conversations", "/brain", "/billing", "/channels", "/marketplace", "/analytics"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
