import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import NavLinks from "./nav-links";

// The app shell (audit P1-6): one persistent sidebar for every product page.
// Calm, minimal, Linear-grade restraint — no decoration, just orientation.

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 flex w-52 flex-col border-r border-neutral-800/80 px-4 py-5 max-md:hidden">
        <Link href="/dashboard" className="px-2 text-sm font-semibold tracking-tight">
          Platform
        </Link>
        <NavLinks />
        <div className="mt-auto px-2">
          <UserButton />
        </div>
      </aside>
      <div className="w-full md:pl-52">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-neutral-800/80 px-4 py-3 md:hidden">
          <Link href="/dashboard" className="text-sm font-semibold">Platform</Link>
          <UserButton />
        </header>
        {children}
      </div>
    </div>
  );
}
