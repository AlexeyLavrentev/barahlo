'use client'

import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { buildDevicesQuery, WARRANTY_ITEMS } from './query-params'
import type { DeviceFilters } from './query-params'

// Warranty filter island (D-15): the three presets verbatim («Истекает ≤ 60
// дней» first — UI-SPEC Defaults #12), «Вся гарантия» resets. Switching
// pushes the FULL query string (all other filters survive, Pitfall 10) and
// the builder resets the page to 1; the server re-validates the value and
// degrades unknown ones to «all», never a 500. Islands receive flat
// serializable props (server-serialization) and import the ONE builder
// themselves.
export function DeviceWarrantyFilter({
  current,
  filters,
}: {
  current: DeviceFilters['warranty']
  filters: DeviceFilters
}) {
  const router = useRouter()
  return (
    <Select
      items={WARRANTY_ITEMS}
      value={current}
      onValueChange={(value) => {
        if (typeof value !== 'string') return
        // The items list constrains the selectable values — WARRANTY_VALUES
        // is exactly the union below, so the cast is total over the guard.
        router.push(
          buildDevicesQuery({
            ...filters,
            warranty: value as DeviceFilters['warranty'],
          }),
        )
      }}
    >
      {/* Wider trigger (sm:w-48): «Истекает ≤ 60 дней» must never truncate
          (UI-SPEC Spacing, Defaults #13). */}
      <SelectTrigger
        aria-label="Фильтр по гарантии"
        className="h-10 w-full px-3 text-sm text-ink-secondary sm:w-48"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {WARRANTY_ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
