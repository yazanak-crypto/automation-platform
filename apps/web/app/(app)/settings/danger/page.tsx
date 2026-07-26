"use client";

import { Page, PageHeader } from "@/components/ui";

export default function DangerZonePage() {
  return (
    <Page>
      <PageHeader title="Data & danger zone" subtitle="Export your data, or close your workspace." />

      <div className="space-y-4">
        <div className="rounded-xl border border-line p-5">
          <p className="text-sm font-medium">Export your data</p>
          <p className="mt-1 text-[13px] text-ink-2">
            Download everything in your workspace — your Business Brain, channels, and conversation
            counts — as a JSON file. Never includes passwords or access tokens.
          </p>
          <a
            href="/api/settings/export"
            download
            className="press-glow mt-3 inline-block rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-transform active:scale-[0.97]"
          >
            Download my data
          </a>
        </div>

        <div className="rounded-xl border border-line border-l-2 border-l-stop p-5">
          <p className="text-sm font-medium text-stop">Close this workspace</p>
          <p className="mt-1 text-[13px] text-ink-2">
            Permanently deletes your workspace and all its data. Because this can&apos;t be undone,
            we handle it by request so we can confirm it&apos;s really you.
          </p>
          <a
            href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "hello@ovanth.com"}?subject=Close%20my%20workspace`}
            className="mt-3 inline-block rounded-lg border border-line px-4 py-2 text-sm text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
          >
            Request deletion
          </a>
        </div>
      </div>
    </Page>
  );
}
