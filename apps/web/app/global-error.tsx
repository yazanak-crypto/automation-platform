"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Last-resort boundary: catches errors thrown by the ROOT layout itself, which
 * `error.tsx` cannot reach. It replaces the whole document, so it must render
 * its own <html> and <body> and cannot use anything from the layout — no fonts,
 * no globals.css, no shared components. Styles are inline for that reason.
 *
 * Added because the build warned that React render errors were going
 * unreported, which is the same class of silence this whole change is about.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: "global" } });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          // Literal values: globals.css is not loaded in this boundary, so the
          // design tokens do not exist here. Mirrors --bg and --text.
          background: "#0b0b0d",
          color: "#f4f4f5",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        }}
      >
        <p style={{ fontSize: "1.5rem", fontWeight: 600 }}>Something went wrong</p>
        <p style={{ fontSize: "0.875rem", color: "#a1a1aa", margin: 0 }}>
          A hiccup on our end — your data is safe.
        </p>
        {error.digest && (
          <p style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px", color: "#6b6b74" }}>
            Reference: {error.digest}
          </p>
        )}
        <a
          href="/"
          style={{
            background: "#fff",
            color: "#000",
            padding: "0.625rem 1.25rem",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Reload
        </a>
      </body>
    </html>
  );
}
