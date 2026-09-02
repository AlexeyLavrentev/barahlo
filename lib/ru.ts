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
