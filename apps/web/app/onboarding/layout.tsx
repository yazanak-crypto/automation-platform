import { redirect } from "next/navigation";
import { requireActiveWorkspace } from "@/lib/activation";

/**
 * Onboarding lives outside the (app) group, so it needs its own activation
 * gate — otherwise an un-activated account could still run the (AI-spending)
 * website ingest from here.
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { ctx, active } = await requireActiveWorkspace();
  if (ctx && !active) redirect("/pending");
  return <>{children}</>;
}
