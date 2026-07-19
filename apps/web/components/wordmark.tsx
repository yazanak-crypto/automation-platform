import Link from "next/link";
import { BRAND } from "@/lib/brand";

/** The wordmark: name + brass operator dot. One identity element, everywhere. */
export function Wordmark({ href = "/dashboard", size = "sm" }: { href?: string; size?: "sm" | "lg" }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-baseline gap-[3px] font-semibold tracking-[-0.01em] ${
        size === "lg" ? "text-lg" : "text-[15px]"
      }`}
    >
      {BRAND}
      <span
        className="inline-block h-[5px] w-[5px] translate-y-[-1px] rounded-full"
        style={{ background: "var(--brass)" }}
      />
    </Link>
  );
}
