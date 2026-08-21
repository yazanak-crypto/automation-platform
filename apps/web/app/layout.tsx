import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { BRAND, BRAND_TAGLINE } from "@/lib/brand";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

// Icons are FILE-CONVENTION now, not metadata:
//
//   app/favicon.ico    16-256px, for legacy browsers and bookmark bars
//   app/icon0.svg      vector — crisp at 16px, 318 bytes
//   app/icon1.png      512px raster fallback
//   app/apple-icon.png 180px, iOS home screen (iOS applies its own rounding)
//
// NUMBERED because Next emits only ONE file per icon base name: with both
// icon.svg and icon.png present it picked the PNG and dropped the SVG from
// <head> entirely. The numeric suffix makes them siblings rather than rivals,
// and the order puts the vector first.
//
// There used to be an inline `icons: { icon: <data URI> }` here. Explicit
// metadata.icons OVERRIDES the file convention entirely, so leaving it in place
// would have silently ignored every file above — the tab would still render the
// hand-written SVG. Deleted rather than extended: one source of truth.

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: `${BRAND} — AI that runs your business conversations`, template: `%s · ${BRAND}` },
  description: BRAND_TAGLINE,
  openGraph: {
    title: `${BRAND} — AI that runs your business conversations`,
    description: BRAND_TAGLINE,
    siteName: BRAND,
    type: "website",
  },
  twitter: { card: "summary_large_image", title: BRAND, description: BRAND_TAGLINE },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      // After sign-up/in, land in the app — the (app) layout routes new users
      // to onboarding automatically. Avoids the dead hop back to marketing.
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      appearance={{
        variables: {
          colorBackground: "#131315",
          colorText: "#f4f4f5",
          colorPrimary: "#d4b872",
          colorInputBackground: "#0b0b0d",
          colorInputText: "#f4f4f5",
          borderRadius: "10px",
        },
      }}
    >
      <html lang="en" className={inter.variable}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
