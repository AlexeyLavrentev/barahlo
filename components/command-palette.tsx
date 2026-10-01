'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Autocomplete } from '@base-ui/react/autocomplete'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Search } from 'lucide-react'
import { deviceTypeName } from '@/lib/device-schema'
import { buildDevicesQuery } from '@/app/(app)/devices/query-params'
import { buildEmployeesQuery } from '@/app/(app)/employees/query-params'

// ⌘K global palette (FIND-06, phase 11) — ONE client island: the quiet
// app-bar button and the Dialog+Autocomplete palette share the open state
// (single-island structure, UI-SPEC Default 2 — Dialog.createHandle()
// deliberately unused). Mounted once in app/(app)/layout.tsx, it persists
// across navigations, so EVERY navigation handler closes it explicitly
// (Pitfall 9) and the window keydown lives here for the whole app.
//
// Hotkey (D-04, SC 1): the PHYSICAL key via event.code === 'KeyK' — on
// ЙЦУКЕН the same key («Л») still reports KeyK, so the shortcut is
// layout-independent by platform contract. Branch order is load-bearing
// (Pitfall 4): toggle-close FIRST, then the other-dialog probe with the
// palette's own popup excluded via data-command-palette — a naive probe
// matches the palette itself and ⌘K could never close it. Holding the combo
// drops e.repeat so open cannot flicker.
//
// Data (D-03, SC 4): the palette refetches on EVERY open (q starts empty —
// opening resets the state, so nothing survives a close) and 300 ms after
// each keystroke; an AbortController cancels the previous request per
// keystroke and on close, and only AbortError is swallowed — a stale slow
// response can never overwrite a fresher one (Pitfall 6). A non-JSON answer
// (expired session: the fetch follows the 307 to /login HTML) renders an
// empty result set instead of crashing on res.json() (Pitfall 3).
//
// Rows (D-02/SC 2 parity extends to appearance): device rows copy the list
// recipe (model / тип · mono инвентарник · держатель), employee rows carry
// the «В архиве» chip byte-exact from the card. «Показать все» tails each
// populated group and builds its URL ONLY through the query builders (the
// phase-6 rule: hand-built query strings drift); the CSV row is a NATIVE
// anchor to the existing export route (D-07) — the last keyboard stop.
//
// Keyboard (D-06): Base UI Autocomplete owns ↑↓ cyclic navigation
// (loopFocus defaults to true), first-row autoHighlight and the
// Enter-activates-highlighted wiring — no hand-rolled keydown state machine
// (research Don't-Hand-Roll). Item onClick fires on pointer click AND on
// Enter for the highlighted row, and Enter dispatches a real DOM click
// [VERIFIED: vendored autocomplete.md Item props; combobox/utils/parts.mjs
// clickHighlightedItem → listItem.click()] — the native CSV anchor therefore
// downloads from the keyboard too (useButton leaves Enter on links to the
// browser's native link activation).

type DeviceHit = {
  id: number
  typeKey: string
  model: string
  serialNumber: string | null
  inventoryNumber: string | null
  status: string
  holder: string | null
}

type EmployeeHit = {
  id: number
  name: string
  department: string
  isActive: number
}

type SearchResponse = {
  devices: DeviceHit[]
  employees: EmployeeHit[]
}

type PaletteItem =
  | { kind: 'device'; hit: DeviceHit }
  | { kind: 'employee'; hit: EmployeeHit }
  | { kind: 'show-all'; target: 'devices' | 'employees' }

type PaletteGroup = { value: 'Устройства' | 'Сотрудники'; items: PaletteItem[] }

// The value of the CSV row — outside the groups' items, a direct child of
// the list so ↓ lands on it after the last «Показать все» (D-07: the last
// keyboard stop). Not navigated through `go`: the native anchor's own click
// semantics own the download; the handler only closes the palette.
const CSV_ITEM = { kind: 'csv' } as const
// The XLSX sibling (EXP-02, plan 14): same direct-value shape as CSV_ITEM —
// outside the groups' items, passed straight as the row's value.
const XLSX_ITEM = { kind: 'xlsx' } as const

const EMPTY_RESULTS: SearchResponse = { devices: [], employees: [] }

// Session-death renders the empty set silently (Pitfall 3) — a non-JSON
// body never reaches res.json().
async function parseSearchResponse(res: Response): Promise<SearchResponse> {
  if (!res.headers.get('content-type')?.includes('application/json')) {
    return EMPTY_RESULTS
  }
  const data = (await res.json()) as Partial<SearchResponse>
  return { devices: data.devices ?? [], employees: data.employees ?? [] }
}

// Secondary line of a device row: {тип} · <mono>{инвентарник}</mono> ·
// {держатель} — empty segments omitted (nullable serial/inventory/holder,
// list precedent); the numbers stay mono (standing rule).
function deviceSecondaryParts(hit: DeviceHit): ReactNode[] {
  return [
    deviceTypeName(hit.typeKey),
    hit.inventoryNumber ? (
      <span key="inv" className="font-mono">
        {hit.inventoryNumber}
      </span>
    ) : null,
    hit.holder,
  ].filter((part) => part !== null && part !== '')
}

// Full row text for the hover/focus title (long-text overflow contract).
function deviceTitle(hit: DeviceHit): string {
  return [
    hit.model,
    deviceTypeName(hit.typeKey),
    hit.serialNumber,
    hit.inventoryNumber,
    hit.holder,
  ]
    .filter(Boolean)
    .join(' · ')
}

// Shared row skeleton: full-width hit area, two truncate lines, the
// combobox highlight semantic byte-for-byte — the moving accent is the
// list's ONLY accent; secondary text flips to white/80 inside the
// highlighted row (row = `group`, UI-SPEC Default 6).
const ROW_CLASS =
  'group flex min-h-11 w-full cursor-default items-center gap-3 px-4 py-2 text-left select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground'
const PRIMARY_CLASS = 'block truncate text-base text-ink'
const SECONDARY_CLASS =
  'mt-0.5 block truncate text-sm text-ink-secondary group-data-highlighted:text-accent-foreground/80'

function PaletteRowContent({ item }: { item: PaletteItem }) {
  if (item.kind === 'device') {
    return (
      <span className="min-w-0 flex-1">
        <span className={PRIMARY_CLASS}>{item.hit.model}</span>
        <span className={SECONDARY_CLASS}>
          {deviceSecondaryParts(item.hit).map((part, i) => (
            <Fragment key={i}>
              {i > 0 ? ' · ' : null}
              {part}
            </Fragment>
          ))}
        </span>
      </span>
    )
  }
  if (item.kind === 'employee') {
    return (
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`min-w-0 ${PRIMARY_CLASS}`}>{item.hit.name}</span>
          {/* «В архиве» — the card chip recipe byte-exact (never the Badge
              primitive); flips to white/80 inside the highlighted row like
              every other secondary text of the palette. */}
          {item.hit.isActive === 0 ? (
            <span className="shrink-0 rounded-full bg-black/5 px-2 py-1 text-sm text-ink-secondary group-data-highlighted:text-accent-foreground/80">
              В архиве
            </span>
          ) : null}
        </span>
        <span className={SECONDARY_CLASS}>{item.hit.department}</span>
      </span>
    )
  }
  // «Показать все» (D-05): the last row of each populated group — a way out
  // of the 6+6 cap; copy 14/400 (text-sm, no weight).
  return (
    <span className="min-w-0 flex-1 truncate text-sm text-ink-secondary group-data-highlighted:text-accent-foreground/80">
      Показать все
    </span>
  )
}

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResponse>(EMPTY_RESULTS)
  const [failed, setFailed] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The first effect run after open is the INSTANT fetch (D-03); every
  // later run (a keystroke) arms the 300 ms debounce instead.
  const instantFetchOnOpenRef = useRef(false)

  // Opening is the ONE reset point (D-03): query and results die with the
  // previous session, so the fresh open starts from an empty input and an
  // instant fetch. Resetting here (an event handler) instead of in a
  // close effect keeps the React-19 set-state-in-effect rule honest.
  const openPalette = () => {
    abortRef.current?.abort()
    setQ('')
    setResults(EMPTY_RESULTS)
    setFailed(false)
    instantFetchOnOpenRef.current = false
    setOpen(true)
  }

  // Global hotkey (D-04): toggle-close branch FIRST (Pitfall 4), then the
  // other-dialog probe with self-exclusion (SC 4 inertia).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'KeyK') return
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      e.preventDefault() // beats Chrome's Ctrl+K address-bar search
      if (e.repeat) return // hold-repeat must not toggle-flip
      if (open) {
        setOpen(false)
        return
      }
      if (
        document.querySelector(
          '[data-slot="dialog-content"][data-open]:not([data-command-palette])',
        )
      ) {
        return // another dialog owns the surface — the hotkey is inert
      }
      openPalette()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  // Fetch pipeline (D-03): instant query on open, 300 ms debounce per
  // keystroke, previous request aborted on every re-run and on close.
  useEffect(() => {
    if (!open) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const run = () => {
      fetch(
        `/api/search?q=${encodeURIComponent(q.trim().slice(0, 100))}`,
        { signal: controller.signal },
      )
        .then(parseSearchResponse)
        .then((data) => {
          if (controller.signal.aborted) return // a newer run owns the state
          setResults(data)
          setFailed(false)
        })
        .catch((e: unknown) => {
          if ((e as Error).name === 'AbortError') return // swallowed only
          setFailed(true)
        })
    }
    if (!instantFetchOnOpenRef.current) {
      instantFetchOnOpenRef.current = true
      run()
    } else {
      timerRef.current = setTimeout(run, 300)
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [open, q])

  // A close aborts the in-flight fetch (D-03) — external-system sync only;
  // the state reset itself lives in openPalette.
  useEffect(() => {
    if (open) return
    abortRef.current?.abort()
  }, [open])

  // Navigate AND close in one handler — the island outlives the page swap,
  // without the explicit close the card would render beneath a stuck
  // overlay (Pitfall 9). «Показать все» URLs come ONLY from the builders:
  // they own the sentinel-omission rules, query strings are never
  // hand-assembled (the phase-6/D-08 discipline).
  const go = (item: PaletteItem) => {
    if (item.kind === 'device') {
      router.push(`/devices/${item.hit.id}`)
    } else if (item.kind === 'employee') {
      router.push(`/employees/${item.hit.id}`)
    } else if (item.target === 'devices') {
      router.push(
        `/devices${buildDevicesQuery({
          q,
          type: 'all',
          status: 'all',
          departmentId: null,
          warranty: 'all',
          ramNoUpgrade: false,
        })}`,
      )
    } else {
      router.push(`/employees${buildEmployeesQuery({ filter: 'active', q })}`)
    }
    setOpen(false)
  }

  // Empty groups are omitted client-side (official recipe): the label of a
  // group with no rows would be noise — and «Показать все» renders only
  // inside populated groups (UI Considerations). Rendered also for q=''
  // (research Open Q 3): harmless plain-list links, keyboard-reachable.
  const groups: PaletteGroup[] = []
  if (results.devices.length > 0) {
    groups.push({
      value: 'Устройства',
      items: [
        ...results.devices.map((hit): PaletteItem => ({ kind: 'device', hit })),
        { kind: 'show-all', target: 'devices' },
      ],
    })
  }
  if (results.employees.length > 0) {
    groups.push({
      value: 'Сотрудники',
      items: [
        ...results.employees.map(
          (hit): PaletteItem => ({ kind: 'employee', hit }),
        ),
        { kind: 'show-all', target: 'employees' },
      ],
    })
  }

  return (
    <>
      <button
        type="button"
        aria-label="Глобальный поиск"
        onClick={openPalette}
        className="flex items-center gap-2 text-sm text-ink-secondary transition duration-100 ease-out hover:text-ink active:scale-[0.97]"
      >
        <Search size={16} aria-hidden className="text-ink-secondary" />
        <span className="rounded-md border border-hairline px-2 py-0.5 text-sm text-ink-secondary">
          ⌘K
        </span>
      </button>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          {/* Scrim = DialogOverlay recipe verbatim: black/30 fade, no blur. */}
          <DialogPrimitive.Backdrop className="fixed inset-0 isolate z-50 bg-black/30 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          {/* Top-aligned palette shell (UI-SPEC): the DialogContent recipe
              classes retargeted to top-[15vh] without vertical centering and
              with p-0. data-command-palette is both the UAT needle and the
              hotkey probe's self-exclusion (Pitfall 4). NOT keepMounted —
              popup state dies with the palette (D-03). */}
          <DialogPrimitive.Popup
            data-slot="dialog-content"
            data-command-palette
            className="fixed top-[15vh] left-1/2 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-2xl bg-popover p-0 text-sm text-popover-foreground ring-1 ring-foreground/10 shadow-lg duration-200 ease-out outline-none sm:max-w-xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-96 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-96"
          >
            <DialogPrimitive.Title className="sr-only">
              Глобальный поиск
            </DialogPrimitive.Title>
            {/* mode="none": the SERVER already filtered (D-02 parity) — the
                client renders rows statically, never re-filters. inline open:
                the list lives inside the dialog (official recipe). */}
            <Autocomplete.Root
              inline
              open
              mode="none"
              items={groups}
              autoHighlight="always"
              keepHighlight
              value={q}
              onValueChange={setQ}
            >
              <div className="relative">
                <Search
                  size={16}
                  aria-hidden
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-secondary"
                />
                {/* Explicit Escape → close from day one (A1/Pitfall 5):
                    deterministic regardless of Autocomplete's own popup
                    Escape semantics in inline mode; UAT asserts it. The
                    maxLength mirrors the server cap — identical rules both
                    sides (URL-layer discipline). */}
                <Autocomplete.Input
                  data-palette-input
                  type="search"
                  maxLength={100}
                  placeholder="Поиск устройств и сотрудников"
                  aria-label="Глобальный поиск"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setOpen(false)
                  }}
                  className="h-12 w-full rounded-none rounded-t-2xl border-0 border-b border-hairline bg-transparent px-4 pl-11 text-base text-ink outline-none transition-colors placeholder:text-ink-secondary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>
              <div className="max-h-[60vh] overflow-y-auto py-2">
                {/* Network/server failure replaces the list (UI-SPEC):
                    neutral secondary ink — a failed search is a recoverable
                    retry, never red; recovery is the next keystroke or a
                    reopen (D-03 refetch). */}
                {failed ? (
                  <p
                    role="alert"
                    data-palette-error
                    className="px-4 py-8 text-center text-sm text-ink-secondary"
                  >
                    Не удалось выполнить поиск. Попробуйте ещё раз.
                  </p>
                ) : (
                  <>
                    <Autocomplete.Empty>
                      <p
                        data-palette-empty
                        className="px-4 py-8 text-center text-sm text-ink-secondary"
                      >
                        Ничего не найдено
                      </p>
                    </Autocomplete.Empty>
                    <Autocomplete.List>
                      {groups.map((group) => (
                        <Autocomplete.Group key={group.value} items={group.items}>
                          <Autocomplete.GroupLabel className="px-4 pt-3 pb-1 text-sm text-ink-secondary">
                            {group.value}
                          </Autocomplete.GroupLabel>
                          <Autocomplete.Collection>
                            {(item: PaletteItem) => (
                              <Autocomplete.Item
                                key={
                                  item.kind === 'device'
                                    ? `d${item.hit.id}`
                                    : item.kind === 'employee'
                                      ? `e${item.hit.id}`
                                      : `all-${item.target}`
                                }
                                value={item}
                                onClick={() => go(item)}
                                title={
                                  item.kind === 'device'
                                    ? deviceTitle(item.hit)
                                    : item.kind === 'employee'
                                      ? `${item.hit.name} · ${item.hit.department}`
                                      : undefined
                                }
                                className={ROW_CLASS}
                              >
                                <PaletteRowContent item={item} />
                              </Autocomplete.Item>
                            )}
                          </Autocomplete.Collection>
                        </Autocomplete.Group>
                      ))}
                      {/* The CSV row (D-07): last keyboard stop of the list,
                          a NATIVE anchor — download semantics, NOT
                          router.push; the click handler only closes the
                          palette while the browser owns the navigation (the
                          keyboard path works because Enter on the
                          highlighted item dispatches a real DOM click). */}
                      <Autocomplete.Item
                        value={CSV_ITEM}
                        render={<a href="/api/devices/export" />}
                        onClick={() => setOpen(false)}
                        className={`${ROW_CLASS} border-t border-hairline text-sm text-ink-secondary group-data-highlighted:text-accent-foreground/80`}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          Скачать ведомость CSV
                        </span>
                      </Autocomplete.Item>
                      {/* The XLSX row (D-08): the native-anchor recipe copied
                          from the CSV row — Enter on the highlighted row
                          dispatches a real DOM click on the anchor, so the
                          keyboard downloads too; router.push / window.open
                          would navigate or pop up instead (Pitfall 14.4). No
                          query string: the palette exports the whole park,
                          exactly like the CSV row. No border-t — the group
                          separator stays on the CSV row. */}
                      <Autocomplete.Item
                        value={XLSX_ITEM}
                        render={<a href="/api/devices/export-xlsx" />}
                        onClick={() => setOpen(false)}
                        className={`${ROW_CLASS} text-sm text-ink-secondary group-data-highlighted:text-accent-foreground/80`}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          Скачать ведомость XLSX
                        </span>
                      </Autocomplete.Item>
                    </Autocomplete.List>
                  </>
                )}
              </div>
            </Autocomplete.Root>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}
