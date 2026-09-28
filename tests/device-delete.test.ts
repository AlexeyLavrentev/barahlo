import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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

const {
  deleteDevice,
  getDevice,
  createDevice,
  listDevices,
  exportDevices,
  searchPaletteDevices,
  totalDeviceCount,
  deviceCountByType,
  deviceCountByStatus,
} = deviceQueries
const { listRecentMovements, listIssuedByEmployee, assignDevice } =
  movementsQueries
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

function rawMovementCount(): number {
  return (
    db.$client.prepare('SELECT COUNT(*) AS n FROM movements').get() as {
      n: number
    }
  ).n
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

// ---- Parity walk and guard knives (Task 2, DEL-02, D-06, SC3/SC4) ----------

describe('parity walk — six surfaces lose exactly the deleted device (DEL-02, D-06, SC3)', () => {
  it('the deleted device disappears everywhere; the control does not drift', () => {
    const emp = newEmployee('Паритет Шесть')
    const target = newDevice()
    assignDevice(target, emp, { occurredAt: DAY('2026-09-01') })
    seedPhotoRow(target)
    const control = newDevice()
    assignDevice(control, emp, { occurredAt: DAY('2026-09-01') })
    seedPhotoRow(control)
    const targetSerial = rawDevice(target)!.serial_number
    const controlSerial = rawDevice(control)!.serial_number

    // Sanity: before the delete the target is present on every surface.
    expect(
      listDevices({ type: 'all', page: 1, pageSize: 200 }).rows.some(
        (row) => row.id === target,
      ),
    ).toBe(true)
    expect(exportDevices({ type: 'all' }).some((row) => row.id === target)).toBe(
      true,
    )
    expect(
      searchPaletteDevices({ q: targetSerial, limit: 10 }).some(
        (row) => row.id === target,
      ),
    ).toBe(true)
    expect(
      listRecentMovements(100).some((movement) => movement.deviceId === target),
    ).toBe(true)
    expect(listIssuedByEmployee(emp).some((row) => row.id === target)).toBe(true)

    const beforeList = listDevices({ type: 'all', page: 1, pageSize: 200 }).total
    const beforeTotal = totalDeviceCount()
    const beforeLaptop =
      deviceCountByType().find((c) => c.typeKey === 'laptop')!.n
    const beforeAssigned =
      deviceCountByStatus().find((c) => c.status === 'assigned')!.n

    deleteDevice(target)

    // 1. Реестр (listDevices).
    const list = listDevices({ type: 'all', page: 1, pageSize: 200 })
    expect(list.total).toBe(beforeList - 1)
    expect(list.rows.some((row) => row.id === target)).toBe(false)
    expect(list.rows.some((row) => row.id === control)).toBe(true)
    // 2. CSV-выгрузка (exportDevices — тот же deviceWhere).
    expect(exportDevices({ type: 'all' }).some((row) => row.id === target)).toBe(
      false,
    )
    expect(exportDevices({ type: 'all' }).some((row) => row.id === control)).toBe(
      true,
    )
    // 3. ⌘K-палитра (substring-поиск серийника).
    expect(
      searchPaletteDevices({ q: targetSerial, limit: 10 }).some(
        (row) => row.id === target,
      ),
    ).toBe(false)
    expect(
      searchPaletteDevices({ q: controlSerial, limit: 10 }).some(
        (row) => row.id === control,
      ),
    ).toBe(true)
    // 4. Лента дашборда (innerJoin devices — движений цели нет).
    expect(
      listRecentMovements(100).some((movement) => movement.deviceId === target),
    ).toBe(false)
    expect(
      listRecentMovements(100).some((movement) => movement.deviceId === control),
    ).toBe(true)
    // 5. Счётчики дашборда — ровно −1 в total, типе и статусе.
    expect(totalDeviceCount()).toBe(beforeTotal - 1)
    expect(deviceCountByType().find((c) => c.typeKey === 'laptop')!.n).toBe(
      beforeLaptop - 1,
    )
    expect(deviceCountByStatus().find((c) => c.status === 'assigned')!.n).toBe(
      beforeAssigned - 1,
    )
    // 6. «Выданное» у сотрудника.
    expect(listIssuedByEmployee(emp).some((row) => row.id === target)).toBe(
      false,
    )
    expect(listIssuedByEmployee(emp).some((row) => row.id === control)).toBe(true)
  })
})

describe('deleteDevice creates no movements (SC4, удаление ≠ списание)', () => {
  it('the whole-DB movements count is identical before and after', () => {
    const dev = newDevice()
    seedPhotoRow(dev)
    const before = rawMovementCount()

    deleteDevice(dev)

    expect(rawMovementCount()).toBe(before)
    expect(getDevice(dev)).toBeUndefined()
  })
})

describe('double delete (T-13-05)', () => {
  it('re-deleting is a cheap explicit DEVICE_GONE and no counter drifts', () => {
    const dev = newDevice()
    deleteDevice(dev)
    const total = totalDeviceCount()

    const thrown = captureThrown(() => deleteDevice(dev))
    expect((thrown as { code?: string }).code).toBe('DEVICE_GONE')
    expect(totalDeviceCount()).toBe(total)
    expect(rawMovements(dev)).toHaveLength(0)
    expect(rawAttachments(dev)).toHaveLength(0)
  })
})

// ---- Source gates (plan 13-02, T-13-01/02/04/06, D-01/D-02/D-05) ------------
//
// The action is a 'use server' module — vitest NEVER imports it (phase-12
// precedent, movement-edit.test.ts:577): the contract is pinned by reading
// the sources as text instead.

const ACTIONS_SRC = readFileSync(
  join(process.cwd(), 'app/(app)/devices/actions.ts'),
  'utf8',
)
const DEVICE_DELETE_SRC = readFileSync(
  join(process.cwd(), 'app/(app)/devices/device-delete-dialog.tsx'),
  'utf8',
)
const PAGE_SRC = readFileSync(
  join(process.cwd(), 'app/(app)/(card)/devices/[id]/page.tsx'),
  'utf8',
)
const DEVICES_SRC = readFileSync(
  join(process.cwd(), 'db/queries/devices.ts'),
  'utf8',
)

describe('phase 13 source gates — deleteDeviceAction contract', () => {
  const ACTION_BODY = ACTIONS_SRC.slice(
    ACTIONS_SRC.indexOf('export async function deleteDeviceAction'),
  )

  it('deleteDeviceAction starts with requireSession (directly POST-able, T-13-01)', () => {
    expect(ACTION_BODY.slice(0, 400)).toContain('await requireSession()')
  })

  it('machine {code} literals never return to the client (V7, T-13-06)', () => {
    // The mapper converts the query layer's codes to Russian copy BEFORE any
    // return — zero `error: { code` shapes anywhere in the action file.
    expect(ACTIONS_SRC.match(/error:\s*\{\s*code/g) ?? []).toEqual([])
    expect(ACTION_BODY).toContain('return { error: DEVICE_GONE_COPY }')
  })

  it("redirect('/devices') sits AFTER the closing catch — outside try/catch (Pitfall 1, D-05)", () => {
    const tryStart = ACTION_BODY.indexOf('try {')
    const catchStart = ACTION_BODY.indexOf('} catch')
    const redirectCall = ACTION_BODY.indexOf("redirect('/devices'")
    expect(tryStart).toBeGreaterThan(-1)
    expect(catchStart).toBeGreaterThan(tryStart)
    expect(redirectCall).toBeGreaterThan(catchStart)
    // The try block itself contains no redirect call — NEXT_REDIRECT can
    // never be swallowed into the error copy.
    expect(ACTION_BODY.slice(tryStart, catchStart)).not.toContain('redirect(')
  })
})

describe('phase 13 source gates — DeviceDeleteDialog island (D-02)', () => {
  it('carries every byte-exact needle of the 13-UI-SPEC register', () => {
    expect(DEVICE_DELETE_SRC).toContain('data-device-delete')
    expect(DEVICE_DELETE_SRC).toContain('Удалить устройство?')
    expect(DEVICE_DELETE_SRC).toContain('Не удалять')
    expect(DEVICE_DELETE_SRC).toContain('Удаляем…')
    expect(DEVICE_DELETE_SRC).toContain('bg-destructive')
    expect(DEVICE_DELETE_SRC).toContain('role="alert"')
    expect(DEVICE_DELETE_SRC).toContain('pluralMovementRecords')
    expect(DEVICE_DELETE_SRC).toContain('будут удалены безвозвратно.')
    expect(DEVICE_DELETE_SRC).toContain("from '@/app/(app)/devices/actions'")
  })

  it('no native browser confirmation anywhere in the island', () => {
    expect(DEVICE_DELETE_SRC.includes('window.confirm')).toBe(false)
  })

  it('the only form field is the hidden deviceId — no visible inputs, no type-to-confirm (D-02)', () => {
    const inputTags = DEVICE_DELETE_SRC.match(/<input\b[^>]*>/g) ?? []
    expect(inputTags.length).toBeGreaterThan(0)
    for (const tag of inputTags) {
      // Any visible/text input fails this gate — only type="hidden" passes
      // (type-to-confirm is rejected by D-02; the hidden deviceId is the one
      // legitimate POST field).
      expect(tag).toContain('type="hidden"')
    }
    expect(inputTags).toHaveLength(1)
    expect(inputTags[0]).toContain('name="deviceId"')
  })
})

describe('phase 13 source gates — card page zone placement (D-01, Pitfall 4)', () => {
  it('the delete zone renders after the disposed ternary AND after PhotoGrid — every status', () => {
    expect(PAGE_SRC).toContain('<DeviceDeleteDialog')
    const disposedTernary = PAGE_SRC.lastIndexOf("device.status !== 'disposed'")
    const photoGrid = PAGE_SRC.indexOf('<PhotoGrid')
    const zone = PAGE_SRC.indexOf('<DeviceDeleteDialog')
    expect(disposedTernary).toBeGreaterThan(-1)
    expect(photoGrid).toBeGreaterThan(-1)
    // lastIndexOf: even the LAST disposed conditional (PhotoGrid's canMutate)
    // precedes the zone — the zone is the section's final child, outside
    // every status branch.
    expect(zone).toBeGreaterThan(disposedTernary)
    expect(zone).toBeGreaterThan(photoGrid)
    expect(PAGE_SRC).toContain('historyCount=')
    expect(PAGE_SRC).toContain('photoCount=')
  })
})

describe('phase 13 source gates — query-layer delete perimeter (D-01 pin)', () => {
  it('deleteDevice carries no status precondition — existence is the only guard', () => {
    const start = DEVICES_SRC.indexOf('export function deleteDevice')
    // The function's closing brace sits at column 0 — the bound excludes the
    // following updateDevice doc-comment (which mentions "status" legally).
    const end = DEVICES_SRC.indexOf('\n}\n', start)
    const deleteBody = DEVICES_SRC.slice(start, end)
    expect(deleteBody).toContain("throw { code: 'DEVICE_GONE' }")
    expect(deleteBody).not.toMatch(/status/i)
  })
})
