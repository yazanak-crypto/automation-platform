import type { Metadata } from "next";
import { Showroom } from "./Showroom";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND} — live demo`,
  description: `See ${BRAND} handle real customer conversations for a business like yours.`,
};

// Public guided showroom (spec §3). Static data, no auth, no API calls.
export default function DemoPage() {
  return <Showroom />;
}
