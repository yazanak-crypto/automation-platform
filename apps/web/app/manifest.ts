import type { MetadataRoute } from "next";
import { BRAND, BRAND_TAGLINE } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND,
    short_name: BRAND,
    description: BRAND_TAGLINE,
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0b0b0d",
    theme_color: "#0b0b0d",
    icons: [
      // /icon0.svg, not /icon.svg — the file convention was renamed so the SVG
      // and PNG stop shadowing each other in <head>.
      { src: "/icon0.svg", type: "image/svg+xml", sizes: "any" },
      // Android home-screen install needs a raster icon; "maskable" lets the
      // launcher crop to whatever shape the device uses without clipping the
      // mark, which is why this one is the rounded artwork.
      { src: "/icon-512-maskable.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
      { src: "/logo.png", type: "image/png", sizes: "512x512", purpose: "any" },
    ],
  };
}
