import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { BRAND, BRAND_TAGLINE } from "@/lib/brand";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

// Favicon: brass operator dot — self-contained SVG, no asset pipeline.
const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0B0B0D"/><circle cx="16" cy="16" r="6.5" fill="none" stroke="#D4B872" stroke-width="2.5"/><circle cx="16" cy="16" r="2" fill="#D4B872"/></svg>`,
  );

export const metadata: Metadata = {
  title: { default: BRAND, template: `%s · ${BRAND}` },
  description: BRAND_TAGLINE,
  icons: { icon: FAVICON },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
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
