/**
 * The Operator System palette, as literal colors.
 *
 * globals.css is the single source of truth for design tokens — everything in
 * the app should reach them through Tailwind classes (`text-ink`, `bg-hover`)
 * or `var(--text)`. This file is the ONE exception, and exists for a specific
 * reason: Clerk's `appearance.variables` are parsed by clerk-js at runtime to
 * derive alpha ramps (hover, disabled, borders). It runs that parser on the
 * literal string, so `var(--text)` is unparseable there and silently falls
 * back to Clerk's light defaults — which is exactly how the account menu ended
 * up painting near-black labels on our charcoal popover.
 *
 * Keep these values in lockstep with the `:root` block in app/globals.css.
 */
export const PALETTE = {
  /** --bg — void */
  void: "#0b0b0d",
  /** --bg-raised flattened over --bg. Clerk needs an opaque color here. */
  charcoal: "#131315",
  /** --text — cream */
  cream: "#f4f4f5",
  /** --text-2 — muted cream */
  creamMuted: "#a1a1aa",
  /** --text-3 */
  creamFaint: "#6b6b74",
  /** --brass — identity accent */
  brass: "#d4b872",
} as const;
