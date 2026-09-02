import Link from "next/link";
import { redirect } from "next/navigation";
import {
  amountDueFor,
  claimEligibility,
  conversationsFromCredits,
  isPayablePlan,
  latestPayment,
  paymentDetails,
  paymentDetailsConfigured,
  PLANS,
  PROVISIONAL_DAYS,
  referenceCodeFor,
} from "@platform/core";
import { Wordmark } from "@/components/wordmark";
import { LEGAL } from "@/lib/legal";
import { requireWorkspace } from "@/lib/workspace";
import CheckoutForm from "./CheckoutForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout" };

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const ctx = await requireWorkspace();
  if (!ctx) redirect("/sign-in");

  // Plan comes from the query string, so it is validated against the catalog
  // here and the price is read from PLANS — never from the client.
  const { plan: planParam } = await searchParams;
  if (!planParam || !isPayablePlan(planParam)) redirect("/billing");
  const plan = planParam;
  const details = PLANS[plan];

  const [eligibility, last, due] = await Promise.all([
    claimEligibility(ctx.workspace.id),
    latestPayment(ctx.workspace.id),
    // Server-side: monthly, plus the one-time setup fee on the first paid month.
    amountDueFor(ctx.workspace.id, plan),
  ]);
  const pay = paymentDetails();
  const referenceCode = referenceCodeFor(ctx.user.id);

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="mb-8 flex items-center justify-between">
        <Wordmark href="/dashboard" />
        <Link href="/billing" className="text-[13px] text-ink-3 hover:text-ink-2">
          ← Back to plans
        </Link>
      </div>

      <h1 className="text-2xl font-semibold tracking-[-0.01em]">Complete your payment</h1>

      {/* Plan + price */}
      <section className="mt-6 rounded-xl border border-line bg-raised p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="font-medium">{details.name}</p>
            <p className="mt-0.5 text-[13px] text-ink-2">
              About {conversationsFromCredits(details.monthlyCredits).toLocaleString()} customer
              conversations / month
            </p>
          </div>
          {/* The headline number is what is DUE TODAY, not the monthly price.
              This showed "$39 / per month / + $49 one-time setup", and the
              leading "+" reads as additive — $88 — while the form below it
              asks for $49. The setup fee REPLACES month one; it is never
              charged alongside it (amountDueFor: totalUsd = setupFeeUsd). */}
          <div className="text-right">
            <p className="tnum text-2xl font-semibold">${due.totalUsd}</p>
            {due.includesSetupFee ? (
              <>
                <p className="text-[12px] text-ink-3">due today</p>
                <p className="mt-1 text-[12.5px] text-ink-2">
                  covers setup and your first month
                </p>
                <p className="text-[12.5px] text-ink-2">
                  then ${due.monthlyUsd}/month from day 31
                </p>
              </>
            ) : (
              <p className="text-[12px] text-ink-3">per month</p>
            )}
          </div>
        </div>
      </section>

      {/* Human option first — some owners want to talk before sending money. */}
      {pay.whatsappNumber && (
        <p className="mt-4 rounded-lg border border-line px-4 py-3 text-[13px] text-ink-2">
          Prefer to arrange payment directly?{" "}
          <a
            href={`https://wa.me/${pay.whatsappNumber.replace(/[^0-9]/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-ink underline underline-offset-2"
          >
            Message us on WhatsApp
          </a>{" "}
          — we&apos;re happy to walk you through it.
        </p>
      )}

      {last?.status === "CLAIMED" ? (
        <section className="mt-6 rounded-xl border border-line border-l-2 border-l-wait bg-raised p-5">
          <p className="font-medium">We&apos;re checking your payment</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            You submitted a payment on {last.createdAt.toLocaleDateString()} with reference{" "}
            <code className="text-ink">{last.claimedReference}</code>. We&apos;ll confirm it
            shortly — you don&apos;t need to send anything again.
          </p>
          <Link
            href="/dashboard"
            className="press-glow mt-4 inline-block rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
          >
            Go to dashboard
          </Link>
        </section>
      ) : !paymentDetailsConfigured() ? (
        <section className="mt-6 rounded-xl border border-line p-5">
          <p className="text-sm text-ink-2">
            Payment details aren&apos;t set up yet. Please contact us at{" "}
            <a className="underline underline-offset-2" href={`mailto:${LEGAL.contactEmail}`}>
              {LEGAL.contactEmail}
            </a>{" "}
            and we&apos;ll arrange it with you directly.
          </p>
        </section>
      ) : (
        <CheckoutForm
          plan={plan}
          monthlyUsd={due.monthlyUsd}
          setupFeeUsd={due.setupFeeUsd}
          totalUsd={due.totalUsd}
          referenceCode={referenceCode}
          bankName={pay.bankName}
          bankAccountName={pay.bankAccountName}
          bankIban={pay.bankIban}
          whishNumber={pay.whishNumber}
          grantsProvisional={eligibility.grantsProvisional}
          provisionalDays={PROVISIONAL_DAYS}
        />
      )}
    </main>
  );
}
