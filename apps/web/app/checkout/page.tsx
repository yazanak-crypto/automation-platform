import Link from "next/link";
import { redirect } from "next/navigation";
import {
  claimEligibility,
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

  const [eligibility, last] = await Promise.all([
    claimEligibility(ctx.workspace.id),
    latestPayment(ctx.workspace.id),
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
              About {Math.round(details.monthlyCredits / 4).toLocaleString()} customer
              conversations / month
            </p>
          </div>
          <div className="text-right">
            <p className="tnum text-2xl font-semibold">${details.priceMonthlyUsd}</p>
            {/* "fresh USD" is the operative term for a Lebanese transfer. */}
            <p className="text-[12px] font-medium text-brass">fresh USD</p>
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
          amountUsd={details.priceMonthlyUsd}
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
