import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { BRAND, BRAND_TAGLINE } from "@/lib/brand";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

// Favicon: the Ovanth mark — self-contained SVG, no asset pipeline. Kept in sync
// with app/icon.svg and the LogoMark component.
const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0B0B0D"/><g stroke="#D4B872" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M8 16 H25"/><path d="M18.5 16 L9 9"/><path d="M18.5 16 L9 23"/></g></svg>`,
  );

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: `${BRAND} — AI that runs your business conversations`, template: `%s · ${BRAND}` },
  description: BRAND_TAGLINE,
  icons: { icon: FAVICON },
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
