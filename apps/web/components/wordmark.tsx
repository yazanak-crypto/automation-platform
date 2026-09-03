import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { LogoMark } from "./logo-mark";

/** The primary lockup: brass mark + wordmark. One identity element, everywhere. */
export function Wordmark({ href = "/dashboard", size = "sm" }: { href?: string; size?: "sm" | "lg" }) {
  return (
    <Link
      href={href}
      aria-label={BRAND}
      className={`inline-flex items-center font-semibold tracking-[-0.01em] ${
        size === "lg" ? "gap-2.5 text-lg" : "gap-2 text-[15px]"
      }`}
    >
      {/* Brass mark (text-brass drives currentColor); wordmark keeps ink color.
          Heights bumped 18->22 / 22->27 when the mark went from three strokes
          to five. The new viewBox is square (48x48, was 48x40) and its stroke
          is finer (3.55, was 4), so the OLD numbers rendered a visibly lighter,
          smaller mark. These are matched by eye for equal optical weight, not
          by matching stroke width in px: the extra pair of diagonals carries
          mass of its own, so the stroke-matching height (24) overshot and read
          heavier than the mark it replaced. */}
      <LogoMark className={`w-auto shrink-0 text-brass ${size === "lg" ? "h-[27px]" : "h-[22px]"}`} />
      <span>{BRAND}</span>
    </Link>
  );
}
