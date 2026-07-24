import { ImageResponse } from "next/og";
import { BRAND, BRAND_TAGLINE } from "@/lib/brand";

// Code-generated link-preview image (Twitter/Slack/iMessage/LinkedIn). No design
// asset needed — rendered on brand at build/request time.
export const alt = `${BRAND} — AI that runs your business conversations`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "96px",
          background: "#0b0b0d",
          color: "#f5f5f4",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <svg
            width={132}
            height={110}
            viewBox="0 0 48 40"
            fill="none"
            stroke="#d4b872"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginRight: 32 }}
          >
            <path d="M5 20 H44" />
            <path d="M27 20 L8 7" />
            <path d="M27 20 L8 33" />
          </svg>
          <span style={{ fontSize: 88, fontWeight: 700, letterSpacing: "-0.03em" }}>{BRAND}</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 34,
            lineHeight: 1.35,
            color: "#a1a1aa",
            maxWidth: 900,
          }}
        >
          {BRAND_TAGLINE}
        </div>
      </div>
    ),
    { ...size },
  );
}
