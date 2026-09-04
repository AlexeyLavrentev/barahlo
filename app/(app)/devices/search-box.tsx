'use client'

import { Search } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [value, setValue] = useState(q)
  const [, startTransition] = useTransition()
  const mounted = useRef(false)
  // The last q this island has seen or pushed (CR-01): the reconciliation
  // anchor. An externally changed q («Сбросить фильтры», Back/Forward, the
  // server's trimmed echo of a padded push) differs from it → adopt the URL
  // into the input, never re-push.
  const lastSynced = useRef(q)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      lastSynced.current = q
      return
    }
    // q changed behind our back («Сбросить фильтры», Back/Forward, or the
    // server's trimmed echo of a padded push): adopt it — value===q after
    // this, so the debounce below stays silent (CR-01).
    if (q !== lastSynced.current) {
      lastSynced.current = q
      setValue(q)
      return
    }
    // Nothing external changed and input matches the URL — no-op skip.
    if (value === q) return
    // We are initiating: mark the value we are about to push so its echo
    // (the server trims q — query-params.ts) lands on lastSynced instead of
    // re-arming this timer forever (the CR-01 trailing-space nav loop).
    lastSynced.current = value
    timer.current = setTimeout(() => {
      timer.current = null
      startTransition(() =>
        router.replace(buildDevicesQuery({ ...current, q: value }), {
          scroll: false,
        }),
      )
    }, 300)
    return () => {
      // Retyping cancels the pending timer; a prop change («Сбросить
      // фильтры», another filter island) also cancels it.
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
    }
  }, [value, q, current, router])

  // Enter commits immediately: drop the pending debounce, navigate now.
  const commitNow = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (value === q) return
    lastSynced.current = value // our own push — its echo must not re-push
    startTransition(() =>
      router.replace(buildDevicesQuery({ ...current, q: value }), {
        scroll: false,
      }),
    )
  }

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
