import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { applyMigrations } from './helpers'

// db/queries/devices.ts is bound to the module-level db from @/db, which opens
// DATABASE_PATH at import time — same setup discipline as the
// devices-queries.test.ts analog (temp database BEFORE the first @/db import,
// dynamic imports keep that ordering, real migrations via db.$client).
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-clone-'))
process.env.DATABASE_PATH = join(tmpDir, 'clone.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const queries = await import('@/db/queries/devices')
const { cloneDevices, createDevice, getDevice } = queries

afterAll(() => {
  db.$client.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

function rawDevice(id: number) {
  return db.$client.prepare('SELECT * FROM devices WHERE id = ?').get(id) as {
    id: number
    type_key: string
    model: string
    serial_number: string | null
    serial_normalized: string | null
    inventory_number: string | null
    inventory_normalized: string | null
    status: string
    current_employee_id: number | null
    purchase_date: number | null
    purchase_price: number | null
    supplier: string | null
    warranty_until: number | null
    notes: string | null
    ram_gb: number | null
    ram_upgraded: number | null
    ssd_gb: number | null
    screen_diagonal: number | null
    panel_type: string | null
    port_count: number | null
    peripheral_kind: string | null
  }
}

function deviceCount(): number {
  return (
    db.$client.prepare('SELECT count(*) AS n FROM devices').get() as {
      n: number
    }
  ).n
}

function movementCount(deviceId: number): number {
  return (
    db.$client
      .prepare('SELECT count(*) AS n FROM movements WHERE device_id = ?')
      .get(deviceId) as { n: number }
  ).n
}

function attachmentCount(deviceId: number): number {
  return (
    db.$client
      .prepare('SELECT count(*) AS n FROM attachments WHERE device_id = ?')
      .get(deviceId) as { n: number }
  ).n
}

// Common input with only the mandatory fields — individual tests override.
// The serial is unique PER CALL: the tests share one temp database, and the
// manual-form write path normalizes + UNIQUE-checks the serial like prod.
const base = {
  model: 'Тестовая модель',
  inventoryNumber: null as string | null,
  purchaseDate: new Date('2026-09-01'),
  purchasePrice: 199990,
  supplier: 'ООО Поставщик',
  warrantyUntil: new Date('2028-09-01'),
  notes: null as string | null,
}

let serialSeq = 0
function createSource(
  overrides: Partial<Parameters<typeof createDevice>[0]> = {},
): number {
  serialSeq += 1
  return createDevice({
    typeKey: 'laptop',
    ...base,
    serialNumber: `SN-SRC-${serialSeq}`,
    ...overrides,
  })
}

describe('cloneDevices — transactional batch (SC 1, D-06)', () => {
  it('creates exactly N rows in one call and returns their new ids', () => {
    const sourceId = createSource({ inventoryNumber: 'AB-001' })
    const ids = cloneDevices(getDevice(sourceId)!, 'AB-002', 3)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
    expect(ids).not.toContain(sourceId)
    // The submitted start IS the first copy; the server folded the rest.
    expect(ids.map((id) => rawDevice(id).inventory_number)).toEqual([
      'AB-002',
      'AB-003',
      'AB-004',
    ])
  })

  it('rolls back the WHOLE batch on a mid-batch UNIQUE collision (SC 1)', () => {
    const sourceId = createSource()
    // The third insert of the batch (AB-010) collides with this parked row.
    createSource({ inventoryNumber: 'AB-010' })
    const before = deviceCount()
    let thrown: unknown
    try {
      cloneDevices(getDevice(sourceId)!, 'AB-008', 4)
    } catch (e) {
      thrown = e
    }
    // The collision surfaces as the business { code }, not a raw SqliteError.
    expect(thrown).toEqual({ code: 'inventoryNormalized' })
    // AB-008 and AB-009 never landed — everything or nothing.
    expect(deviceCount()).toBe(before)
  })

  it('writes multiple NULL/NULL inventory pairs for a bare batch (Pitfall 5)', () => {
    const sourceId = createSource()
    const first = cloneDevices(getDevice(sourceId)!, null, 2)
    const second = cloneDevices(getDevice(sourceId)!, null, 2)
    for (const id of [...first, ...second]) {
      const row = rawDevice(id)
      // NULL, never '' — a '' normalized value would UNIQUE-collapse batch two.
      expect(row.inventory_number).toBeNull()
      expect(row.inventory_normalized).toBeNull()
    }
  })

  it('serializes every batch as NULL/NULL pairs (D-05, D-08)', () => {
    const sourceId = createSource()
    const ids = cloneDevices(getDevice(sourceId)!, 'CD-001', 5)
    for (const id of ids) {
      const row = rawDevice(id)
      expect(row.serial_number).toBeNull()
      expect(row.serial_normalized).toBeNull()
    }
  })
})

describe('cloneDevices — copy purity (SC 2, T-04-02, D-06)', () => {
  it('never copies notes/holder/status/movements/attachments', () => {
    const sourceId = createSource({ notes: 'личная заметка оригинала' })
    // Park a movement AND an attachment on the source — neither may spread.
    db.$client
      .prepare(
        "INSERT INTO movements (device_id, event_type, occurred_at, created_at) VALUES (?, 'received', unixepoch(), unixepoch())",
      )
      .run(sourceId)
    db.$client
      .prepare(
        "INSERT INTO attachments (device_id, file_name, storage_key, created_at) VALUES (?, 'p.jpg', 'uploads/p.jpg', unixepoch())",
      )
      .run(sourceId)

    const ids = cloneDevices(getDevice(sourceId)!, 'EF-001', 2)
    for (const id of ids) {
      const row = rawDevice(id)
      expect(row.notes).toBeNull()
      expect(row.status).toBe('in_stock')
      expect(row.current_employee_id).toBeNull()
      expect(movementCount(id)).toBe(0)
      expect(attachmentCount(id)).toBe(0)
    }
    expect(movementCount(sourceId)).toBe(1)
  })

  it('clones an ASSIGNED source into an in_stock copy without a holder', () => {
    const deptId = Number(
      db.$client
        .prepare("INSERT INTO departments (name, created_at) VALUES ('Клон-отдел', unixepoch())")
        .run().lastInsertRowid,
    )
    const empId = Number(
      db.$client
        .prepare(
          "INSERT INTO employees (name, department_id, is_active, created_at) VALUES ('Клон-сотрудник', ?, 1, unixepoch())",
        )
        .run(deptId).lastInsertRowid,
    )
    const sourceId = createSource()
    db.$client
      .prepare("UPDATE devices SET status = 'assigned', current_employee_id = ? WHERE id = ?")
      .run(empId, sourceId)

    const [copyId] = cloneDevices(getDevice(sourceId)!, 'GH-001', 1)
    const row = rawDevice(copyId)
    expect(row.status).toBe('in_stock')
    expect(row.current_employee_id).toBeNull()
  })
})

describe('cloneDevices — inheritance (SC 4, D-04)', () => {
  it('inherits the whole purchase block plus the laptop config fields', () => {
    const sourceId = createSource({ ramGb: 16, ramUpgraded: 1, ssdGb: 512 })
    const ids = cloneDevices(getDevice(sourceId)!, 'IJ-001', 2)
    const source = rawDevice(sourceId)
    for (const id of ids) {
      const row = rawDevice(id)
      expect(row.type_key).toBe(source.type_key)
      expect(row.model).toBe(source.model)
      expect(row.purchase_date).toBe(source.purchase_date)
      expect(row.purchase_price).toBe(source.purchase_price)
      expect(row.supplier).toBe(source.supplier)
      expect(row.warranty_until).toBe(source.warranty_until)
      expect(row.ram_gb).toBe(16)
      expect(row.ram_upgraded).toBe(1)
      expect(row.ssd_gb).toBe(512)
    }
  })

  it('inherits the monitor config sparsely — foreign-type fields stay NULL', () => {
    const sourceId = createSource({
      typeKey: 'monitor',
      screenDiagonal: 27.5,
      panelType: 'IPS',
    })
    const [copyId] = cloneDevices(getDevice(sourceId)!, 'KL-001', 1)
    const source = rawDevice(sourceId)
    const row = rawDevice(copyId)
    expect(row.screen_diagonal).toBe(source.screen_diagonal)
    expect(row.panel_type).toBe(source.panel_type)
    // Sparse by construction: a monitor has no laptop/peripheral fields.
    expect(row.ram_gb).toBeNull()
    expect(row.ram_upgraded).toBeNull()
    expect(row.ssd_gb).toBeNull()
    expect(row.port_count).toBeNull()
    expect(row.peripheral_kind).toBeNull()
  })
})
