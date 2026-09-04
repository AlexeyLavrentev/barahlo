// Warranty date math (WAR-01, phase 5). Pure named exports over Node
// built-ins only — same convention as lib/ru.ts: no framework imports, no
// side effects, safe to import from RSC, queries, client components and
// vitest alike. The clock is injectable (`now` parameter) so frozen-clock
// regression tests can pin every boundary (same discipline as
// isNotFutureDate in lib/movement-schema.ts).

import { DISPLAY_TZ } from '@/lib/ru'

// THE one warn threshold (orchestrator resolution 1, closing RESEARCH Open
// Question 1 / UI-SPEC Defaults #3): unified INCLUSIVE 60-day boundary
// serving BOTH the «Истекает ≤ 60 дней» filter (warrantyPredicate in
// db/queries/devices.ts) AND the future color state (plan 03, D-16) — a
// device found by the filter can never render green. Day 0 (expires today)
// and day 60 are warn; day 61 is ok.
export const WARRANTY_WARN_DAYS = 60

// UTC-midnight Date of "today" on the DISPLAY_TZ wall clock (CR-01 recipe,
// commit 1a31814): the deployment container is UTC while the office is
// Moscow, so server-local date math shifts every boundary during MSK
// 00:00–03:00. en-CA formats as yyyy-mm-dd directly; all stored
// warrantyUntil values are UTC-midnight timestamps (written from yyyy-mm-dd
// form input), so day-level UTC comparisons are exact.
export function displayTodayUtc(now: Date = new Date()): Date {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

// UTC-midnight calendar arithmetic: fixed 86_400_000 ms steps are exact on
// UTC-midnight operands (Moscow has no DST since 2014; UTC has none ever).
export function addDaysUtc(day: Date, days: number): Date {
  return new Date(day.getTime() + days * 86_400_000)
}

// Render-side state of one device's warranty. 'none' = «без гарантии»
// (warrantyUntil null): never colored, never matched by any warranty filter
// (D-15, locked discretion).
export type WarrantyState = 'ok' | 'warn' | 'expired' | 'none'

// The ONE calculation behind every render site (WAR-01 «literally»): registry
// rows, device card, employee card issued list — plan 03 consumes this; the
// filter side mirrors the same boundaries through warrantyPredicate.
export function warrantyState(
  warrantyUntil: Date | null,
  today: Date,
): WarrantyState {
  if (!warrantyUntil) return 'none'
  if (warrantyUntil.getTime() < today.getTime()) return 'expired'
  const days = Math.round((warrantyUntil.getTime() - today.getTime()) / 86_400_000)
  return days <= WARRANTY_WARN_DAYS ? 'warn' : 'ok'
}
