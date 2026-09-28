import { describe, expect, it } from 'vitest'
import {
  pluralEmployees,
  pluralMovementRecords,
  ruCollator,
} from '@/lib/ru'

describe('pluralEmployees — Intl.PluralRules("ru") (UI-01)', () => {
  const cases: Array<[number, string]> = [
    [1, '1 сотрудник'],
    [2, '2 сотрудника'],
    [5, '5 сотрудников'],
    [21, '21 сотрудник'],
    [22, '22 сотрудника'],
    [111, '111 сотрудников'],
    [0, '0 сотрудников'],
  ]

  for (const [n, expected] of cases) {
    it(`${n} → «${expected}»`, () => {
      expect(pluralEmployees(n)).toBe(expected)
    })
  }
})

// Phase 13 (DEL-01, D-02, Pitfall 7): the device-delete counters line forms.
// Byte-exact matrix of the 13-UI-SPEC Copywriting Contract — numbers ending
// in 11 land in many (111 → «111 записей»), never in one; «фото» is
// indeclinable so only the records word carries a form table.
describe('pluralMovementRecords — Intl.PluralRules("ru") (13-UI-SPEC counters)', () => {
  it('the checker itself puts 111 in many (live proof, Pitfall 7)', () => {
    expect(new Intl.PluralRules('ru').select(111)).toBe('many')
  })

  const cases: Array<[number, string]> = [
    [0, '0 записей'],
    [1, '1 запись'],
    [2, '2 записи'],
    [5, '5 записей'],
    [21, '21 запись'],
    [22, '22 записи'],
    [111, '111 записей'],
  ]

  for (const [n, expected] of cases) {
    it(`${n} → «${expected}»`, () => {
      expect(pluralMovementRecords(n)).toBe(expected)
    })
  }
})

describe('ruCollator — Intl.Collator("ru")', () => {
  it('places Ё after Е and ignores case', () => {
    const names = ['Ёлкин', 'ежов', 'Анна']
    expect([...names].sort(ruCollator.compare)).toEqual(['Анна', 'ежов', 'Ёлкин'])
  })
})
