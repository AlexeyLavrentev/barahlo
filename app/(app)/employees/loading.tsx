// UI-SPEC loading state for the list route: five skeleton rows (h-11,
// bg-black/5, rounded-lg) inside the white list card — the populated list's
// exact shell, so streaming swaps in without layout shift. animate-pulse is
// opacity-only and motion-safe-gated: reduced motion renders a calm static
// skeleton instead.
export default function EmployeesLoading() {
  return (
    <section>
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-hairline">
        <div className="space-y-2">
          <div className="h-11 bg-black/5 rounded-lg motion-safe:animate-pulse" />
          <div className="h-11 bg-black/5 rounded-lg motion-safe:animate-pulse" />
          <div className="h-11 bg-black/5 rounded-lg motion-safe:animate-pulse" />
          <div className="h-11 bg-black/5 rounded-lg motion-safe:animate-pulse" />
          <div className="h-11 bg-black/5 rounded-lg motion-safe:animate-pulse" />
        </div>
      </div>
    </section>
  )
}
