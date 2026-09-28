import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
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
const employeeQueries = await import('@/db/queries/employees')
const deviceQueries = await import('@/db/queries/devices')
const schemaModule = await import('@/lib/movement-schema')

const { editMovement, deleteMovement, listTimeline, listIssuedByEmployee } =
  movementsQueries
const { createEmployee, setEmployeeArchived } = employeeQueries
const { createDevice } = deviceQueries
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

// ---- Replay engine (Task 3) -------------------------------------------------

let serialCounter = 0
let nameCounter = 0

function newDevice(): number {
  serialCounter += 1
  return createDevice({
    typeKey: 'laptop',
    model: 'Replay Тестовая модель',
    serialNumber: `RE-${String(serialCounter).padStart(5, '0')}`,
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
  return db.$client.prepare('SELECT * FROM devices WHERE id = ?').get(id) as {
    id: number
    status: string
    current_employee_id: number | null
  }
}

function rawMovements(deviceId: number) {
  return db.$client
    .prepare('SELECT * FROM movements WHERE device_id = ? ORDER BY id')
    .all(deviceId) as {
    id: number
    event_type: string
    from_employee_id: number | null
    to_employee_id: number | null
    comment: string | null
    occurred_at: number
  }[]
}

function captureThrown(fn: () => void): unknown {
  try {
    fn()
  } catch (e) {
    return e
  }
  return undefined
}

const DAY = (iso: string) => occurredAtFromDate(iso)

describe('editMovement — happy path, slots, projection (HIST-01, D-01/D-04)', () => {
  it('edits employee/date/comment of a record; timeline reorders by the new date', () => {
    const dev = newDevice()
    const emp1 = newEmployee('Держатель Первый')
    const emp2 = newEmployee('Держатель Второй')
    const { assignDevice, acceptDevice } = movementsQueries
    assignDevice(dev, emp1, { occurredAt: DAY('2026-09-01') })
    acceptDevice(dev, { occurredAt: DAY('2026-09-02') })
    assignDevice(dev, emp2, { occurredAt: DAY('2026-09-03') })
    const secondAssignedId = rawMovements(dev).find(
      (r) => r.event_type === 'assigned' && r.to_employee_id === emp2,
    )!.id

    // The edited date (09-02) collides with the returned event's instant —
    // same day, same wall time → same occurred_at seconds; the id tiebreaker
    // keeps the chain valid (returned id < second-assigned id).
    editMovement(dev, secondAssignedId, {
      eventType: 'assigned',
      employeeId: emp2,
      occurredAt: DAY('2026-09-02'),
      comment: 'выдан снова в тот же день',
    })

    const row = rawMovements(dev).find((r) => r.id === secondAssignedId)!
    expect(row.occurred_at).toBe(Math.floor(DAY('2026-09-02').getTime() / 1000))
    expect(row.comment).toBe('выдан снова в тот же день')
    // The edited row moved from 09-03 to 09-02 — but shares the returned
    // event's instant, so id DESC puts it first in the timeline (reorder by
    // date + tiebreaker, mirror of the replay order).
    const timeline = listTimeline(dev)
    expect(timeline[0]!.id).toBe(secondAssignedId)
    // Projection unchanged: still assigned to emp2.
    expect(rawDevice(dev).status).toBe('assigned')
    expect(rawDevice(dev).current_employee_id).toBe(emp2)
  })

  it('derives slots from the new type: assigned → to, returned → from, slotless → both NULL', () => {
    const dev = newDevice()
    const emp = newEmployee('Слот Стираемый')
    const { assignDevice } = movementsQueries
    assignDevice(dev, emp, { occurredAt: DAY('2026-09-01') })
    const assignedId = rawMovements(dev)[0]!.id

    // assigned → to_repair: person slots wiped (locked derivation).
    editMovement(dev, assignedId, {
      eventType: 'to_repair',
      occurredAt: DAY('2026-09-01'),
      comment: null,
    })
    const row = rawMovements(dev).find((r) => r.id === assignedId)!
    expect(row.event_type).toBe('to_repair')
    expect(row.from_employee_id).toBeNull()
    expect(row.to_employee_id).toBeNull()
    expect(rawDevice(dev).status).toBe('repair')

    // back to assigned with a new employee: to-slot restored.
    const emp2 = newEmployee('Слот Возвращённый')
    editMovement(dev, assignedId, {
      eventType: 'assigned',
      employeeId: emp2,
      occurredAt: DAY('2026-09-01'),
      comment: null,
    })
    const row2 = rawMovements(dev).find((r) => r.id === assignedId)!
    expect(row2.event_type).toBe('assigned')
    expect(row2.to_employee_id).toBe(emp2)
    expect(row2.from_employee_id).toBeNull()
    expect(rawDevice(dev).status).toBe('assigned')
    expect(rawDevice(dev).current_employee_id).toBe(emp2)
  })

  it('backdates the assigned event → listIssuedByEmployee.issuedAt follows (HIST-03 parity)', () => {
    const dev = newDevice()
    const emp = newEmployee('Паритет Дат')
    const { assignDevice } = movementsQueries
    assignDevice(dev, emp, { occurredAt: DAY('2026-09-10') })
    const assignedId = rawMovements(dev)[0]!.id

    editMovement(dev, assignedId, {
      eventType: 'assigned',
      employeeId: emp,
      occurredAt: DAY('2026-09-02'),
      comment: null,
    })

    const issued = listIssuedByEmployee(emp).find((d) => d.id === dev)!
    expect(issued.issuedAt!.toISOString().slice(0, 10)).toBe(
      new Date(Math.floor(DAY('2026-09-02').getTime() / 1000) * 1000)
        .toISOString()
        .slice(0, 10),
    )
  })
})

describe('deleteMovement — projection by replay (HIST-02, D-05/D-06)', () => {
  it('deleting the LAST assigned returns the device to in_stock (SC3)', () => {
    const dev = newDevice()
    const emp = newEmployee('Последняя Выдача')
    const { assignDevice } = movementsQueries
    assignDevice(dev, emp, { occurredAt: DAY('2026-09-01') })
    const assignedId = rawMovements(dev)[0]!.id

    deleteMovement(dev, assignedId)
    expect(rawMovements(dev)).toHaveLength(0)
    expect(rawDevice(dev).status).toBe('in_stock')
    expect(rawDevice(dev).current_employee_id).toBeNull()
  })

  it('deleting the only «Поступление» keeps the chain valid (D-05)', () => {
    const dev = newDevice()
    db.$client
      .prepare(
        "INSERT INTO movements (device_id, event_type, occurred_at, created_at) VALUES (?, 'received', unixepoch(), unixepoch())",
      )
      .run(dev)
    const receivedId = rawMovements(dev)[0]!.id

    deleteMovement(dev, receivedId)
    expect(rawMovements(dev)).toHaveLength(0)
    expect(rawDevice(dev).status).toBe('in_stock')
  })

  it('deleting the disposed record un-disposes the device (D-06)', () => {
    const dev = newDevice()
    const { disposeDevice } = movementsQueries
    disposeDevice(dev, { occurredAt: DAY('2026-09-01'), comment: 'ошибочно' })
    const disposedId = rawMovements(dev).find(
      (r) => r.event_type === 'disposed',
    )!.id

    deleteMovement(dev, disposedId)
    expect(rawDevice(dev).status).toBe('in_stock')
    expect(rawDevice(dev).current_employee_id).toBeNull()
  })
})

describe('replay guard — invalid chain = zero writes (D-03)', () => {
  it('an edit making two «Выдачи» in a row throws INVALID_CHAIN and writes NOTHING', () => {
    const dev = newDevice()
    const emp1 = newEmployee('Цепь Один')
    const emp2 = newEmployee('Цепь Два')
    const { assignDevice, acceptDevice } = movementsQueries
    assignDevice(dev, emp1, { occurredAt: DAY('2026-09-01') })
    acceptDevice(dev, { occurredAt: DAY('2026-09-02') })
    assignDevice(dev, emp2, { occurredAt: DAY('2026-09-03') })
    const returnedId = rawMovements(dev).find(
      (r) => r.event_type === 'returned',
    )!.id
    const before = rawMovements(dev)

    const thrown = captureThrown(() =>
      editMovement(dev, returnedId, {
        eventType: 'assigned',
        employeeId: emp1,
        occurredAt: DAY('2026-09-03'),
        comment: null,
      }),
    )
    expect((thrown as { code?: string }).code).toBe('INVALID_CHAIN')
    expect(rawMovements(dev)).toEqual(before)
  })
})

describe('device scoping and idempotence (T-12-01, Pitfall 1)', () => {
  it('a foreign movementId is MOVEMENT_GONE and changes nothing', () => {
    const devA = newDevice()
    const devB = newDevice()
    const emp = newEmployee('Чужой Айд')
    const { assignDevice } = movementsQueries
    assignDevice(devA, emp, { occurredAt: DAY('2026-09-01') })
    assignDevice(devB, emp, { occurredAt: DAY('2026-09-01') })
    const foreignId = rawMovements(devB)[0]!.id
    const before = rawMovements(devA)

    const thrown = captureThrown(() =>
      editMovement(devA, foreignId, {
        eventType: 'returned',
        fromEmployeeId: emp,
        occurredAt: DAY('2026-09-01'),
        comment: null,
      }),
    )
    expect((thrown as { code?: string }).code).toBe('MOVEMENT_GONE')
    expect(rawMovements(devA)).toEqual(before)

    const delThrown = captureThrown(() => deleteMovement(devA, foreignId))
    expect((delThrown as { code?: string }).code).toBe('MOVEMENT_GONE')
  })

  it('re-deleting the same record is a cheap explicit MOVEMENT_GONE (HIST-02)', () => {
    const dev = newDevice()
    db.$client
      .prepare(
        "INSERT INTO movements (device_id, event_type, occurred_at, created_at) VALUES (?, 'received', unixepoch(), unixepoch())",
      )
      .run(dev)
    const id = rawMovements(dev)[0]!.id
    deleteMovement(dev, id)
    const thrown = captureThrown(() => deleteMovement(dev, id))
    expect((thrown as { code?: string }).code).toBe('MOVEMENT_GONE')
  })
})

describe('employee activity parity (OQ2, T-12-04)', () => {
  it('editing the DATE of a record whose holder is archived succeeds (untouched slot survives)', () => {
    const dev = newDevice()
    const emp = newEmployee('Архив Держится')
    const { assignDevice } = movementsQueries
    assignDevice(dev, emp, { occurredAt: DAY('2026-09-01') })
    setEmployeeArchived(emp, true)
    const assignedId = rawMovements(dev)[0]!.id

    expect(() =>
      editMovement(dev, assignedId, {
        eventType: 'assigned',
        employeeId: emp,
        occurredAt: DAY('2026-09-02'),
        comment: null,
      }),
    ).not.toThrow()
    expect(rawDevice(dev).current_employee_id).toBe(emp)
  })

  it('CHANGING a slot to an archived employee is EMPLOYEE_INACTIVE', () => {
    const dev = newDevice()
    const emp1 = newEmployee('Активный Сменяется')
    const archived = newEmployee('Архивный Цель')
    const { assignDevice } = movementsQueries
    assignDevice(dev, emp1, { occurredAt: DAY('2026-09-01') })
    setEmployeeArchived(archived, true)
    const assignedId = rawMovements(dev)[0]!.id

    const thrown = captureThrown(() =>
      editMovement(dev, assignedId, {
        eventType: 'assigned',
        employeeId: archived,
        occurredAt: DAY('2026-09-01'),
        comment: null,
      }),
    )
    expect((thrown as { code?: string }).code).toBe('EMPLOYEE_INACTIVE')
  })
})

describe('replay determinism — shared occurredAt (Pitfall 2)', () => {
  it('same-timestamp events replay by id: the projection is deterministic', () => {
    const dev = newDevice()
    const emp1 = newEmployee('Тайбрейк Один')
    const emp2 = newEmployee('Тайбрейк Два')
    const { assignDevice } = movementsQueries
    const t = DAY('2026-09-01')
    assignDevice(dev, emp1, { occurredAt: t })
    const assignedId = rawMovements(dev)[0]!.id
    // A transferred event sharing the assigned event's exact occurred_at —
    // replay MUST order by id (assigned first, transferred second).
    db.$client
      .prepare(
        "INSERT INTO movements (device_id, event_type, from_employee_id, to_employee_id, occurred_at, created_at) VALUES (?, 'transferred', ?, ?, ?, unixepoch())",
      )
      .run(dev, emp1, emp2, Math.floor(t.getTime() / 1000))
    expect(rawDevice(dev).status).toBe('assigned')

    // Re-editing the first record re-runs replay — the outcome must not flip.
    editMovement(dev, assignedId, {
      eventType: 'assigned',
      employeeId: emp1,
      occurredAt: t,
      comment: null,
    })
    expect(rawDevice(dev).status).toBe('assigned')
    expect(rawDevice(dev).current_employee_id).toBe(emp2)
  })
})

// ---- Source gates (plan 12-02, threat model T-12-07..T-12-10) ---------------

const ACTIONS_SRC = readFileSync(
  join(process.cwd(), 'app/(app)/devices/actions.ts'),
  'utf8',
)
const TIMELINE_SRC = readFileSync(
  join(process.cwd(), 'app/(app)/(card)/devices/[id]/timeline.tsx'),
  'utf8',
)
const DIALOGS_SRC = readFileSync(
  join(
    process.cwd(),
    'app/(app)/(card)/devices/[id]/movement-edit-dialogs.tsx',
  ),
  'utf8',
)

describe('phase 12 source gates', () => {
  it('both mutation actions start with requireSession (directly POST-able)', () => {
    for (const name of ['editMovementAction', 'deleteMovementAction']) {
      const body = ACTIONS_SRC.slice(ACTIONS_SRC.indexOf(`async function ${name}`))
      expect(body.slice(0, 400)).toContain('await requireSession()')
    }
  })

  it('neither action reads status/currentEmployeeId from FormData', () => {
    expect(
      ACTIONS_SRC.match(
        /formData\.get\(\s*['"](status|currentEmployeeId)['"]\s*\)/g,
      ) ?? [],
    ).toEqual([])
  })

  it('machine {code} literals never return to the client (V7)', () => {
    // The mapper converts codes to Russian copy BEFORE any return.
    expect(ACTIONS_SRC).toContain('movementMutationErrorOf(error, SAVE_ERROR)')
    expect(ACTIONS_SRC).toContain('movementMutationErrorOf(error, DELETE_ERROR)')
    expect(ACTIONS_SRC.match(/error:\s*\{\s*code/g) ?? []).toEqual([])
  })

  it('timeline rows carry both needles; both dialogs exist (UAT selectors)', () => {
    expect(TIMELINE_SRC).toContain('data-timeline-edit={event.id}')
    expect(TIMELINE_SRC).toContain('data-timeline-delete={event.id}')
    expect(DIALOGS_SRC).toContain('export function MovementEditDialog')
    expect(DIALOGS_SRC).toContain('export function MovementDeleteConfirmDialog')
  })

  it('no native browser confirmation anywhere in the two UI files', () => {
    expect(TIMELINE_SRC.includes('window.confirm')).toBe(false)
    expect(DIALOGS_SRC.includes('window.confirm')).toBe(false)
  })
})
