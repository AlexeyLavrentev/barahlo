import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { applyMigrations } from './helpers'

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
