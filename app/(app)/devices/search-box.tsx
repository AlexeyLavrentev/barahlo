'use client'

import { Search } from 'lucide-react'
import { useDebouncedSearchQuery } from '@/lib/use-search-param'
import { buildDevicesQuery } from './query-params'
import type { DeviceFilters } from './query-params'

// Live-search island (D-01, FIND-01): local state holds the keystrokes; a
// 300 ms timer navigates via router.replace inside startTransition — the URL
// is the only search state, the server re-validates q (query-params.ts) and
// the transition keeps the current list mounted through the swap (no
// skeleton flash per keystroke). Islands receive flat serializable props
// only (vercel server-serialization) and import the query builder
// themselves; this is the page's only client state (server-cache-react).
//
// The state/effect/commitNow body moved VERBATIM into the shared hook
// useDebouncedSearchQuery (D-07, phase 7 — reconciliation G-5-1/G-5-2
// included, never rewritten). target=current already carries q, and the
// hook's spread override ({ ...target, q: value }) preserves today's exact
// push semantics (buildDevicesQuery({ ...current, q: value })).
//
// NOT a <form action> and no server action: React 19 resets uncontrolled
// forms after EVERY action (4886f6a) — this controlled input lives outside
// any form, so focus and value survive the server swap.
export function DeviceSearchBox({
  q,
  current,
}: {
  q: string
  current: DeviceFilters
}) {
  const { value, setValue, commitNow } = useDebouncedSearchQuery<DeviceFilters>({
    q,
    target: current,
    buildQuery: buildDevicesQuery,
  })

  return (
    // flex-1 min-w-48 absorbs the bar's slack (UI-SPEC filter-bar contract).
    <div className="relative min-w-48 flex-1">
      <Search
        size={16}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-secondary"
      />
      <input
        type="search"
        value={value}
        maxLength={100}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitNow()
        }}
        placeholder="Серийник, инвентарник или модель"
        aria-label="Поиск по устройствам"
        className="h-10 w-full rounded-lg border border-hairline bg-white px-3 pl-9 text-base text-ink outline-none transition-colors placeholder:text-ink-secondary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </div>
  )
}
