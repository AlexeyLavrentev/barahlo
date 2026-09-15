import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { applyMigrations } from './helpers'
import {
  HOMOGLYPH_PAIRS,
  assertFixtureCompleteness,
} from './homoglyphs-fixture'

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

// Zero-pad the homoglyph index so «гом01» can never prefix-collide with
// «гом10»/«гом11» inside a LIKE token.
const pad = (i: number) => String(i).padStart(2, '0')

// Tracer seeds live at module scope: vitest collects (and seeds) the WHOLE
// file before any test runs, so the later describes add rows to the same
// temp database. Tracer assertions therefore stay membership/structural —
// absolute totals would drift as the D-10 matrix grows. («пётр бух» is the
// one query unique enough for an exact-id assert.)
const yolkin = createEmployee({
  name: 'Ёлкин Пётр Сергеевич',
  departmentName: 'Бухгалтерия',
})
const petrova = createEmployee({
  name: 'Петрова Анна',
  departmentName: 'ИТ',
})

describe('listEmployees q — FIND-05 search (tracer)', () => {
  it('a Cyrillic query finds «Ёлкин» through the Ё/ё-fold (елкин → Ёлкин)', () => {
    const result = search('елкин')
    // «Ёлкин Пётр» (sort-stability describe below) matches the same fold —
    // assert membership, not an absolute total.
    const ids = result.rows.map((r) => r.id)
    expect(ids).toContain(yolkin.id)
    expect(ids).not.toContain(petrova.id)
  })

  it('two AND tokens, one carrying Ё («ёлкин п»), still find Ёлкин (D-03)', () => {
    const result = search('ёлкин п')
    expect(result.rows.map((r) => r.id)).toContain(yolkin.id)
  })

  it('a cross-field token pair («пётр бух») finds Ёлкин: per token name OR department (D-04)', () => {
    const result = search('пётр бух')
    const ids = result.rows.map((r) => r.id)
    expect(ids).toContain(yolkin.id)
    // AND semantics, sharply: «Анна Петрова» (Бухгалтерия) legitimately
    // matches — ПЕТР prefixes «Петрова» and her department carries БУХ —
    // while her twin «Петрова Анна» (ИТ) has no БУХ anywhere and must not.
    expect(ids).not.toContain(petrova.id)
  })

  it('a department substring alone finds Ёлкин («бух» → Бухгалтерия)', () => {
    const result = search('бух')
    expect(result.rows.map((r) => r.id)).toContain(yolkin.id)
  })

  it('an empty/whitespace q is a no-predicate full list', () => {
    const before = search('').total
    for (const q of ['', '   ']) {
      const result = search(q)
      expect(result.total).toBe(before)
      expect(result.rows).toHaveLength(result.total)
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

// URL matrix (SC 3, D-05/D-08): hostile/absent URLs degrade to defaults and
// every link shape the page emits is covered — pure module, no db (same
// discipline as devices-queries.test.ts:555).
describe('URL matrix — absent/hostile params degrade, builder link shapes', () => {
  it('absent values parse to the sentinels: q → "" and filter → "active"', async () => {
    const { parseEmployeesSearchParams } = await import(
      '@/app/(app)/employees/query-params'
    )
    expect(parseEmployeesSearchParams({})).toEqual({
      filter: 'active',
      q: '',
    })
  })

  it('a 120-character q parses to its first 100 characters (server-side cap)', async () => {
    const { parseEmployeesSearchParams } = await import(
      '@/app/(app)/employees/query-params'
    )
    const parsed = parseEmployeesSearchParams({ q: 'a'.repeat(120) })
    expect(parsed.q).toBe('a'.repeat(100))
    expect(parsed.q).toHaveLength(100)
  })

  it('segment switch carries q through the builder and resets page by omission (D-05)', async () => {
    const { buildEmployeesQuery } = await import(
      '@/app/(app)/employees/query-params'
    )
    const href = buildEmployeesQuery({ filter: 'archive', q: 'елкин' }, 1)
    expect(href).toContain('filter=archive')
    expect(href).toContain('q=')
    expect(href).not.toContain('page=')
  })

  it('empty q emits no q fragment and page 1 no page fragment (reset-by-omission, Pitfall 5)', async () => {
    const { buildEmployeesQuery } = await import(
      '@/app/(app)/employees/query-params'
    )
    const href = buildEmployeesQuery({ filter: 'active', q: '' })
    expect(href).toBe('?filter=active')
    expect(href).not.toContain('page=')
  })
})

// D-02 homoglyph matrix over the LIVE listEmployees q path, both directions
// for EVERY pair (loop shape mirrors device-search.test.ts:77–110). Employee
// names are raw (no write-side normalization), so both directions fold only
// through the query predicate + the norm() UDF. The cyr/lat twins
// canonicalize to the same string by design — a hit is asserted by
// membership of the seeded id, not by exclusivity.
describe('FIND-05 homoglyph matrix — Latin query finds the Cyrillic-stored name', () => {
  for (const [i, { cyr, lat }] of HOMOGLYPH_PAIRS.entries()) {
    it(`«${lat}» typed finds the name storing «${cyr}»`, () => {
      const { id } = createEmployee({
        name: `Гом${pad(i)}-${cyr}-Гом`,
        departmentName: 'Гомоглифы',
      })
      const result = search(`гом${pad(i)}-${lat}-гом`)
      expect(result.rows.map((r) => r.id)).toContain(id)
    })
  }
})

describe('FIND-05 homoglyph matrix — Cyrillic query finds the Latin-stored name', () => {
  for (const [i, { cyr, lat }] of HOMOGLYPH_PAIRS.entries()) {
    it(`«${cyr}» typed finds the name storing «${lat}»`, () => {
      const { id } = createEmployee({
        name: `Гом${pad(i)}-${lat}-Гом`,
        departmentName: 'Гомоглифы',
      })
      const result = search(`гом${pad(i)}-${cyr}-гом`)
      expect(result.rows.map((r) => r.id)).toContain(id)
    })
  }
})

// Mirror of device-search.test.ts:154–180: the escape lives in the
// predicate, so every probe goes through the public listEmployees q path.
describe('FIND-05 wildcard safety — % and _ match literals only (T-05-02)', () => {
  it('lone percent query matches nothing', () => {
    const full = listEmployees({ filter: 'active', page: 1, pageSize: 100 })
      .total
    const result = search('%')
    expect(result.total).toBe(0)
    expect(result.total).toBeLessThan(full)
  })

  it('underscore matches a literal underscore, never any single char', () => {
    const { id: withUnderscoreId } = createEmployee({
      name: 'Ан_на Тест',
      departmentName: 'Подчеркивания',
    })
    createEmployee({ name: 'Анна Тест', departmentName: 'Подчеркивания' })
    createEmployee({ name: 'АнХна Тест', departmentName: 'Подчеркивания' })
    // As a wildcard, АН_НА would hit all three names; literally it hits one.
    const result = search('ан_на')
    expect(result.total).toBe(1)
    expect(result.rows[0].id).toBe(withUnderscoreId)
  })

  it('percent is a literal — а%б matches nothing, not every А…Б row', () => {
    createEmployee({ name: 'ПроцентАБ', departmentName: 'Подчеркивания' })
    createEmployee({ name: 'ПроцентАХБ', departmentName: 'Подчеркивания' })
    const result = search('а%б')
    expect(result.total).toBe(0)
    expect(result.rows).toHaveLength(0)
  })
})

describe('FIND-05 empty-q contract — the predicate stays inactive', () => {
  it('without q and with a whitespace-only q return the identical unfiltered segment', () => {
    const noQ = listEmployees({ filter: 'active', page: 1, pageSize: 100 })
    const whitespace = search('   ')
    expect(whitespace.total).toBe(noQ.total)
    expect(whitespace.rows.map((r) => r.id)).toEqual(
      noQ.rows.map((r) => r.id),
    )
  })
})

// Names are NOT unique (phase 2 D-04) — the department disambiguates.
describe('FIND-05/D-04 non-unique names — department disambiguates', () => {
  const annaIt = createEmployee({ name: 'Анна Петрова', departmentName: 'ИТ' })
  const annaBuh = createEmployee({
    name: 'Анна Петрова',
    departmentName: 'Бухгалтерия',
  })

  it('the query «анна» finds both same-name rows, each exactly once', () => {
    const ids = search('анна').rows.map((r) => r.id)
    expect(ids).toContain(annaIt.id)
    expect(ids).toContain(annaBuh.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('«анна ит» finds only the ИТ rows: AND tokens across name OR department', () => {
    const result = search('анна ит')
    // «Петрова Анна» (ИТ, tracer seed) matches too — same name token and
    // same department; the Бухгалтерия twin must not. ruSortKey puts
    // АННА ПЕТРОВА before ПЕТРОВА АННА.
    expect(result.rows.map((r) => r.id)).toEqual([annaIt.id, petrova.id])
  })

  it('«бух» finds the Бухгалтерия row by department alone', () => {
    const ids = search('бух').rows.map((r) => r.id)
    expect(ids).toContain(annaBuh.id)
    expect(ids).not.toContain(annaIt.id)
  })
})

// Pitfall 1 probe + SC 3 server clamp.
describe('FIND-05 count/rows parity + clamp', () => {
  // Five rows sharing one token → a genuine multi-page walk at pageSize 2.
  for (const n of [1, 2, 3, 4, 5]) {
    createEmployee({
      name: `Поход Маршрут ${n}`,
      departmentName: 'Логистика',
    })
  }

  it('page walk sums to total for a searched q', () => {
    // pageSize 2 → 5 rows across 3 pages. The server CLAMPS pages beyond the
    // last to the last one, so an unbounded «walk until an empty page» can
    // never terminate — the walk is bounded by pages, exactly like the
    // devices precedent (devices-queries.test.ts:550).
    const probe = listEmployees({
      filter: 'active',
      page: 1,
      pageSize: 2,
      q: 'поход',
    })
    const seen: number[] = []
    for (let p = 1; p <= probe.pages; p++) {
      const result = listEmployees({
        filter: 'active',
        page: p,
        pageSize: 2,
        q: 'поход',
      })
      seen.push(...result.rows.map((r) => r.id))
    }
    expect(seen.length).toBe(probe.total)
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('clamps page beyond the last', () => {
    const result = listEmployees({
      filter: 'active',
      page: 9999,
      pageSize: 2,
      q: 'поход',
    })
    expect(result.page).toBe(result.pages)
    expect(result.rows.length).toBeGreaterThan(0)
  })
})

// D-04 mirror of device-search.test.ts:205–213: Ё folds to Е for ordering
// (А < Е < Ё-as-Е), duplicates resolve by the id tiebreaker — searched or not.
describe('FIND-05/D-04 sort stability — ruSortKey + id tiebreaker', () => {
  // Department-only token «сорт» matches exactly these seeds (Сортировка) —
  // no name token collides with it anywhere else in the file.
  const annaFirst = createEmployee({
    name: 'Анна Смирнова',
    departmentName: 'Сортировка',
  })
  createEmployee({ name: 'Ежов Игорь', departmentName: 'Сортировка' })
  createEmployee({ name: 'Ёлкин Пётр', departmentName: 'Сортировка' })
  const annaSecond = createEmployee({
    name: 'Анна Смирнова',
    departmentName: 'Сортировка',
  })

  it('a broad q returns the seeds in ruSortKey order with the id tiebreaker', () => {
    const expected = [
      'Анна Смирнова',
      'Анна Смирнова',
      'Ежов Игорь',
      'Ёлкин Пётр',
    ]
    const searched = search('сорт')
    expect(searched.rows.map((r) => r.name)).toEqual(expected)
    // Identical keys resolve by the id tiebreaker in creation order…
    const annas = searched.rows
      .filter((r) => r.name === 'Анна Смирнова')
      .map((r) => r.id)
    expect(annas).toEqual([annaFirst.id, annaSecond.id])
    // …and the same holds with no search at all («search or not», D-04).
    const unfiltered = listEmployees({
      filter: 'active',
      page: 1,
      pageSize: 100,
    })
    expect(
      unfiltered.rows
        .filter((r) => r.department === 'Сортировка')
        .map((r) => r.name),
    ).toEqual(expected)
  })
})

// D-02: the fixture is referenced, never edited — the matrix fails loudly if
// lib/normalize.mjs grows a pair without the fixture following.
describe('FIND-04 fixture completeness — the map cannot outgrow the fixture', () => {
  it('every HOMOGLYPHS key/value is covered by the fixture table', () => {
    expect(() => assertFixtureCompleteness()).not.toThrow()
  })
})
