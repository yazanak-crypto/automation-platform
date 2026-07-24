// Instant navigation feedback. Without this boundary, clicking any in-app link
// freezes the current page until the destination's Server Components finish
// their DB round-trips (~100ms each to Neon, several per page). With it, the
// App Router paints this skeleton on click (<16ms, client transition) while the
// real page streams in behind it — so every navigation feels instant.
//
// The app shell (sidebar, account menu, background) lives in layout.tsx and is
// preserved across navigations; this only fills the page content area.
export default function AppLoading() {
  return (
    <div className="mx-auto max-w-5xl p-8" role="status" aria-label="Loading">
      <div className="skeleton h-8 w-48" />
      <div className="skeleton mt-3 h-4 w-72" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-28 w-full" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
