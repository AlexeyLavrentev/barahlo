import { listDepartments } from '@/db/queries/employees'
import { DeviceSearchBox } from './search-box'
import { DeviceTypeFilter } from './type-filter'
import { DeviceStatusFilter } from './status-filter'
import { DeviceDepartmentFilter } from './department-filter'
import { DeviceWarrantyFilter } from './warranty-filter'
import { RamChip } from './ram-chip'
import { buildDevicesQuery } from './query-params'
import type { DeviceFilters } from './query-params'

// The ONE filter bar of /devices (D-12): all filters of one VISIBLE bar —
// поиск → тип → статус → отдел → гарантия → RAM-чип — no popover, no separate
// active-filter chips (D-14; selects show their own values). A server
// component composing client islands: no client wrapper, no state; it calls
// listDepartments() once and hands flat { id, name } rows to the department
// island (server-serialization — islands never receive functions). Every
// island pushes the FULL query string through buildDevicesQuery with page=1
// (the URL is the only filter state). The bar ends (ml-auto) with the D-18
// «Скачать CSV» link — a plain <a> to /api/devices/export carrying the
// current filters (plan 04). flex-wrap to a second line at max-w-3xl is by
// design (UI-SPEC Defaults #1 — one VISIBLE bar, not one physical line).
export function FilterBar({ filters }: { filters: DeviceFilters }) {
  const departments = listDepartments()
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <DeviceSearchBox q={filters.q} current={filters} />
      <DeviceTypeFilter current={filters.type} filters={filters} />
      <DeviceStatusFilter current={filters.status} filters={filters} />
      <DeviceDepartmentFilter
        current={filters.departmentId}
        filters={filters}
        items={departments}
      />
      <DeviceWarrantyFilter current={filters.warranty} filters={filters} />
      <RamChip filters={filters} />
      {/* D-18 CSV export (plan 04): plain server-rendered <a> — no island, no
          pending state; the browser-native download UI is the feedback
          (UI-SPEC Defaults #9/#16). The route scans ALL pages, so the href
          keeps every filter but drops pagination state: buildDevicesQuery
          (the ONE builder) writes page only when ≠ 1, and DeviceFilters
          carries no page at all — the URL stays honest by construction.
          Secondary button recipe (h-10, 14/400) with the global press rule —
          bar controls are links/buttons (UI-SPEC Interactions). */}
      <a
        href={`/api/devices/export${buildDevicesQuery(filters)}`}
        className="ml-auto inline-flex h-10 shrink-0 items-center rounded-lg bg-secondary px-3 text-sm text-secondary-foreground transition-all duration-100 ease-out hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] active:scale-[0.97] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none select-none"
      >
        Скачать CSV
      </a>
    </div>
  )
}
