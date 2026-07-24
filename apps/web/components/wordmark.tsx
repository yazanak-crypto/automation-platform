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
      {/* Brass mark (text-brass drives currentColor); wordmark keeps ink color. */}
      <LogoMark className={`w-auto shrink-0 text-brass ${size === "lg" ? "h-[22px]" : "h-[18px]"}`} />
      <span>{BRAND}</span>
    </Link>
  );
}
