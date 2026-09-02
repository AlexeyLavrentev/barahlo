'use client'

import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Type filter island (D-05): a fixed list of four types «не влезают в сегмент
// красиво», so a Select. Switching pushes the FULL query string and resets the
// page to 1 (Pitfall 3); the server re-validates the value (UI-SPEC «Type
// filter»). Plural labels are list-filter copy from the UI-SPEC copy table —
// the canonical singular names live in DEVICE_TYPES.
const FILTER_ITEMS = [
  { value: 'all', label: 'Все типы' },
  { value: 'laptop', label: 'Ноутбуки' },
  { value: 'monitor', label: 'Мониторы' },
  { value: 'dock', label: 'Док-станции' },
  { value: 'peripheral', label: 'Периферия' },
] as const

export function DeviceTypeFilter({ current }: { current: string }) {
  const router = useRouter()
  return (
    <Select
      items={FILTER_ITEMS}
      value={current}
      onValueChange={(value) => {
        if (typeof value !== 'string') return
        // FULL query string rebuild — a bare page param would drop the filter.
        const params = new URLSearchParams()
        if (value !== 'all') params.set('type', value)
        params.set('page', '1')
        router.push(`?${params.toString()}`)
      }}
    >
      <SelectTrigger
        aria-label="Фильтр по типу"
        className="h-10 w-full px-3 text-sm text-ink-secondary sm:w-48"
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
