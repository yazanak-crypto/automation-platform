/**
 * The Ovanth mark: five strokes converging into one — conversations, handled.
 * Uses `currentColor` so the parent controls the color (brass in the primary
 * lockup, cream/white reversed, black/white monochrome).
 *
 * GEOMETRY — normalised 2026-09-03 from public/logo.png, which was the only
 * accurate rendering of the mark. The vector previously shipped here had just
 * THREE strokes (one horizontal, two diagonals): the inner pair was missing
 * entirely, so the site and the OG image drew a different logo from the
 * favicon. Measured from the raster at 512px:
 *
 *   stroke width 27px · tips all on one x · slopes ±0.797 outer, ±0.355 inner
 *
 * The raster has TWO apexes — the outer V converges at x≈260 and the inner V
 * at x≈278. This vector normalises them to ONE at x=24.7, chosen because it is
 * where the outer slope lands on the measured ±0.797 exactly; the outer V is
 * the dominant silhouette, so the residual falls on the inner pair (±0.396 vs
 * a measured ±0.355). Pixel IoU against the raster is 88.4%.
 *
 * Five separate paths, each starting AT THE APEX. Do not merge them and do not
 * wrap them in a transformed <g>: the reveal animation (components/logo-
 * reveal.tsx) animates each stroke along its own axis and needs them
 * individually targetable, with the apex as the shared transform origin.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={3.55}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M24.7 24 H43" />
      <path d="M24.7 24 L5 8.3" />
      <path d="M24.7 24 L5 16.2" />
      <path d="M24.7 24 L5 31.8" />
      <path d="M24.7 24 L5 39.7" />
    </svg>
  );
}
