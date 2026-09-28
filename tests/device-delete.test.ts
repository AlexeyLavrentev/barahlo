import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, afterAll } from 'vitest'
import { applyMigrations } from './helpers'

// Phase 13 (DEL-01): the deleteDevice knife matrix — one-tx cascade, rollback
// on the guard, DEVICE_GONE, files gone from disk, childless no-op. Bootstrap
// mirrors movement-edit.test.ts plus the UPLOADS_DIR line of attachments-
// queries.test.ts: env BEFORE the first @/db import (the lazy db Proxy opens
// on first property access — order is load-bearing).
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-delete-'))
process.env.DATABASE_PATH = join(tmpDir, 'device-delete.db')
process.env.UPLOADS_DIR = join(tmpDir, 'uploads')

const { db } = await import('@/db')
applyMigrations(db.$client)
const movementsQueries = await import('@/db/queries/movements')
const deviceQueries = await import('@/db/queries/devices')
const employeeQueries = await import('@/db/queries/employees')
const attachmentsQueries = await import('@/db/queries/attachments')
const photosModule = await import('@/lib/photos')
const movementSchemaModule = await import('@/lib/movement-schema')
const deviceSchemaModule = await import('@/lib/device-schema')

const { deleteDevice, getDevice, createDevice } = deviceQueries
const { assignDevice } = movementsQueries
const { createEmployee } = employeeQueries
const { insertWithCapCheck } = attachmentsQueries
const { thumbKeyOf, resolveUploadPath } = photosModule
const { occurredAtFromDate } = movementSchemaModule
const { deviceDeleteSchema } = deviceSchemaModule

afterAll(() => {
  db.$client.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

let serialCounter = 0
let nameCounter = 0

function newDevice(): number {
  serialCounter += 1
  return createDevice({
    typeKey: 'laptop',
    model: 'Delete Тестовая модель',
    serialNumber: `DEL-${String(serialCounter).padStart(5, '0')}`,
    inventoryNumber: null,
    purchaseDate: null,
    purchasePrice: null,
    supplier: null,
    warrantyUntil: null,
    notes: null,
  })
}

function newEmployee(name: string): number {
  nameCounter += 1
  return createEmployee({
    name: `${name} ${nameCounter}`,
    departmentName: 'ИТ',
  }).id
}

function rawDevice(id: number) {
  return db.$client.prepare('SELECT * FROM devices WHERE id = ?').get(id) as
    | { id: number; status: string; serial_number: string; current_employee_id: number | null }
    | undefined
}

function rawMovements(deviceId: number) {
  return db.$client
    .prepare('SELECT * FROM movements WHERE device_id = ? ORDER BY id')
    .all(deviceId) as { id: number; event_type: string }[]
}

function rawAttachments(deviceId: number) {
  return db.$client
    .prepare('SELECT * FROM attachments WHERE device_id = ? ORDER BY id')
    .all(deviceId) as { id: number; storage_key: string }[]
}

function captureThrown(fn: () => void): unknown {
  try {
    fn()
  } catch (e) {
    return e
  }
  return undefined
}

// DB row with a fake storage key — insertWithCapCheck touches only the DB
// (files are the route's job), so rows can be seeded without disk content
// (attachments-queries.test.ts:98 precedent).
function seedPhotoRow(deviceId: number): string {
  serialCounter += 1
  const storageKey = `${deviceId}/seed-${serialCounter}.jpg`
  insertWithCapCheck(deviceId, {
    fileName: `seed-${serialCounter}.jpg`,
    mimeType: 'image/jpeg',
    byteSize: 1024,
    storageKey,
  })
  return storageKey
}

// REAL bytes for both file variants of one photo — the D-04 contract is
// «original AND thumb gone from disk by the time deleteDevice returns».
function seedPhotoFiles(storageKey: string): void {
  for (const key of [storageKey, thumbKeyOf(storageKey)]) {
    const absolute = resolveUploadPath(key)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, `bytes-of-${key}`)
  }
}

const DAY = (iso: string) => occurredAtFromDate(iso)

describe('deleteDevice — one-tx cascade with post-commit unlink (DEL-01, D-03/D-04)', () => {
  it('device with children: movements + attachments + device row + BOTH files gone', () => {
    const dev = newDevice()
    const emp = newEmployee('Каскад Держатель')
    assignDevice(dev, emp, { occurredAt: DAY('2026-09-01') })
    const storageKey = seedPhotoRow(dev)
    seedPhotoFiles(storageKey)
    const thumbKey = thumbKeyOf(storageKey)
    expect(getDevice(dev)).toBeDefined()
    expect(rawMovements(dev)).toHaveLength(1)
    expect(rawAttachments(dev)).toHaveLength(1)
    expect(existsSync(resolveUploadPath(storageKey))).toBe(true)
    expect(existsSync(resolveUploadPath(thumbKey))).toBe(true)

    deleteDevice(dev)

    expect(getDevice(dev)).toBeUndefined()
    expect(rawMovements(dev)).toHaveLength(0)
    expect(rawAttachments(dev)).toHaveLength(0)
    expect(existsSync(resolveUploadPath(storageKey))).toBe(false)
    expect(existsSync(resolveUploadPath(thumbKey))).toBe(false)
  })

  it('childless device (clone baby): no-op child deletes, empty unlink loop', () => {
    const dev = newDevice()
    expect(() => deleteDevice(dev)).not.toThrow()
    expect(getDevice(dev)).toBeUndefined()
    expect(rawMovements(dev)).toHaveLength(0)
    expect(rawAttachments(dev)).toHaveLength(0)
  })

  it('unknown id: DEVICE_GONE and ZERO writes — control device, rows and files untouched', () => {
    const dev = newDevice()
    const emp = newEmployee('Контроль Цел')
    assignDevice(dev, emp, { occurredAt: DAY('2026-09-01') })
    const storageKey = seedPhotoRow(dev)
    seedPhotoFiles(storageKey)
    const before = rawMovements(dev)
    const beforeDevice = rawDevice(dev)

    const thrown = captureThrown(() => deleteDevice(999999))
    expect((thrown as { code?: string }).code).toBe('DEVICE_GONE')
    expect(rawMovements(dev)).toEqual(before)
    expect(rawDevice(dev)).toEqual(beforeDevice)
    expect(existsSync(resolveUploadPath(storageKey))).toBe(true)
    expect(existsSync(resolveUploadPath(thumbKeyOf(storageKey)))).toBe(true)
  })
})

describe('deviceDeleteSchema — minimal and strict (keystone)', () => {
  it('parses a coerced deviceId and cuts injected keys (tampering probe)', () => {
    expect(deviceDeleteSchema.parse({ deviceId: '7' })).toMatchObject({
      deviceId: 7,
    })
    expect(
      deviceDeleteSchema.safeParse({ deviceId: 7, status: 'assigned' }).success,
    ).toBe(false)
    expect(deviceDeleteSchema.safeParse({}).success).toBe(false)
  })
})
