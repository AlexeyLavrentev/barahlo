import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { applyMigrations } from './helpers'

// FIND-06 palette db-layer matrix (phase 11) against a temp SQLite through
// the two palette queries. Same harness discipline as device-search.test.ts:
// point DATABASE_PATH at a temp database BEFORE the first @/db import
// (dynamic imports below keep that ordering), then apply the real migrations
// to the same connection via db.$client — openDb registers the norm() UDF on
// that connection, so the query-side fold IS the write-side fold. Parity
// assertions (SC 2) pin the palette to the EXACT list predicates — the
// palette functions compose deviceWhere / employeeSearchPredicate, so any
// second search engine here fails loudly.
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-palette-queries-'))
process.env.DATABASE_PATH = join(tmpDir, 'palette.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const devicesQueries = await import('@/db/queries/devices')
const employeesQueries = await import('@/db/queries/employees')
const {
  createDevice,
  listDevices,
  searchPaletteDevices,
} = devicesQueries
const {
  createEmployee,
  listEmployees,
  setEmployeeArchived,
  searchPaletteEmployees,
} = employeesQueries

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

// Module-scope seeds (collection-time, same as employee-search.test.ts):
// membership assertions only — absolute totals would drift as the later
// describes add rows to the same temp database.
const yolkin = createEmployee({
  name: 'Ёлкин Пётр Сергеевич',
  departmentName: 'Бухгалтерия',
})
const petrova = createEmployee({
  name: 'Петрова Анна',
  departmentName: 'ИТ',
})
const archived = createEmployee({
  name: 'Архивов Аркадий',
  departmentName: 'Бухгалтерия',
})
setEmployeeArchived(archived.id, true)
const deptEmployee = createEmployee({
  name: 'Отделов Отдел',
  departmentName: 'ПалитраОтдел',
})

describe('palette parity — «палитра находит то, что находит список» (SC 2)', () => {
  it('device rows for q equal the listDevices rows for the same q (same predicate)', () => {
    const id = createDevice({
      typeKey: 'laptop',
      ...base,
      serialNumber: 'PAL-001',
      model: 'Палитра Пробник',
    })
    const list = listDevices({
      type: 'all',
      page: 1,
      pageSize: 100,
      filters: { q: 'палитра' },
    })
    const palette = searchPaletteDevices({ q: 'палитра', limit: 100 })
    expect(palette.map((r) => r.id)).toEqual(list.rows.map((r) => r.id))
    expect(palette.map((r) => r.id)).toContain(id)
  })

  it('the palette device row carries the holder through the employees join', () => {
    const rows = searchPaletteDevices({ q: 'pal-001', limit: 10 })
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBeDefined()
    expect(rows[0].model).toBe('Палитра Пробник')
  })

  it('employee rows for q equal the union of both employee segments for the same q', () => {
    const union = [
      ...listEmployees({ filter: 'active', page: 1, pageSize: 100, q: 'бух' }).rows,
      ...listEmployees({ filter: 'archive', page: 1, pageSize: 100, q: 'бух' }).rows,
    ]
      .map((r) => r.id)
      .sort((a, b) => a - b)
    const palette = searchPaletteEmployees({ q: 'бух', limit: 100 })
      .map((r) => r.id)
      .sort((a, b) => a - b)
    expect(palette).toEqual(union)
    expect(palette).toContain(yolkin.id)
    expect(palette).not.toContain(petrova.id)
  })
})

describe('palette archived — archive is searched, badge data present (SC 2/3)', () => {
  it('an archived employee matches by name with isActive selected for the badge', () => {
    const rows = searchPaletteEmployees({ q: 'архивов', limit: 10 })
    const hit = rows.find((r) => r.id === archived.id)
    expect(hit).toBeDefined()
    expect(hit!.isActive).toBe(0)
    expect(hit!.department).toBe('Бухгалтерия')
  })

  it('a non-empty q can match the department name (departments join present)', () => {
    const ids = searchPaletteEmployees({ q: 'палитраотдел', limit: 10 }).map(
      (r) => r.id,
    )
    expect(ids).toContain(deptEmployee.id)
  })
})

describe('palette caps — server-side limits and the 100-char q cap', () => {
  it('a device group never exceeds its limit when more matches exist', () => {
    for (let i = 0; i < 8; i += 1) {
      createDevice({ typeKey: 'monitor', ...base, serialNumber: `CAP-D${i}` })
    }
    const rows = searchPaletteDevices({ q: 'cap-d', limit: 6 })
    expect(rows).toHaveLength(6)
  })

  it('an employee group never exceeds its limit when more matches exist', () => {
    for (let i = 0; i < 8; i += 1) {
      createEmployee({
        name: `Лимитовец ${i}`,
        departmentName: 'ЛимитОтдел',
      })
    }
    const rows = searchPaletteEmployees({ q: 'лимитовец', limit: 6 })
    expect(rows).toHaveLength(6)
  })

  it('a query longer than 100 chars behaves as its capped form, without throwing', () => {
    createDevice({
      typeKey: 'laptop',
      ...base,
      serialNumber: 'x'.repeat(120),
    })
    const capped = searchPaletteDevices({ q: 'x'.repeat(100), limit: 100 })
    const over = searchPaletteDevices({ q: 'x'.repeat(150), limit: 100 })
    expect(over.map((r) => r.id)).toEqual(capped.map((r) => r.id))
    expect(capped.length).toBeGreaterThan(0)
  })
})
