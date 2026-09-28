import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll, afterEach, vi } from 'vitest'
import { applyMigrations } from './helpers'

// Phase 12 (HIST-01..03): schema matrix for the edit/delete keystone schemas
// plus the replay engine (Task 3). Bootstrap mirrors movements-queries.test.ts:
// point DATABASE_PATH at a temp database BEFORE the first @/db import, apply
// the real migrations (0002 — trigger drop — rides along automatically), then
// import dynamically.
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-edit-'))
process.env.DATABASE_PATH = join(tmpDir, 'movement-edit.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const movementsQueries = await import('@/db/queries/movements')
const schemaModule = await import('@/lib/movement-schema')

const { editMovement, deleteMovement } = movementsQueries
const {
  editMovementSchema,
  deleteMovementSchema,
  movementSchemas,
  occurredAtFromDate,
} = schemaModule

afterAll(() => {
  db.$client.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

// Day-precision instant of the office wall clock: the same day a dialog
// prefills (occurredAtDateIso) feeds occurredAtFromDate — both must agree.
function isoOf(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

const NOW = occurredAtFromDate('2026-09-03')
// 2026-09-03 01:00 MSK == 2026-09-02 22:00 UTC — the frozen-clock probe of
// the movement-schema tests (c9c87bc precedent).
const MSK_0100 = new Date('2026-09-02T22:00:00.000Z')

afterEach(() => {
  vi.useRealTimers()
})

describe('editMovementSchema — person slots by event type (D-01)', () => {
  const base = {
    deviceId: 1,
    movementId: 2,
    occurredAt: '2026-09-01',
  }

  it('parses a valid assigned edit (type + employee + date + comment)', () => {
    const parsed = editMovementSchema.parse({
      ...base,
      eventType: 'assigned',
      employeeId: 7,
      comment: 'исправил дату выдачи',
    })
    expect(parsed).toMatchObject({
      deviceId: 1,
      movementId: 2,
      eventType: 'assigned',
      employeeId: 7,
      occurredAt: '2026-09-01',
      comment: 'исправил дату выдачи',
    })
  })

  it('rejects an eventType outside the keystone vocabulary', () => {
    expect(
      editMovementSchema.safeParse({ ...base, eventType: 'purchased' }).success,
    ).toBe(false)
  })

  it('assigned requires employeeId', () => {
    const r = editMovementSchema.safeParse({ ...base, eventType: 'assigned' })
    expect(r.success).toBe(false)
  })

  it('transferred requires BOTH employeeId and fromEmployeeId', () => {
    const r1 = editMovementSchema.safeParse({
      ...base,
      eventType: 'transferred',
      employeeId: 7,
    })
    expect(r1.success).toBe(false)
    const r2 = editMovementSchema.safeParse({
      ...base,
      eventType: 'transferred',
      fromEmployeeId: 7,
    })
    expect(r2.success).toBe(false)
    const r3 = editMovementSchema.safeParse({
      ...base,
      eventType: 'transferred',
      employeeId: 7,
      fromEmployeeId: 8,
    })
    expect(r3.success).toBe(true)
  })

  it('returned requires fromEmployeeId', () => {
    const r1 = editMovementSchema.safeParse({ ...base, eventType: 'returned' })
    expect(r1.success).toBe(false)
    const r2 = editMovementSchema.safeParse({
      ...base,
      eventType: 'returned',
      fromEmployeeId: 8,
    })
    expect(r2.success).toBe(true)
  })

  it('slotless types keep person slots optional at schema level (server derives and NULLs)', () => {
    // NB: 'disposed' is NOT here — its comment requirement is the dispose
    // parity case below.
    for (const eventType of ['received', 'to_repair', 'from_repair'] as const) {
      expect(
        editMovementSchema.safeParse({ ...base, eventType }).success,
      ).toBe(true)
    }
  })

  it('disposed requires a non-empty comment (dispose parity)', () => {
    expect(
      editMovementSchema.safeParse({ ...base, eventType: 'disposed' }).success,
    ).toBe(false)
    expect(
      editMovementSchema.safeParse({
        ...base,
        eventType: 'disposed',
        comment: '   ',
      }).success,
    ).toBe(false)
    expect(
      editMovementSchema.safeParse({
        ...base,
        eventType: 'disposed',
        comment: 'ошибочно внесено',
      }).success,
    ).toBe(true)
  })
})

describe('editMovementSchema — validation parity with create (D-02, SC4)', () => {
  const base = {
    deviceId: 1,
    movementId: 2,
    eventType: 'received',
  }

  it('rejects a malformed date (DATE_PATTERN)', () => {
    expect(
      editMovementSchema.safeParse({ ...base, occurredAt: '01.09.2026' })
        .success,
    ).toBe(false)
  })

  it('rejects a future date (DISPLAY_TZ boundary, frozen clock)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(MSK_0100)
    expect(
      editMovementSchema.safeParse({ ...base, occurredAt: '2026-09-04' })
        .success,
    ).toBe(false)
    expect(
      editMovementSchema.safeParse({ ...base, occurredAt: '2026-09-03' })
        .success,
    ).toBe(true)
  })

  it('rejects a CLEARED date both ways — absent key and empty string (revise-fix)', () => {
    // Create-semantics «empty = now» (the occurredAtFromDate early return)
    // must be unreachable from the edit path: the field is always prefilled
    // with the record's own day, so an empty submit is input error.
    const absent = { ...base }
    expect(editMovementSchema.safeParse(absent).success).toBe(false)
    expect(
      editMovementSchema.safeParse({ ...base, occurredAt: '' }).success,
    ).toBe(false)
  })

  it('rejects a comment longer than 500', () => {
    expect(
      editMovementSchema.safeParse({
        ...base,
        occurredAt: '2026-09-01',
        comment: 'x'.repeat(501),
      }).success,
    ).toBe(false)
  })

  it('strictObject rejects injected projection keys (status, device_id)', () => {
    expect(
      editMovementSchema.safeParse({
        ...base,
        occurredAt: '2026-09-01',
        status: 'assigned',
      }).success,
    ).toBe(false)
    expect(
      editMovementSchema.safeParse({
        ...base,
        occurredAt: '2026-09-01',
        device_id: 5,
      }).success,
    ).toBe(false)
  })

  it('coerces FormData string ids into positive ints', () => {
    const parsed = editMovementSchema.parse({
      deviceId: '3',
      movementId: '4',
      eventType: 'received',
      occurredAt: '2026-09-01',
    })
    expect(parsed.deviceId).toBe(3)
    expect(parsed.movementId).toBe(4)
  })
})

describe('deleteMovementSchema — minimal and strict', () => {
  it('parses deviceId + movementId and rejects extra keys', () => {
    expect(
      deleteMovementSchema.parse({ deviceId: '1', movementId: '2' }),
    ).toMatchObject({ deviceId: 1, movementId: 2 })
    expect(
      deleteMovementSchema.safeParse({
        deviceId: 1,
        movementId: 2,
        comment: 'x',
      }).success,
    ).toBe(false)
  })
})

describe('keystone registration', () => {
  it('movementSchemas.edit is THE editMovementSchema (no parallel dictionary)', () => {
    expect(movementSchemas.edit).toBe(editMovementSchema)
  })
})
