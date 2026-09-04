// WarrantyDate (WAR-01, D-16, phase 5): the ONE component behind all three
// warranty render sites — registry row line 2, device card «Гарантия до»,
// employee-card issued list. A server component (no 'use client', no client
// JS): the state comes from the shared warrantyState() calculation (the same
// WARRANTY_WARN_DAYS = 60 inclusive boundary as the filter — a filter hit can
// never render green, edge 8), and `today` is computed once per page render
// and passed down (per-render, not per-row — the research server-hoist note).
//
// The component inherits the local text role and changes ONLY the color —
// 14/400 in lists, 16/400 on the card; never bold, never a pill, never a
// background, never an icon (D-17 / UI-SPEC Visual Details). The segment is
// NOT mono: a date, not an identifier.

import { warrantyState, type WarrantyState } from '@/lib/warranty'

// Module-level formatters (server-hoist-static-io): one Intl instance per
// process, not per render. Dates are stored as UTC-midnight timestamps —
// formatting in UTC keeps the rendered calendar day equal to the yyyy-mm-dd
// the form wrote, on any host timezone (the device-card dateFormat
// convention).
const dateFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC' })

// dd.mm.yyyy in UTC — shared with the registry row's title attribute so the
// truncated line and its tooltip can never disagree.
export function formatWarrantyDate(value: Date): string {
  return dateFormat.format(value)
}

// State → text color. ok = the checker's contrast-safe green (#248A3D — the
// checker D3 rec, NOT #34C759, resolution 2), warn = locked #FF9500 (D-17),
// expired = THE one red of the system (--color-destructive #D70015, the same
// red as the «Списать» action — D-17), none = no color anywhere.
const STATE_CLASS: Record<WarrantyState, string | undefined> = {
  ok: 'text-warranty-ok',
  warn: 'text-warranty-warn',
  expired: 'text-destructive',
  none: undefined,
}

export function WarrantyDate({
  value,
  today,
  variant,
}: {
  value: Date | null
  today: Date
  variant: 'list' | 'card'
}) {
  // «Без гарантии» renders NO state (edge 9): the list segment is omitted
  // entirely (line 2 unchanged); the card shows the plain secondary «—»
  // (the existing missing-value rule). Never colored.
  if (value === null) {
    return variant === 'list' ? null : (
      <span className="text-ink-secondary">—</span>
    )
  }
  const state = warrantyState(value, today)
  const date = dateFormat.format(value)
  if (variant === 'list') {
    // The WHOLE segment takes the state color — it reads as one unit
    // (UI-SPEC Visual Details). The leading ' · ' separator is included,
    // matching the row's join idiom; the trailing segment never wraps the
    // truncate'd line.
    return <span className={STATE_CLASS[state]}>{` · гар. до ${date}`}</span>
  }
  // Card: only the date value is colored beneath the untouched «Гарантия до»
  // label; it inherits the card-value role (16/400).
  return <span className={STATE_CLASS[state]}>{date}</span>
}
