import { DeviceSearchBox } from './search-box'
import { DeviceTypeFilter } from './type-filter'
import { DeviceWarrantyFilter } from './warranty-filter'
import type { DeviceFilters } from './query-params'

// The ONE filter bar of /devices (D-12): a server component composing client
// islands — no client wrapper, no state; islands receive flat serializable
// props (vercel server-serialization) and push the FULL query string through
// buildDevicesQuery themselves. The composition grows with the phase: status
// and department Selects and the RAM chip join in plan-02 Task 3, the CSV
// link in plan 04. flex-wrap to a second line at max-w-3xl is by design
// (UI-SPEC Defaults #1 — one VISIBLE bar, not one physical line).
export function FilterBar({ filters }: { filters: DeviceFilters }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <DeviceSearchBox q={filters.q} current={filters} />
      {/* DeviceTypeFilter is rewired onto buildDevicesQuery in Task 3 —
          until then it keeps its phase-3 bare push. */}
      <DeviceTypeFilter current={filters.type} />
      <DeviceWarrantyFilter current={filters.warranty} filters={filters} />
    </div>
  )
}
