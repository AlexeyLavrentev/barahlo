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

// Type filter island (D-05): a fixed list of four types «не влезают в сегмент
// красиво», so a Select. Plural labels are list-filter copy from the UI-SPEC
// copy table — the canonical singular names live in DEVICE_TYPES.
//
// Rewired onto the ONE builder (FIND-03 edge 6): the phase-3 bare push
// (`?type=X&page=1`) wiped q/status/dept/warranty/ram on every type change;
// now the FULL query string rides through buildDevicesQuery — the page reset
// to 1 and the D-08 ram drop for non-laptops are the builder's job (the
// server predicate self-limits regardless). The server re-validates the
// value; unknown ones degrade to «all», never a 500.
const FILTER_ITEMS = [
  { value: 'all', label: 'Все типы' },
  { value: 'laptop', label: 'Ноутбуки' },
  { value: 'monitor', label: 'Мониторы' },
  { value: 'dock', label: 'Док-станции' },
  { value: 'peripheral', label: 'Периферия' },
] as const

export function DeviceTypeFilter({
  current,
  filters,
}: {
  current: DeviceFilters['type']
  filters: DeviceFilters
}) {
  const router = useRouter()
  return (
    <Select
      items={FILTER_ITEMS}
      value={current}
      onValueChange={(value) => {
        if (typeof value !== 'string') return
        // FILTER_ITEMS values are exactly the DeviceListType union.
        router.push(
          buildDevicesQuery({
            ...filters,
            type: value as DeviceFilters['type'],
          }),
        )
      }}
    >
      <SelectTrigger
        aria-label="Фильтр по типу"
        className="h-10 w-full px-3 text-sm text-ink-secondary sm:w-40"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FILTER_ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
