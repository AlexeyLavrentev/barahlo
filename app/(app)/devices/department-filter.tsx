'use client'

import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { buildDevicesQuery } from './query-params'
import type { DeviceFilters } from './query-params'

// Department filter island (D-09/D-13): a Select, NOT a Base UI combo input —
// that control burned the project twice on value semantics (bb5674e,
// 7e400c9). The department list arrives as a FLAT serializable prop
// (server-serialization): FilterBar — a server component — calls
// listDepartments() once (already RU-sorted) and passes { id, name } rows
// down; the island never touches the db.
export function DeviceDepartmentFilter({
  current,
  filters,
  items,
}: {
  current: DeviceFilters['departmentId']
  filters: DeviceFilters
  items: { id: number; name: string }[]
}) {
  const router = useRouter()
  // String ids are the URL vocabulary (?dept=); zero departments still render
  // the single «Все отделы» option — never a dead dropdown (UI-SPEC Default 15).
  const options = [
    { value: 'all', label: 'Все отделы' },
    ...items.map((d) => ({ value: String(d.id), label: d.name })),
  ]
  return (
    <Select
      items={options}
      value={current === null ? 'all' : String(current)}
      onValueChange={(value) => {
        if (typeof value !== 'string') return
        router.push(
          buildDevicesQuery({
            ...filters,
            departmentId: value === 'all' ? null : Number(value),
          }),
        )
      }}
    >
      {/* Long department names truncate in the trigger (line-clamp on the
          value slot + min-w-0), never stretch the bar (UI-SPEC backstop). */}
      <SelectTrigger
        aria-label="Фильтр по отделу"
        className="h-10 w-full px-3 text-sm text-ink-secondary sm:w-40"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
