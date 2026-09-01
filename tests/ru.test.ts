import { describe, expect, it } from 'vitest'
import { pluralEmployees, ruCollator } from '@/lib/ru'

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

describe('ruCollator — Intl.Collator("ru")', () => {
  it('places Ё after Е and ignores case', () => {
    const names = ['Ёлкин', 'ежов', 'Анна']
    expect([...names].sort(ruCollator.compare)).toEqual(['Анна', 'ежов', 'Ёлкин'])
  })
})
