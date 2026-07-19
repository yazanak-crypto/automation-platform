import Link from "next/link";
import { CATALOG } from "@platform/catalog";

// The marketplace reads catalog-as-code. Built for 500 listings (categories,
// sections) even while there is 1 — Decision 002's identity rule.

export default function MarketplacePage() {
  const categories = [...new Set(CATALOG.map((d) => d.category))];

  return (
    <main className="mx-auto max-w-4xl p-8">
      <header>
        <h1 className="text-2xl font-semibold">Marketplace</h1>
        <p className="mt-1 text-sm text-ink-2">
          Each automation is a capability you switch on — it learns from your Business Brain and
          works under your autonomy rules.
        </p>
      </header>

      {categories.map((cat) => (
        <section key={cat} className="mt-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-3">
            {cat}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {CATALOG.filter((d) => d.category === cat).map((d) => (
              <Link
                key={d.slug}
                href={`/marketplace/${d.slug}`}
                className="group rounded-xl border border-line p-5 transition-colors hover:border-line-strong"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{d.name}</h3>
                  <span className="rounded-full bg-hover px-2 py-0.5 text-xs capitalize text-ink-2">
                    {d.tier}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink-2">{d.tagline}</p>
                <p className="mt-3 text-xs text-ink-3">
                  ~{d.definition.setupMinutes} min setup ·{" "}
                  <span className="text-ink-2 group-hover:underline">View →</span>
                </p>
              </Link>
            ))}
          </div>
        </section>
      ))}
      <p className="mt-12 border-t border-line pt-5 text-[13px] text-ink-3">
        The catalog grows every month. Something specific your business needs? Tell us — early
        customers shape what we build next.
      </p>
    </main>
  );
}
