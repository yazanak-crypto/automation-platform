import { Notice, Page, PageHeader } from "@/components/ui";
import StatStrip from "../dashboard/StatStrip";

// Analytics: the real numbers we track today, with deeper reporting flagged
// honestly as on the way — no invented charts.
export default function AnalyticsPage() {
  return (
    <Page wide>
      <PageHeader title="Analytics" subtitle="How Otto is performing for your business." />
      <StatStrip />
      <div className="mt-8">
        <Notice tone="brass" title="Deeper analytics are on the way">
          Trends over time, per-channel breakdowns, and response-time reporting are coming. Today&apos;s
          live numbers are shown above and on your Overview.
        </Notice>
      </div>
    </Page>
  );
}
