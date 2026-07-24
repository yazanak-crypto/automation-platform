/**
 * The Ovanth mark: three strokes converging into one — conversations, handled.
 * Uses `currentColor` so the parent controls the color (brass in the primary
 * lockup, cream/white reversed, black/white monochrome).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 40"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 20 H44" />
      <path d="M27 20 L8 7" />
      <path d="M27 20 L8 33" />
    </svg>
  );
}
