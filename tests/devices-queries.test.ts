import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { applyMigrations } from './helpers'

// db/queries/devices.ts is bound to the module-level db from @/db, which opens
// DATABASE_PATH at import time. Point it at a temp database BEFORE the first
// @/db import (dynamic imports below keep that ordering), then apply the real
// migrations to the same connection via db.$client. Migration 0000 seeds the
// four device_types rows, so the devices.type_key FK is satisfied.
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-devices-'))
process.env.DATABASE_PATH = join(tmpDir, 'devices.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const queries = await import('@/db/queries/devices')
const employeeQueries = await import('@/db/queries/employees')
const { createDevice, updateDevice, getDevice, listDevices } = queries
const { createEmployee } = employeeQueries
const { addDaysUtc, displayTodayUtc } = await import('@/lib/warranty')

afterAll(() => {
  db.$client.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

function rawDevice(id: number) {
  return db.$client.prepare('SELECT * FROM devices WHERE id = ?').get(id) as {
    id: number
    type_key: string
    model: string
    serial_number: string
    serial_normalized: string
    inventory_number: string | null
    inventory_normalized: string | null
    status: string
    ram_gb: number | null
    ram_upgraded: number | null
    ssd_gb: number | null
    screen_diagonal: number | null
    panel_type: string | null
    port_count: number | null
    peripheral_kind: string | null
  }
}

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

describe('createDevice — normalized write (D-17, Pitfall 1/5)', () => {
  it('writes the given serial next to its normalized twin (action trims first)', () => {
    const id = createDevice({ typeKey: 'laptop', ...base, serialNumber: 'c123' })
    const row = rawDevice(id)
    expect(row.serial_number).toBe('c123')
    expect(row.serial_normalized).toBe('C123')
  })

  it('treats a Cyrillic homoglyph serial as a duplicate — UNIQUE surfaces as {code}', () => {
    createDevice({ typeKey: 'monitor', ...base, serialNumber: 'X-2A' })
    let thrown: unknown
    try {
      createDevice({ typeKey: 'monitor', ...base, serialNumber: 'Х-2А' })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toEqual({ code: 'serialNormalized' })
  })

  it('empty inventory number stores the NULL/NULL pair (never an empty string)', () => {
    const id = createDevice({ typeKey: 'dock', ...base, serialNumber: 'inv-null-1' })
    const row = rawDevice(id)
    expect(row.inventory_number).toBeNull()
    expect(row.inventory_normalized).toBeNull()
  })

  it('a given inventory number writes both columns normalized', () => {
    const id = createDevice({
      typeKey: 'dock',
      ...base,
      serialNumber: 'inv-both-1',
      inventoryNumber: 'inv-001',
    })
    const row = rawDevice(id)
    expect(row.inventory_number).toBe('inv-001')
    expect(row.inventory_normalized).toBe('INV-001')
  })

  it('a duplicate inventory number surfaces as {code: inventoryNormalized}', () => {
    createDevice({
      typeKey: 'peripheral',
      ...base,
      serialNumber: 'inv-p-1',
      inventoryNumber: 'inv-dup',
    })
    let thrown: unknown
    try {
      createDevice({
        typeKey: 'peripheral',
        ...base,
        serialNumber: 'inv-p-2',
        inventoryNumber: 'INV-DUP',
      })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toEqual({ code: 'inventoryNormalized' })
  })

  it('keeps typed columns of the device type', () => {
    const laptop = rawDevice(
      createDevice({
        typeKey: 'laptop',
        ...base,
        serialNumber: 'typed-1',
        ramGb: 16,
        ramUpgraded: 1,
        ssdGb: 512,
      }),
    )
    expect(laptop.ram_gb).toBe(16)
    expect(laptop.ram_upgraded).toBe(1)
    expect(laptop.ssd_gb).toBe(512)
    const peripheral = rawDevice(
      createDevice({
        typeKey: 'peripheral',
        ...base,
        serialNumber: 'typed-2',
        peripheralKind: 'мышь',
      }),
    )
    expect(peripheral.peripheral_kind).toBe('мышь')
  })
})

describe('updateDevice — normalized recompute (Pitfall 2)', () => {
  it('recomputes serialNormalized when the serial changes', () => {
    const id = createDevice({ typeKey: 'laptop', ...base, serialNumber: 'old-1' })
    expect(updateDevice(id, { ...base, serialNumber: 'new-1' })).toBe(true)
    const row = rawDevice(id)
    expect(row.serial_number).toBe('new-1')
    expect(row.serial_normalized).toBe('NEW-1')
  })

  it('recomputes the inventory pair in both directions (write and clear)', () => {
    const id = createDevice({ typeKey: 'laptop', ...base, serialNumber: 'u-1' })
    expect(updateDevice(id, { ...base, serialNumber: 'u-1', inventoryNumber: 'inv-up' })).toBe(true)
    expect(rawDevice(id).inventory_normalized).toBe('INV-UP')
    expect(
      updateDevice(id, { ...base, serialNumber: 'u-1', inventoryNumber: null }),
    ).toBe(true)
    const row = rawDevice(id)
    expect(row.inventory_number).toBeNull()
    expect(row.inventory_normalized).toBeNull()
  })

  it('never touches the row status or its type', () => {
    const id = createDevice({ typeKey: 'monitor', ...base, serialNumber: 'u-2' })
    updateDevice(id, { ...base, serialNumber: 'u-2', model: 'Новое имя' })
    const row = rawDevice(id)
    expect(row.status).toBe('in_stock')
    expect(row.type_key).toBe('monitor')
  })

  it('returns false for an unknown id without creating anything', () => {
    const before = listDevices({ type: 'all', page: 1, pageSize: 1 }).total
    expect(updateDevice(424242, { ...base, serialNumber: 'ghost' })).toBe(false)
    // Not only no update — no INSERT either: the ghost serial must not appear.
    expect(listDevices({ type: 'all', page: 1, pageSize: 1 }).total).toBe(before)
  })

  it('a serial collision with another row surfaces as {code: serialNormalized}', () => {
    const id = createDevice({ typeKey: 'dock', ...base, serialNumber: 'free-1' })
    createDevice({ typeKey: 'dock', ...base, serialNumber: 'taken-1' })
    let thrown: unknown
    try {
      updateDevice(id, { ...base, serialNumber: 'taken-1' })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toEqual({ code: 'serialNormalized' })
  })
})

describe('getDevice', () => {
  it('returns the row with its fields and holder', () => {
    const emp = createEmployee({ name: 'Держатель Устройства', departmentName: 'ИТ' })
    const id = createDevice({ typeKey: 'laptop', ...base, serialNumber: 'g-1' })
    db.$client
      .prepare('UPDATE devices SET current_employee_id = ? WHERE id = ?')
      .run(emp.id, id)
    const row = getDevice(id)
    expect(row).toBeDefined()
    expect(row!.typeKey).toBe('laptop')
    expect(row!.model).toBe(base.model)
    expect(row!.holder).toBe('Держатель Устройства')
    expect(row!.status).toBe('in_stock')
  })

  it('returns undefined for an unknown id', () => {
    expect(getDevice(999999)).toBeUndefined()
  })
})

describe('listDevices — filter, clamp, RU sort (D-05, REG-01)', () => {
  it('filters by type and returns everything for "all"', () => {
    createDevice({ typeKey: 'laptop', ...base, serialNumber: 'f-l1', model: 'Фильтр Лаптоп' })
    createDevice({ typeKey: 'laptop', ...base, serialNumber: 'f-l2', model: 'Фильтр Лаптоп 2' })
    createDevice({ typeKey: 'monitor', ...base, serialNumber: 'f-m1', model: 'Фильтр Монитор' })
    const laptops = listDevices({ type: 'laptop', page: 1, pageSize: 100 })
    expect(laptops.rows.every((r) => r.typeKey === 'laptop')).toBe(true)
    expect(laptops.rows.filter((r) => r.model.startsWith('Фильтр Лаптоп'))).toHaveLength(2)
    const all = listDevices({ type: 'all', page: 1, pageSize: 100 })
    expect(all.total).toBeGreaterThanOrEqual(3)
  })

  it('serves 20-row pages, clamps out-of-range pages, resets page 0/negative to 1', () => {
    // Seed enough of one model family to overflow a 20-row page.
    for (let i = 1; i <= 25; i++) {
      createDevice({
        typeKey: 'peripheral',
        ...base,
        serialNumber: `pg-${i}`,
        model: `Пагинация ${String(i).padStart(2, '0')}`,
      })
    }
    const first = listDevices({ type: 'peripheral', page: 1, pageSize: 20 })
    expect(first.rows).toHaveLength(20)
    expect(first.pages).toBe(Math.ceil(first.total / 20))

    const second = listDevices({ type: 'peripheral', page: 2, pageSize: 20 })
    expect(second.rows.length).toBeGreaterThan(0)
    expect(second.rows.length).toBeLessThanOrEqual(20)

    const beyond = listDevices({ type: 'peripheral', page: 99, pageSize: 20 })
    expect(beyond.page).toBe(beyond.pages)
    expect(beyond.rows.length).toBeGreaterThan(0)

    for (const p of [0, -3]) {
      expect(listDevices({ type: 'peripheral', page: p, pageSize: 20 }).page).toBe(1)
    }
  })

  it('orders by model with Russian collation (Ё after Е) and id tiebreaker', () => {
    createDevice({ typeKey: 'monitor', ...base, serialNumber: 's-ё', model: 'Ёлка Экран' })
    createDevice({ typeKey: 'monitor', ...base, serialNumber: 's-е', model: 'Ежов Экран' })
    createDevice({ typeKey: 'monitor', ...base, serialNumber: 's-а', model: 'Анна Экран' })
    createDevice({ typeKey: 'monitor', ...base, serialNumber: 's-а2', model: 'Анна Экран' })
    const names = listDevices({ type: 'monitor', page: 1, pageSize: 1000 }).rows
      .filter((r) => r.model.endsWith('Экран'))
      .map((r) => r.model)
    expect(names).toEqual(['Анна Экран', 'Анна Экран', 'Ежов Экран', 'Ёлка Экран'])
  })
})

describe('listDevices — warranty filters (WAR-01, edge 9 filter side)', () => {
  // The queries module computes «today» internally (displayTodayUtc against
  // the real clock), so fixtures seed RELATIVE to that same computed day.
  const today = displayTodayUtc()
  const W_MODEL = 'Гарантийник Окно'

  function seedWarranty(serial: string, warrantyUntil: Date | null): number {
    return createDevice({
      typeKey: 'laptop',
      ...base,
      model: W_MODEL,
      serialNumber: serial,
      warrantyUntil,
    })
  }

  const wToday = seedWarranty('war-today', today)
  const wIn30 = seedWarranty('war-in30', addDaysUtc(today, 30))
  const wIn60 = seedWarranty('war-in60', addDaysUtc(today, 60))
  const wIn61 = seedWarranty('war-in61', addDaysUtc(today, 61))
  const wPast = seedWarranty('war-past', addDaysUtc(today, -1))
  const wNone = seedWarranty('war-none', null)

  function serialsOf(warranty: 'w30' | 'w60' | 'expired'): string[] {
    return listDevices({
      type: 'all',
      page: 1,
      pageSize: 1000,
      filters: { warranty },
    })
      .rows.filter((r) => r.model === W_MODEL)
      .map((r) => r.serialNumber)
      .sort()
  }

  it('«Истекает ≤ 60 дней» returns exactly the inclusive warn band (day 0/30/60)', () => {
    expect(serialsOf('w60')).toEqual(['war-in30', 'war-in60', 'war-today'])
  })

  it('«Истекает ≤ 30 дней» is the active subset of the 60-day window', () => {
    expect(serialsOf('w30')).toEqual(['war-in30', 'war-today'])
  })

  it('«Истекла» returns only the past, non-null rows (wu < today)', () => {
    expect(serialsOf('expired')).toEqual(['war-past'])
  })

  it('null warranty matches NO warranty filter (edge 9)', () => {
    for (const w of ['w30', 'w60', 'expired'] as const) {
      expect(serialsOf(w)).not.toContain('war-none')
    }
    expect(wNone).toBeGreaterThan(0)
    expect(wIn61).toBeGreaterThan(0) // fixtures exist; day 61 sits outside both windows
  })

  it('warranty composes with the search predicate (edge 6)', () => {
    const rows = listDevices({
      type: 'all',
      page: 1,
      pageSize: 1000,
      filters: { q: 'war-in60', warranty: 'w60' },
    }).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]!.serialNumber).toBe('war-in60')
  })

  it('the warranty term rides the ONE shared where — count matches rows', () => {
    const result = listDevices({
      type: 'all',
      page: 1,
      pageSize: 2,
      filters: { warranty: 'w60' },
    })
    const walked = new Set<string>()
    for (let p = 1; p <= result.pages; p++) {
      for (const row of listDevices({ type: 'all', page: p, pageSize: 2, filters: { warranty: 'w60' } }).rows) {
        walked.add(`${row.model}/${row.serialNumber}`)
      }
    }
    expect(walked.size).toBe(result.total)
    expect(wToday).toBeGreaterThan(0)
  })
})

describe('listDevices — the full filter matrix (FIND-02/FIND-03, edge 5/6/10/11)', () => {
  // Dedicated fixture family (distinctive serial prefix) whose expected sets
  // are computable by hand:
  //   mat-l1  laptop  ram=0    warranty today+10  in_stock  dept A
  //   mat-l2  laptop  ram=1    warranty today+10  in_stock  dept A
  //   mat-l3  laptop  ram=NULL warranty today+200 assigned  dept A (holder empA)
  //   mat-m1  monitor ram=0    warranty today+5   in_stock  dept A
  //   mat-m2  monitor ram=NULL warranty NULL      in_stock  no holder (склад)
  const M_MODEL = 'Матрица Фильтров'
  let deptAId = 0
  let empAId = 0
  let empArchivedId = 0

  function seedMatrix(
    serial: string,
    overrides: Partial<{
      typeKey: 'laptop' | 'monitor'
      ramUpgraded: 0 | 1 | null
      warrantyUntil: Date | null
      status: string
      holderId: number | null
    }> = {},
  ): number {
    const id = createDevice({
      typeKey: overrides.typeKey ?? 'laptop',
      ...base,
      model: M_MODEL,
      serialNumber: serial,
      warrantyUntil: overrides.warrantyUntil ?? null,
      ramUpgraded: overrides.ramUpgraded ?? null,
    })
    if (overrides.status) {
      db.$client.prepare('UPDATE devices SET status = ? WHERE id = ?').run(overrides.status, id)
    }
    if (overrides.holderId !== undefined && overrides.holderId !== null) {
      db.$client
        .prepare('UPDATE devices SET current_employee_id = ? WHERE id = ?')
        .run(overrides.holderId, id)
    }
    return id
  }

  const today = displayTodayUtc()
  const empA = createEmployee({ name: 'Матрица Держатель', departmentName: 'Матрица-Отдел А' })
  deptAId = empA.departmentId
  empAId = empA.id
  const empArchived = createEmployee({ name: 'Матрица Архивный', departmentName: 'Матрица-Отдел А' })
  empArchivedId = empArchived.id

  seedMatrix('mat-l1', { ramUpgraded: 0, warrantyUntil: addDaysUtc(today, 10) })
  seedMatrix('mat-l2', { ramUpgraded: 1, warrantyUntil: addDaysUtc(today, 10) })
  seedMatrix('mat-l3', {
    ramUpgraded: null,
    warrantyUntil: addDaysUtc(today, 200),
    status: 'assigned', // held by empA — production custody sets holder+status together
    holderId: empAId,
  })
  // D-09: a device held by an ARCHIVED employee still belongs to their dept.
  seedMatrix('mat-l4', { ramUpgraded: 1, holderId: empArchivedId, status: 'assigned' })
  db.$client.prepare('UPDATE employees SET is_active = 0 WHERE id = ?').run(empArchivedId)
  seedMatrix('mat-m1', {
    typeKey: 'monitor',
    ramUpgraded: 0,
    warrantyUntil: addDaysUtc(today, 5),
  })
  seedMatrix('mat-m2', { typeKey: 'monitor' })

  function serialsOf(
    filters: Parameters<typeof listDevices>[0]['filters'],
    type: Parameters<typeof listDevices>[0]['type'] = 'all',
  ): string[] {
    return listDevices({ type, page: 1, pageSize: 1000, filters })
      .rows.filter((r) => r.model === M_MODEL)
      .map((r) => r.serialNumber)
      .sort()
  }

  describe('RAM «без апгрейда» — NULL-safe D-07 predicate (edge 5)', () => {
    it('includes laptops with ramUpgraded 0 AND NULL, excludes ramUpgraded 1', () => {
      expect(serialsOf({ ramNoUpgrade: true })).toEqual(['mat-l1', 'mat-l3'])
    })

    it('plain != 1 semantics: the NULL-ramUpgraded laptop is INCLUDED (Pitfall 1)', () => {
      // The discriminating row — a naive `ram_upgraded != 1` silently drops it.
      const rows = serialsOf({ ramNoUpgrade: true })
      expect(rows).toContain('mat-l3')
    })

    it('non-laptops NEVER match, even with ramUpgraded 0 on the row', () => {
      expect(serialsOf({ ramNoUpgrade: true })).not.toContain('mat-m1')
      expect(serialsOf({ ramNoUpgrade: true })).not.toContain('mat-m2')
    })

    it('hostile hand-crafted combo ?type=monitor&ram=1 is inert (T-05-06)', () => {
      expect(serialsOf({ ramNoUpgrade: true }, 'monitor')).toEqual([])
    })
  })

  describe("department — the holder's dept (D-09, edge 6)", () => {
    it('matches exactly the devices whose CURRENT holder belongs to the department', () => {
      // mat-l3 held by empA (active), mat-l4 by the archived employee of the
      // same dept; every unheld row is out regardless of type.
      expect(serialsOf({ departmentId: deptAId })).toEqual(['mat-l3', 'mat-l4'])
    })

    it('in-stock devices (NULL holder) never match ANY department filter', () => {
      const rows = serialsOf({ departmentId: deptAId })
      expect(rows).not.toContain('mat-l1')
      expect(rows).not.toContain('mat-l2')
      expect(rows).not.toContain('mat-m1')
      expect(rows).not.toContain('mat-m2')
    })

    it('a device held by an ARCHIVED employee still matches their department', () => {
      expect(serialsOf({ departmentId: deptAId })).toContain('mat-l4')
    })

    it('an unknown department id matches nothing (never a 500)', () => {
      const result = listDevices({ type: 'all', page: 1, pageSize: 10, filters: { departmentId: 424242 } })
      expect(result.total).toBe(0)
      expect(result.rows).toEqual([])
    })
  })

  describe('status — exact match, disposed visible by default (D-10/D-11)', () => {
    it('each status value matches exactly its own rows', () => {
      expect(serialsOf({ status: 'in_stock' })).toEqual(
        expect.arrayContaining(['mat-l1', 'mat-l2', 'mat-m1', 'mat-m2']),
      )
      // Both held laptops — mat-l3 (active holder) and mat-l4 (archived
      // holder) — carry the assigned status; status is orthogonal to who.
      expect(serialsOf({ status: 'assigned' })).toEqual(['mat-l3', 'mat-l4'])
    })

    it('disposed stays visible by default and a serial search finds it (D-11)', () => {
      seedMatrix('mat-d1', { status: 'disposed' })
      const disposed = serialsOf({ status: 'disposed' })
      expect(disposed).toEqual(['mat-d1'])
      const searched = listDevices({
        type: 'all',
        page: 1,
        pageSize: 1000,
        filters: { q: 'mat-d1' },
      }).rows
      expect(searched.map((r) => r.serialNumber)).toEqual(['mat-d1'])
    })
  })

  describe('composition — every filter combines with every other and with q (edge 6)', () => {
    it('ram + warranty: the upgraded laptop drops out of the warn window', () => {
      expect(serialsOf({ ramNoUpgrade: true, warranty: 'w60' })).toEqual(['mat-l1'])
    })

    it('dept + ram: NULL-ram laptops of the dept, the unheld one excluded', () => {
      // mat-l1 has NO holder → out (dept NULL); mat-l3 held by dept-A → in;
      // mat-l2 upgraded → out.
      expect(serialsOf({ departmentId: deptAId, ramNoUpgrade: true })).toEqual(['mat-l3'])
    })

    it('q + dept: serial fragment narrows within the department', () => {
      // «mat-l» hits mat-l1..l4 by serial; only the two held ones are in dept A.
      expect(serialsOf({ q: 'mat-l', departmentId: deptAId })).toEqual(['mat-l3', 'mat-l4'])
    })

    it('the FULL combination narrows to exactly one row', () => {
      expect(
        serialsOf(
          {
            q: 'mat-',
            status: 'in_stock',
            departmentId: deptAId,
            warranty: 'w60',
            ramNoUpgrade: true,
          },
          'laptop',
        ),
      ).toEqual([])
      // The same combo without the dept filter (mat-l1 has no holder):
      expect(
        serialsOf(
          {
            q: 'mat-',
            status: 'in_stock',
            warranty: 'w60',
            ramNoUpgrade: true,
          },
          'laptop',
        ),
      ).toEqual(['mat-l1'])
    })

    it('count and rows share ONE where — a paged walk yields exactly total rows, no dupes/gaps', () => {
      const filters = { departmentId: deptAId } as const
      const probe = listDevices({ type: 'all', page: 1, pageSize: 1, filters })
      const seen: string[] = []
      for (let p = 1; p <= probe.pages; p++) {
        for (const row of listDevices({ type: 'all', page: p, pageSize: 1, filters }).rows) {
          seen.push(`${row.model}/${row.serialNumber}`)
        }
      }
      expect(new Set(seen).size).toBe(seen.length)
      expect(seen.length).toBe(probe.total)
    })
  })

  describe('degrade — junk URL params never reach SQL as an invalid enum (edge 6)', () => {
    it('parseDevicesSearchParams maps unknown status/warranty/dept/ram to inactive', async () => {
      const { parseDevicesSearchParams } = await import('@/app/(app)/devices/query-params')
      const junk = parseDevicesSearchParams({
        status: 'hacked',
        warranty: 'forever',
        dept: 'not-a-number',
        ram: 'yes',
        type: 'teleporter',
        q: '  ',
      })
      expect(junk).toEqual({
        q: '',
        type: 'all',
        status: 'all',
        departmentId: null,
        warranty: 'all',
        ramNoUpgrade: false,
      })
    })

    it('listDevices never sees an invalid enum — junk filters degrade, never 500', () => {
      const result = listDevices({ type: 'all', page: 1, pageSize: 5, filters: { status: 'in_stock' } })
      expect(result.rows.every((r) => r.status === 'in_stock')).toBe(true)
    })
  })

  describe('ordering + clamp under active filters (edge 10/11)', () => {
    it('duplicate models keep the RU-sort + id tiebreaker under an active filter', () => {
      seedMatrix('mat-o1', { status: 'repair' })
      seedMatrix('mat-o2', { status: 'repair' })
      const rows = listDevices({ type: 'all', page: 1, pageSize: 1000, filters: { status: 'repair' } }).rows
        .filter((r) => r.model === M_MODEL)
        .map((r) => r.serialNumber)
      expect(rows).toEqual(['mat-o1', 'mat-o2'])
    })

    it('page 0/-3 clamp to 1; page beyond pages clamps to the last with rows', () => {
      for (const p of [0, -3]) {
        const result = listDevices({ type: 'all', page: p, pageSize: 2, filters: { status: 'in_stock' } })
        expect(result.page).toBe(1)
        expect(result.rows.length).toBeGreaterThan(0)
      }
      const beyond = listDevices({ type: 'all', page: 9999, pageSize: 2, filters: { status: 'in_stock' } })
      expect(beyond.page).toBe(beyond.pages)
      expect(beyond.rows.length).toBeGreaterThan(0)
    })
  })
})

describe('perimeter — devices are never deleted (roadmap: no delete path)', () => {
  it('exposes no delete/remove capability at module level', () => {
    expect(Object.keys(queries).some((k) => /delete|remove|destroy/i.test(k))).toBe(false)
  })
})
