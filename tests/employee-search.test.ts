import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { applyMigrations } from './helpers'

// FIND-05 employee search matrix against a temp SQLite through listEmployees
// (phase 7). Same harness discipline as tests/device-search.test.ts: point
// DATABASE_PATH at a temp database BEFORE the first @/db import (dynamic
// imports below keep that ordering), then apply the real migrations to the
// same connection via db.$client — openDb registers the norm() UDF on that
// connection, so the query-side fold IS the write-side fold.
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-employee-search-'))
process.env.DATABASE_PATH = join(tmpDir, 'employees.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const queries = await import('@/db/queries/employees')
const { createEmployee, listEmployees } = queries

afterAll(() => {
  db.$client.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

function search(q: string, filter: 'active' | 'archive' = 'active') {
  return listEmployees({ filter, page: 1, pageSize: 100, q })
}

describe('listEmployees q — FIND-05 search (tracer)', () => {
  const yolkin = createEmployee({
    name: 'Ёлкин Пётр Сергеевич',
    departmentName: 'Бухгалтерия',
  })
  const petrova = createEmployee({
    name: 'Петрова Анна',
    departmentName: 'ИТ',
  })

  it('a Cyrillic query finds «Ёлкин» through the Ё/ё-fold (елкин → Ёлкин)', () => {
    const result = search('елкин')
    expect(result.total).toBe(1)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].id).toBe(yolkin.id)
    expect(result.rows.map((r) => r.id)).not.toContain(petrova.id)
  })

  it('two AND tokens, one carrying Ё («ёлкин п»), still find Ёлкин (D-03)', () => {
    const result = search('ёлкин п')
    expect(result.total).toBe(1)
    expect(result.rows[0].id).toBe(yolkin.id)
  })

  it('a cross-field token pair («пётр бух») finds Ёлкин: per token name OR department (D-04)', () => {
    const result = search('пётр бух')
    expect(result.total).toBe(1)
    expect(result.rows[0].id).toBe(yolkin.id)
  })

  it('a department substring alone finds Ёлкин («бух» → Бухгалтерия)', () => {
    const result = search('бух')
    expect(result.total).toBe(1)
    expect(result.rows[0].id).toBe(yolkin.id)
  })

  it('an empty/whitespace q is a no-predicate full list', () => {
    for (const q of ['', '   ']) {
      const result = search(q)
      expect(result.total).toBe(2)
      expect(result.rows).toHaveLength(2)
    }
  })
})

describe('buildEmployeesQuery / parseEmployeesSearchParams round-trip (pure module, no db)', () => {
  it('parse trims surrounding whitespace and caps q at 100 chars', async () => {
    const { parseEmployeesSearchParams } = await import(
      '@/app/(app)/employees/query-params'
    )
    const parsed = parseEmployeesSearchParams({ q: '  елкин  ' })
    expect(parsed.q).toBe('елкин')
    expect(parsed.filter).toBe('active')
    const long = parseEmployeesSearchParams({ q: 'x'.repeat(150) })
    expect(long.q).toHaveLength(100)
  })

  it('parse degrades non-string/unknown values to their sentinels, never a 500', async () => {
    const { parseEmployeesSearchParams } = await import(
      '@/app/(app)/employees/query-params'
    )
    const junk = parseEmployeesSearchParams({
      q: ['елкин', 'массив'],
      filter: 'мусор',
      page: 'не-число',
    })
    expect(junk).toEqual({ filter: 'active', q: '' })
  })

  it('archive segment with empty q at page 1 emits only the filter parameter', async () => {
    const { buildEmployeesQuery } = await import(
      '@/app/(app)/employees/query-params'
    )
    expect(buildEmployeesQuery({ filter: 'archive', q: '' })).toBe(
      '?filter=archive',
    )
  })

  it('a non-empty q rides along; page is omitted when 1 and present otherwise (D-05)', async () => {
    const { buildEmployeesQuery } = await import(
      '@/app/(app)/employees/query-params'
    )
    expect(buildEmployeesQuery({ filter: 'active', q: 'елкин' })).toBe(
      '?filter=active&q=%D0%B5%D0%BB%D0%BA%D0%B8%D0%BD',
    )
    expect(
      buildEmployeesQuery({ filter: 'active', q: 'елкин' }, 2).endsWith(
        '&page=2',
      ),
    ).toBe(true)
  })
})
