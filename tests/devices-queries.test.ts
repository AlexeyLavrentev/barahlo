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
  it('writes the raw serial and its normalized twin (trim/case via lib/normalize)', () => {
    const id = createDevice({ typeKey: 'laptop', ...base, serialNumber: '  c123  ' })
    const row = rawDevice(id)
    expect(row.serial_number).toBe('c123')
    expect(row.serial_normalized).toBe('C123')
  })

  it('treats a Cyrillic homoglyph serial as a duplicate — UNIQUE surfaces as {code}', () => {
    createDevice({ typeKey: 'monitor', ...base, serialNumber: 'C123' })
    let thrown: unknown
    try {
      createDevice({ typeKey: 'monitor', ...base, serialNumber: 'С123' })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toEqual({ code: 'serialNormalized' })
  })

  it('empty inventory number stores the NULL/NULL pair (never an empty string)', () => {
    const id = createDevice({ typeKey: 'dock', ...base })
    const row = rawDevice(id)
    expect(row.inventory_number).toBeNull()
    expect(row.inventory_normalized).toBeNull()
  })

  it('a given inventory number writes both columns normalized', () => {
    const id = createDevice({ typeKey: 'dock', ...base, inventoryNumber: ' inv-001 ' })
    const row = rawDevice(id)
    expect(row.inventory_number).toBe('inv-001')
    expect(row.inventory_normalized).toBe('INV-001')
  })

  it('a duplicate inventory number surfaces as {code: inventoryNormalized}', () => {
    createDevice({ typeKey: 'peripheral', ...base, serialNumber: 'P-1', inventoryNumber: 'inv-dup' })
    let thrown: unknown
    try {
      createDevice({ typeKey: 'peripheral', ...base, serialNumber: 'P-2', inventoryNumber: 'INV-DUP' })
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
        ramGb: 16,
        ramUpgraded: 1,
        ssdGb: 512,
      }),
    )
    expect(laptop.ram_gb).toBe(16)
    expect(laptop.ram_upgraded).toBe(1)
    expect(laptop.ssd_gb).toBe(512)
    const peripheral = rawDevice(
      createDevice({ typeKey: 'peripheral', ...base, serialNumber: 'P-3', peripheralKind: 'мышь' }),
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
    expect(updateDevice(424242, { ...base, serialNumber: 'ghost' })).toBe(false)
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

describe('perimeter — devices are never deleted (roadmap: no delete path)', () => {
  it('exposes no delete/remove capability at module level', () => {
    expect(Object.keys(queries).some((k) => /delete|remove|destroy/i.test(k))).toBe(false)
  })
})
