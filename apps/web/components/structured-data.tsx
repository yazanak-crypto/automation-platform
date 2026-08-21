import { BRAND, BRAND_TAGLINE } from "@/lib/brand";

/**
 * Organization structured data (JSON-LD) for the homepage.
 *
 * This is what lets Google associate a logo with the brand and show it in
 * search results and the knowledge panel. Requirements it has to satisfy:
 *
 *   • it must be on the SITE HOME PAGE, not on every page — Google reads
 *     Organization markup from the homepage for logo purposes
 *   • `url` and `logo` must be ABSOLUTE, so they are built from
 *     NEXT_PUBLIC_APP_URL exactly like sitemap.ts and robots.ts do
 *   • the logo must be crawlable at a STABLE path. It deliberately points at
 *     /logo.png in public/ rather than the app/icon.png file convention:
 *     Next fingerprints convention icons (/icon.png?hash), and a URL that
 *     changes on every build is not something Google can rely on.
 *
 * Rendered as a plain <script> tag rather than next/script because it is
 * static data that must be in the initial HTML for a crawler to see it.
 */

const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

const organization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: BRAND,
  url: base,
  logo: `${base}/logo.png`,
  description: BRAND_TAGLINE,
};

/**
 * `<` is escaped so a value can never terminate the script element early.
 * Everything here is a build-time constant today, but this is the kind of
 * thing that quietly becomes user-supplied later.
 */
function serialize(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function OrganizationJsonLd() {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger -- JSON-LD has no other injection point
      dangerouslySetInnerHTML={{ __html: serialize(organization) }}
    />
  );
}
