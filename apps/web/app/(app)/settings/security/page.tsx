"use client";

import { UserProfile } from "@clerk/nextjs";
import { Page, PageHeader } from "@/components/ui";

// Real account security — sessions, password, two-factor, and connected logins —
// managed by Clerk (our identity provider). This renders Clerk's own account UI.
export default function SecuritySettingsPage() {
  return (
    <Page>
      <PageHeader
        title="Security"
        subtitle="Your password, two-factor authentication, and active sessions."
      />
      <div className="mt-2">
        <UserProfile routing="hash" />
      </div>
    </Page>
  );
}
