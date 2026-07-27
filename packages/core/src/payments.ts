import { db, payments, users, workspaces } from "@platform/db";
import { and, desc, eq, ne } from "drizzle-orm";
import { PLANS, type PlanId } from "./billing";

// Manual payments (bank transfer / Whish) — the path used while there is no
// registered company for Stripe. The owner claims they paid, an admin confirms
// or rejects in /admin. All money-shaped values are derived server-side.

export type PaymentMethod = "BANK" | "WHISH";
export type PaymentStatus = "CLAIMED" | "CONFIRMED" | "REJECTED";
/** Plans that can actually be bought (excludes the free trial). */
export type PayablePlan = Exclude<PlanId, "trial">;

export function isPayablePlan(v: string): v is PayablePlan {
  return v === "starter" || v === "pro";
}

/** Days of provisional access granted on a workspace's FIRST ever claim. */
export const PROVISIONAL_DAYS = 7;

/**
 * Stable per-user code the payer puts in their transfer memo, so an incoming
 * bank line can be matched to an account. Derived from the user id: same user
 * always gets the same code. Uppercase hex only — unambiguous when hand-copied.
 */
export function referenceCodeFor(userId: string): string {
  return `OV-${userId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/** The payment details shown on /checkout. Read from env, never hardcoded. */
export function paymentDetails() {
  return {
    bankName: process.env.BANK_NAME ?? "",
    bankAccountName: process.env.BANK_ACCOUNT_NAME ?? "",
    bankIban: process.env.BANK_IBAN ?? "",
    whishNumber: process.env.WHISH_NUMBER ?? "",
    whatsappNumber: process.env.WHATSAPP_NUMBER ?? "",
  };
}

export function paymentDetailsConfigured(): boolean {
  const d = paymentDetails();
  return !!(d.bankIban || d.whishNumber);
}

export interface ClaimEligibility {
  /** False when an open claim already exists — one at a time per workspace. */
  canClaim: boolean;
  /** Provisional access is granted ONLY on a workspace's first ever claim. */
  grantsProvisional: boolean;
  reason?: string;
}

/**
 * Decide what a claim from this workspace is allowed to do. Provisional access
 * is deliberately first-claim-only: a real customer claims once, so repeated
 * claims are either confusion or abuse, and instant access spends real AI
 * budget. A workspace with a rejected claim never gets provisional access again.
 */
export async function claimEligibility(workspaceId: string): Promise<ClaimEligibility> {
  const prior = await db()
    .select({ status: payments.status })
    .from(payments)
    .where(eq(payments.workspaceId, workspaceId));

  if (prior.some((p) => p.status === "CLAIMED")) {
    return {
      canClaim: false,
      grantsProvisional: false,
      reason: "You already have a payment awaiting confirmation.",
    };
  }
  const everRejected = prior.some((p) => p.status === "REJECTED");
  return {
    canClaim: true,
    // First ever claim only, and never after a rejection.
    grantsProvisional: prior.length === 0 && !everRejected,
  };
}

export interface RecordClaimArgs {
  workspaceId: string;
  userId: string;
  plan: PayablePlan;
  method: PaymentMethod;
  claimedReference: string;
  screenshot?: string | null;
}

/**
 * Record a payment claim. Amount and reference code are recomputed here from
 * the plan catalog and user id — the client cannot influence either. Grants
 * provisional access in the same transaction when eligible.
 */
export async function recordClaim(args: RecordClaimArgs) {
  const eligibility = await claimEligibility(args.workspaceId);
  if (!eligibility.canClaim) {
    return { ok: false as const, error: eligibility.reason ?? "Cannot claim right now." };
  }

  const amountUsd = PLANS[args.plan].priceMonthlyUsd;
  const referenceCode = referenceCodeFor(args.userId);

  const payment = await db().transaction(async (tx) => {
    const row = (
      await tx
        .insert(payments)
        .values({
          workspaceId: args.workspaceId,
          userId: args.userId,
          plan: args.plan,
          amountUsd,
          referenceCode,
          method: args.method,
          claimedReference: args.claimedReference,
          screenshot: args.screenshot ?? null,
          status: "CLAIMED",
        })
        .returning()
    )[0]!;

    if (eligibility.grantsProvisional) {
      await tx
        .update(workspaces)
        .set({
          plan: args.plan,
          paidThrough: new Date(Date.now() + PROVISIONAL_DAYS * 24 * 3600 * 1000),
        })
        .where(eq(workspaces.id, args.workspaceId));
    }
    return row;
  });

  return { ok: true as const, payment, grantedProvisional: eligibility.grantsProvisional };
}

/**
 * Confirm a claimed payment. paidThrough = the claim date + one month: they
 * paid for a month and get a month, with any provisional days counted inside
 * it rather than added on top.
 */
export async function confirmPayment(paymentId: string, reviewedBy: string) {
  return db().transaction(async (tx) => {
    const p = (
      await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1)
    )[0];
    if (!p || p.status !== "CLAIMED") return null;

    const paidThrough = new Date(p.createdAt);
    paidThrough.setMonth(paidThrough.getMonth() + 1);

    await tx
      .update(payments)
      .set({ status: "CONFIRMED", reviewedAt: new Date(), reviewedBy })
      .where(eq(payments.id, paymentId));
    await tx
      .update(workspaces)
      .set({ plan: p.plan, paidThrough })
      .where(eq(workspaces.id, p.workspaceId));
    return { ...p, status: "CONFIRMED" as const, paidThrough };
  });
}

/**
 * Reject a claimed payment. Revokes access — otherwise a bogus claim would
 * still buy free days and rejection would mean nothing.
 */
export async function rejectPayment(paymentId: string, reviewedBy: string, note: string) {
  return db().transaction(async (tx) => {
    const p = (
      await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1)
    )[0];
    if (!p || p.status !== "CLAIMED") return null;

    await tx
      .update(payments)
      .set({ status: "REJECTED", reviewNote: note, reviewedAt: new Date(), reviewedBy })
      .where(eq(payments.id, paymentId));
    await tx
      .update(workspaces)
      .set({ plan: "trial", paidThrough: null })
      .where(eq(workspaces.id, p.workspaceId));
    return { ...p, status: "REJECTED" as const };
  });
}

/** Pending review queue for /admin, newest first. */
export async function listClaimedPayments() {
  return db()
    .select({
      id: payments.id,
      plan: payments.plan,
      amountUsd: payments.amountUsd,
      method: payments.method,
      referenceCode: payments.referenceCode,
      claimedReference: payments.claimedReference,
      screenshot: payments.screenshot,
      createdAt: payments.createdAt,
      workspaceName: workspaces.name,
      userEmail: users.email,
    })
    .from(payments)
    .innerJoin(workspaces, eq(workspaces.id, payments.workspaceId))
    .innerJoin(users, eq(users.id, payments.userId))
    .where(eq(payments.status, "CLAIMED"))
    .orderBy(desc(payments.createdAt));
}

/** Recently reviewed payments, for context under the queue. */
export async function listReviewedPayments(limit = 20) {
  return db()
    .select({
      id: payments.id,
      plan: payments.plan,
      amountUsd: payments.amountUsd,
      status: payments.status,
      reviewNote: payments.reviewNote,
      reviewedAt: payments.reviewedAt,
      workspaceName: workspaces.name,
      userEmail: users.email,
    })
    .from(payments)
    .innerJoin(workspaces, eq(workspaces.id, payments.workspaceId))
    .innerJoin(users, eq(users.id, payments.userId))
    .where(ne(payments.status, "CLAIMED"))
    .orderBy(desc(payments.reviewedAt))
    .limit(limit);
}

/** The workspace's most recent payment, for showing status on /checkout. */
export async function latestPayment(workspaceId: string) {
  const rows = await db()
    .select()
    .from(payments)
    .where(and(eq(payments.workspaceId, workspaceId)))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  return rows[0] ?? null;
}
