import Link from "next/link";
import { notFound } from "next/navigation";
import { getDefinition } from "@platform/catalog";
import { listActivations } from "@platform/core";
import { requireWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function AutomationDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const def = getDefinition(slug);
  if (!def) notFound();

  const ctx = await requireWorkspace();
  const active = ctx
    ? (await listActivations(ctx.workspace.id)).find((a) => a.automationSlug === slug)
    : undefined;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/marketplace" className="text-sm text-ink-3 hover:text-ink-2">
        ← Marketplace
      </Link>

      <header className="mt-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-semibold">{def.name}</h1>
          <span className="rounded-full bg-hover px-2 py-0.5 text-xs capitalize text-ink-2">
            {def.tier}
          </span>
          <span className="rounded-full bg-hover px-2 py-0.5 text-xs text-ink-2">
            New
          </span>
        </div>
        <p className="mt-2 text-lg text-ink-2">{def.tagline}</p>
        <p className="mt-3 text-sm text-ink-2">{def.description}</p>
      </header>

      <section className="mt-8">
        <h2 className="mb-3 font-medium">How it works</h2>
        <ol className="space-y-2">
          {def.definition.howItWorks.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-ink-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-hover text-xs text-ink-2">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-4">
          <h3 className="text-sm font-medium">What it needs</h3>
          <p className="mt-2 text-sm text-ink-2">Website chat channel · Business Brain</p>
        </div>
        <div className="rounded-xl border border-line p-4">
          <h3 className="text-sm font-medium">Setup time</h3>
          <p className="mt-2 text-sm text-ink-2">
            About {def.definition.setupMinutes} minutes
          </p>
        </div>
      </section>

      <div className="mt-10">
        {active ? (
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-ok-dim px-3 py-1.5 text-[12px] font-medium text-ok">
              ● Active{active.status === "paused" ? " (paused)" : ""}
            </span>
            <Link href="/dashboard" className="text-sm underline underline-offset-4">
              Manage on dashboard
            </Link>
          </div>
        ) : (
          <Link
            href={`/marketplace/${def.slug}/activate`}
            className="inline-block rounded-lg bg-white px-6 py-3 font-medium text-black"
          >
            Activate
          </Link>
        )}
      </div>
    </main>
  );
}
