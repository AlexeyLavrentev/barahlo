'use client'

import { useRouter } from 'next/navigation'
import { buildDevicesQuery } from './query-params'
import type { DeviceFilters } from './query-params'

// RAM chip — the one-click «ноуты без апгрейда RAM» fast filter (D-08,
// FIND-02): a permanent pill toggle beside the search field. Activation
// writes type=laptop + the ram param with page=1; deactivation drops the ram
// param and KEEPS type=laptop; changing the type Select to a non-laptop
// drops the ram param in the ONE builder (D-08 coupling lives in
// buildDevicesQuery, never duplicated here). The chip renders active ⇔ the
// ram param is present AND type=laptop; the server predicate self-limits to
// laptops regardless, so hand-crafted URLs stay inert (T-05-06).
//
// States per UI-SPEC Visual Details: inactive bg-black/5 text-ink-secondary
// (hover → ink), active solid neutral-strong bg-ink text-white — NOT accent
// (accent stays reserved; Default 4). aria-pressed carries the state to AT.
export function RamChip({ filters }: { filters: DeviceFilters }) {
  const router = useRouter()
  const active = filters.ramNoUpgrade && filters.type === 'laptop'
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => {
        router.push(
          active
            ? buildDevicesQuery({ ...filters, ramNoUpgrade: false })
            : buildDevicesQuery({
                ...filters,
                type: 'laptop',
                ramNoUpgrade: true,
              }),
        )
      }}
      className={`h-10 shrink-0 rounded-full px-3 text-sm transition-all duration-100 ease-out active:scale-[0.97] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none select-none ${
        active
          ? 'bg-ink text-white'
          : 'bg-black/5 text-ink-secondary hover:text-ink'
      }`}
    >
      Без апгрейда RAM
    </button>
  )
}
