import { listDepartments } from '@/db/queries/employees'
import { DeviceSearchBox } from './search-box'
import { DeviceTypeFilter } from './type-filter'
import { DeviceStatusFilter } from './status-filter'
import { DeviceDepartmentFilter } from './department-filter'
import { DeviceWarrantyFilter } from './warranty-filter'
import { RamChip } from './ram-chip'
import type { DeviceFilters } from './query-params'

// The ONE filter bar of /devices (D-12): all filters of one VISIBLE bar —
// поиск → тип → статус → отдел → гарантия → RAM-чип — no popover, no separate
// active-filter chips (D-14; selects show their own values). A server
// component composing client islands: no client wrapper, no state; it calls
// listDepartments() once and hands flat { id, name } rows to the department
// island (server-serialization — islands never receive functions). Every
// island pushes the FULL query string through buildDevicesQuery with page=1
// (the URL is the only filter state). The CSV link joins at the end
// (ml-auto) in plan 04. flex-wrap to a second line at max-w-3xl is by design
// (UI-SPEC Defaults #1 — one VISIBLE bar, not one physical line).
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
    </div>
  )
}
