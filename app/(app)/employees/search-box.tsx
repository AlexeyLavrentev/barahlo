'use client'

import { Search } from 'lucide-react'
import { useDebouncedSearchQuery } from '@/lib/use-search-param'
import { buildEmployeesQuery } from './query-params'
import type { EmployeeFilters } from './query-params'

// Live-search island of /employees (FIND-05): local state holds the
// keystrokes; the shared hook debounces 300 ms and navigates via
// router.replace inside startTransition, so the list swaps without a reload
// and the input never blocks typing (D-06 — no spinner, no disabled state).
// Flat serializable props only (vercel server-serialization): the island
// imports the query builder ITSELF — a function never crosses the RSC
// boundary as a prop. It is the page's ONLY client island (D-09).
//
// No form element and no server action: React 19 resets uncontrolled forms
// after EVERY action (4886f6a) — this controlled input lives outside any
// form, so focus and value survive the server swap.
export function EmployeeSearchBox({
  q,
  filter,
}: {
  q: string
  filter: EmployeeFilters['filter']
}) {
  const { value, setValue, commitNow } = useDebouncedSearchQuery<{
    filter: EmployeeFilters['filter']
  }>({
    q,
    target: { filter },
    buildQuery: buildEmployeesQuery,
  })

  return (
    // Full column width, alone on its row (D-09, UI-SPEC Default 2) — the
    // device wrapper's flexible-width row classes are deliberately absent.
    <div className="relative mt-4">
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
        placeholder="Имя или отдел"
        aria-label="Поиск по сотрудникам"
        className="h-10 w-full rounded-lg border border-hairline bg-white px-3 pl-9 text-base text-ink outline-none transition-colors placeholder:text-ink-secondary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </div>
  )
}
