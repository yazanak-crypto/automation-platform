"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/conversations", label: "Conversations" },
  { href: "/brain", label: "Business Brain" },
  { href: "/channels", label: "Channels" },
  { href: "/billing", label: "Billing" },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="mt-8 flex flex-col gap-1">
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-md px-2 py-1.5 text-sm transition-colors duration-150 ${
              active
                ? "bg-neutral-800/80 text-white"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
