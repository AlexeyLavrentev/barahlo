// Russian UI text helpers (UI-01). Pure named exports over Node built-ins
// only — same convention as lib/normalize.ts: no framework imports, no side
// effects, safe to import from RSC, client components and vitest alike.

const pluralRules = new Intl.PluralRules('ru')

// Russian plural categories: one → 1, 21, 101…; few → 2–4, 22–24…;
// many → 0, 5–20, 11, 111… (zero/two/other are never selected for 'ru'
// but complete the LDMLPluralRule key set for the type checker).
const EMPLOYEE_FORMS: Record<Intl.LDMLPluralRule, string> = {
  zero: 'сотрудников',
  one: 'сотрудник',
  two: 'сотрудника',
  few: 'сотрудника',
  many: 'сотрудников',
  other: 'сотрудников',
}

export function pluralEmployees(n: number): string {
  const word = EMPLOYEE_FORMS[pluralRules.select(n)]
  return `${n} ${word}`
}

// Devices list count label (phase 3): 1 устройство / 2–4 устройства / 5+ устройств.
const DEVICE_FORMS: Record<Intl.LDMLPluralRule, string> = {
  zero: 'устройств',
  one: 'устройство',
  two: 'устройства',
  few: 'устройства',
  many: 'устройств',
  other: 'устройств',
}

export function pluralDevices(n: number): string {
  const word = DEVICE_FORMS[pluralRules.select(n)]
  return `${n} ${word}`
}

// Client-side Russian ordering (combobox options in 02-03): case-insensitive,
// ё sorted after е.
export const ruCollator = new Intl.Collator('ru')

// Display timezone of movement moments (RESEARCH C7, Pitfall 9): occurredAt
// carries a real time, and a formatter without an explicit zone reads the
// HOST clock — UTC inside the Docker container would silently shift every
// printed time. The office wall clock is Moscow.
export const DISPLAY_TZ = 'Europe/Moscow'

// «03.09.2026, 15:53» — timeline meta line (VERIFIED ru-RU shape, 04-RESEARCH
// C7). Deliberately NOT the card's UTC date formatter: that one is for
// UTC-midnight date-only columns and would render 03:00 times here.
export const occurredAtFormat = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: DISPLAY_TZ,
})

// «03.09.2026» — «выдано {дата}» line of the employee card issued list.
export const occurredDateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: DISPLAY_TZ,
})
