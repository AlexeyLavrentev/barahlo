'use client'

import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DEVICE_STATUS_KEYS, deviceStatusLabel } from '@/lib/device-schema'
import { buildDevicesQuery } from './query-params'
import type { DeviceFilters } from './query-params'

// D-10: single select, «Все статусы» resets — no multi-select (combinability
// FIND-03 is about different dimensions). Options derive from the keystone
// (DEVICE_STATUS_KEYS + deviceStatusLabel, D-02) in the in_stock / assigned /
// repair / disposed order — never a parallel status list.
const STATUS_ITEMS = [
  { value: 'all', label: 'Все статусы' },
  ...DEVICE_STATUS_KEYS.map((key) => ({
    value: key,
    label: deviceStatusLabel(key),
  })),
]

// Status filter island (D-10/D-11): switching pushes the FULL query string
// (every other filter survives, Pitfall 10) with the page reset handled by
// the builder; disposed stays visible whenever «Все статусы» is active.
export function DeviceStatusFilter({
  current,
  filters,
}: {
  current: DeviceFilters['status']
  filters: DeviceFilters
}) {
  const router = useRouter()
  return (
    <Select
      items={STATUS_ITEMS}
      value={current}
      onValueChange={(value) => {
        if (typeof value !== 'string') return
        // STATUS_ITEMS values are exactly the DeviceStatusKey | 'all' union.
        router.push(
          buildDevicesQuery({
            ...filters,
            status: value as DeviceFilters['status'],
          }),
        )
      }}
    >
      <SelectTrigger
        aria-label="Фильтр по статусу"
        className="h-10 w-full px-3 text-sm text-ink-secondary sm:w-40"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
