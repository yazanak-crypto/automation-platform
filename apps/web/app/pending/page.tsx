import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/wordmark";
import { BRAND } from "@/lib/brand";
import { LEGAL } from "@/lib/legal";
import { requireActiveWorkspace } from "@/lib/activation";

export const dynamic = "force-dynamic";

export const metadata = { title: "Account activation" };

/** Holding page for signed-up accounts awaiting manual activation. */
export default async function PendingPage() {
  const { ctx, active } = await requireActiveWorkspace();
  if (!ctx) redirect("/sign-in");
  // Already activated — don't strand them here.
  if (active) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 p-8 text-center">
      <Wordmark size="lg" href="/pending" />

      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">
          We&apos;re setting up your account
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          Thanks for signing up. {BRAND} is onboarding businesses one at a time so every account
          gets a proper setup. We&apos;ll email <strong>{ctx.user.email}</strong> the moment
          yours is ready.
        </p>
      </div>

      <div className="w-full rounded-xl border border-line bg-raised p-5 text-left">
        <p className="text-[13px] font-medium">What happens next</p>
        <ol className="mt-2 space-y-1.5 text-[13px] text-ink-2">
          <li>1. We review your signup (usually within one business day).</li>
          <li>2. Your account is activated and you get an email.</li>
          <li>3. You sign back in and connect your first channel.</li>
        </ol>
      </div>

      <p className="text-[12.5px] text-ink-3">
        Questions? Email{" "}
        <a
          className="underline underline-offset-2 hover:text-ink-2"
          href={`mailto:${LEGAL.contactEmail}`}
        >
          {LEGAL.contactEmail}
        </a>
      </p>

      <div className="flex items-center gap-3 text-[12.5px] text-ink-3">
        <UserButton />
        <span>Signed in as {ctx.user.email}</span>
      </div>
    </main>
  );
}
