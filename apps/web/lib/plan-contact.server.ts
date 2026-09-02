import "server-only";
import { paymentDetails } from "@platform/core";
import { LEGAL } from "./legal";
import type { PlanContact } from "./plan-contact";

/**
 * Resolve the plan-CTA contact handles from the environment.
 *
 * Separate from ./plan-contact.ts and marked server-only on purpose:
 * @platform/core imports bullmq, which needs `child_process` and fails the
 * production build the moment a client component pulls it in. Server pages call
 * this directly; /billing (a client component) receives the result over the
 * /api/billing response.
 */
export function planContact(): PlanContact {
  return {
    // wa.me accepts digits only — a stored "+961 71 823 700" would 404.
    whatsappDigits: paymentDetails().whatsappNumber.replace(/[^0-9]/g, ""),
    email: LEGAL.contactEmail,
  };
}
