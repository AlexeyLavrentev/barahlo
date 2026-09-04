import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { applyMigrations } from './helpers'
import {
  HOMOGLYPH_PAIRS,
  REVERSE_DIRECTION_CYR,
  assertFixtureCompleteness,
} from './homoglyphs-fixture'

// FIND-01/FIND-04 search matrix against a temp SQLite through listDevices.
// Same harness discipline as tests/devices-queries.test.ts: point
// DATABASE_PATH at a temp database BEFORE the first @/db import (dynamic
// imports below keep that ordering), then apply the real migrations to the
// same connection via db.$client — openDb registers the norm() UDF on that
// connection, so the query-side fold IS the write-side fold.
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-device-search-'))
process.env.DATABASE_PATH = join(tmpDir, 'devices.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const queries = await import('@/db/queries/devices')
const { createDevice, listDevices } = queries

afterAll(() => {
  db.$client.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

// Common input with only the mandatory fields — individual tests override.
const base = {
  model: 'Тестовая модель',
  serialNumber: 'SN-001',
  inventoryNumber: null as string | null,
  purchaseDate: null as Date | null,
  purchasePrice: null as number | null,
  supplier: null as string | null,
  warrantyUntil: null as Date | null,
  notes: null as string | null,
}

function search(q: string, type: 'all' | 'laptop' = 'all') {
  return listDevices({ type, page: 1, pageSize: 100, filters: { q } })
}

describe('listDevices filters.q — FIND-01 search (tracer)', () => {
  it('a Cyrillic-typed query finds the Latin serial (с123 → C123)', () => {
    const id = createDevice({ typeKey: 'laptop', ...base, serialNumber: 'C123' })
    const result = search('с123')
    expect(result.total).toBe(1)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].id).toBe(id)
  })

  it('leading/trailing whitespace trims through the query path', () => {
    const id = createDevice({ typeKey: 'monitor', ...base, serialNumber: 'PAD-42' })
    const result = search('  pad-42  ')
    expect(result.total).toBe(1)
    expect(result.rows[0].id).toBe(id)
  })

  it('an empty q is a no-predicate full list with an unchanged total', () => {
    const before = listDevices({ type: 'all', page: 1, pageSize: 100 }).total
    for (const q of ['', '   ']) {
      const result = search(q)
      expect(result.total).toBe(before)
      expect(result.rows).toHaveLength(result.total)
    }
  })
})

// FIND-04: the full homoglyph matrix against the LIVE query path — the
// write-side fold (normalizeSerial at createDevice) and the query-side fold
// (searchPredicate / norm() UDF) must agree in both directions. Serials are
// unique per pair, so a hit is exactly one device.
describe('FIND-04 homoglyph matrix — Cyrillic query finds Latin serial', () => {
  for (const { cyr, lat } of HOMOGLYPH_PAIRS) {
    it(`«${cyr}» typed finds the serial with «${lat}»`, () => {
      const id = createDevice({
        typeKey: 'dock',
        ...base,
        serialNumber: `SN-${lat}-77`,
      })
      const result = search(`SN-${cyr}-77`)
      expect(result.total).toBe(1)
      expect(result.rows[0].id).toBe(id)
    })
  }
})

describe('FIND-04 reverse direction — Latin query finds the Cyrillic-stored twin', () => {
  for (const cyr of REVERSE_DIRECTION_CYR) {
    const lat = HOMOGLYPH_PAIRS.find((p) => p.cyr === cyr)!.lat
    it(`«${lat}» typed finds the model storing «${cyr}» (norm() UDF path)`, () => {
      // The MODEL is the raw column with no normalized twin — only the
      // norm() UDF can fold it, so this is the genuine reverse-direction
      // probe («СЕРЫЙ» finds «серый»).
      const id = createDevice({
        typeKey: 'peripheral',
        ...base,
        serialNumber: `rev-${cyr}-1`,
        model: `М-${cyr}-К`,
      })
      const result = search(`м-${lat}-к`)
      expect(result.total).toBe(1)
      expect(result.rows[0].id).toBe(id)
    })
  }
})

describe('FIND-04 input tolerance through the SQL path', () => {
  it('internal whitespace collapses (AB  12 → AB 12)', () => {
    // The raw column keeps the double space; the normalized twin and the
    // query fold must collapse it identically.
    const id = createDevice({
      typeKey: 'monitor',
      ...base,
      serialNumber: 'AB  12',
    })
    const result = search('ab  12')
    expect(result.total).toBe(1)
    expect(result.rows[0].id).toBe(id)
  })

  it('case folds in both directions (stored lowercase finds uppercase query)', () => {
    const id = createDevice({
      typeKey: 'laptop',
      ...base,
      serialNumber: 'mix33',
    })
    const result = search('MIX33')
    expect(result.total).toBe(1)
    expect(result.rows[0].id).toBe(id)
  })

  it('a query longer than 100 chars behaves as its capped form, without throwing', () => {
    const id = createDevice({
      typeKey: 'laptop',
      ...base,
      serialNumber: 'x'.repeat(120),
    })
    const capped = search('x'.repeat(100))
    const over = search('x'.repeat(150))
    expect(over.total).toBe(capped.total)
    expect(over.rows.map((r) => r.id)).toEqual(capped.rows.map((r) => r.id))
    expect(over.rows.map((r) => r.id)).toContain(id)
  })
})

describe('FIND-04 wildcard safety — % and _ match literals only (T-05-02)', () => {
  const plain = { typeKey: 'monitor' as const, ...base }

  it('underscore matches a literal underscore, never any single char', () => {
    const withUnderscore = createDevice({
      ...plain,
      serialNumber: 'A_B-100',
    })
    createDevice({ ...plain, serialNumber: 'AB-100' })
    createDevice({ ...plain, serialNumber: 'AxxB-100' })
    // As a wildcard, A_B would hit all three rows; literally it hits one.
    const result = search('a_b')
    expect(result.total).toBe(1)
    expect(result.rows[0].id).toBe(withUnderscore)
  })

  it('percent is a literal — a%b matches nothing, not every A…B row', () => {
    createDevice({ ...plain, serialNumber: 'pct-AB-1' })
    createDevice({ ...plain, serialNumber: 'pct-AXB-1' })
    const result = search('a%b')
    expect(result.total).toBe(0)
    expect(result.rows).toHaveLength(0)
  })

  it('a bare % does NOT return the full registry', () => {
    const full = listDevices({ type: 'all', page: 1, pageSize: 100 }).total
    const result = search('%')
    expect(result.total).toBe(0)
    expect(result.total).toBeLessThan(full)
  })
})

describe('FIND-01/D-03 ordering — searched results keep the canonical RU-sort', () => {
  it('identical models resolve stably by id across repeated searches', () => {
    const first = createDevice({
      typeKey: 'monitor',
      ...base,
      serialNumber: 'st-a-1',
      model: 'Стабильный Аппарат',
    })
    const second = createDevice({
      typeKey: 'monitor',
      ...base,
      serialNumber: 'st-a-2',
      model: 'Стабильный Аппарат',
    })
    const runOne = search('стабильный')
    const runTwo = search('стабильный')
    const idsIn = (r: ReturnType<typeof listDevices>) =>
      r.rows.filter((row) => row.model === 'Стабильный Аппарат').map((row) => row.id)
    expect(idsIn(runOne)).toEqual([first, second])
    expect(idsIn(runOne)).toEqual(idsIn(runTwo))
  })

  it('Ё sorts per the replace recipe among query hits (Ёлка after Ежов)', () => {
    createDevice({ typeKey: 'monitor', ...base, serialNumber: 'srt-anna', model: 'Анна Поиск' })
    createDevice({ typeKey: 'monitor', ...base, serialNumber: 'srt-ezhov', model: 'Ежов Поиск' })
    createDevice({ typeKey: 'monitor', ...base, serialNumber: 'srt-yolka', model: 'Ёлка Поиск' })
    const names = search('поиск')
      .rows.filter((row) => row.model.endsWith('Поиск'))
      .map((row) => row.model)
    expect(names).toEqual(['Анна Поиск', 'Ежов Поиск', 'Ёлка Поиск'])
  })
})

describe('FIND-04 fixture completeness — the map cannot outgrow the fixture', () => {
  it('every HOMOGLYPHS key/value is covered by the fixture table', () => {
    expect(() => assertFixtureCompleteness()).not.toThrow()
  })
})

