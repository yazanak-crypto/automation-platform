import { currentUser } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

// Founder-only internal admin (Decision 011). Gated by FOUNDER_EMAILS env.
// notFound() (not 403) so the route's existence isn't advertised.

export default async function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  const allowlist = (process.env.FOUNDER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const emails = user?.emailAddresses.map((e) => e.emailAddress.toLowerCase()) ?? [];
  if (allowlist.length === 0 || !emails.some((e) => allowlist.includes(e))) {
    notFound();
  }
  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-8 border-b border-neutral-800 pb-4">
        <h1 className="text-xl font-semibold">Internal admin</h1>
        <p className="text-sm text-neutral-500">Founder-only. Read-only.</p>
      </header>
      {children}
    </div>
  );
}
