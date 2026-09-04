import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { applyMigrations } from './helpers'

// db/queries/movements.ts is bound to the module-level db from @/db, which
// opens DATABASE_PATH at import time. Point it at a temp database BEFORE the
// first @/db import (dynamic imports below keep that ordering), then apply the
// real migrations to the same connection via db.$client (same bootstrap as
// devices-queries.test.ts).
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-movements-'))
process.env.DATABASE_PATH = join(tmpDir, 'movements.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const movementsQueries = await import('@/db/queries/movements')
const employeeQueries = await import('@/db/queries/employees')
const deviceQueries = await import('@/db/queries/devices')
const schemaModule = await import('@/lib/movement-schema')

const {
  assignDevice,
  acceptDevice,
  transferDevice,
  returnAllDevices,
  listTimeline,
  listIssuedByEmployee,
  listActiveEmployees,
} = movementsQueries
const { createEmployee, setEmployeeArchived } = employeeQueries
const { createDevice } = deviceQueries
const { assignSchema, acceptSchema, transferSchema, occurredAtFromDate } =
  schemaModule

afterAll(() => {
  db.$client.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

let serialCounter = 0

// Fresh device per test — unique serial keeps the UNIQUE index out of the way.
function newDevice(model = 'Custody Тестовая модель'): number {
  serialCounter += 1
  return createDevice({
    typeKey: 'laptop',
    model,
    serialNumber: `MV-${String(serialCounter).padStart(5, '0')}`,
    inventoryNumber: null,
    purchaseDate: null,
    purchasePrice: null,
    supplier: null,
    warrantyUntil: null,
    notes: null,
  })
}

// Names are NOT unique (D-04 of phase 2) — a counter suffix keeps humans apart
// in failure output, departments resolve to the same row.
let nameCounter = 0
function newEmployee(name: string) {
  nameCounter += 1
  return createEmployee({
    name: `${name} ${nameCounter}`,
    departmentName: 'ИТ',
  })
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

function movementsCount(): number {
  return (
    db.$client.prepare('SELECT count(*) AS n FROM movements').get() as {
      n: number
    }
  ).n
}

function captureThrown(fn: () => void): unknown {
  let thrown: unknown
  try {
    fn()
  } catch (e) {
    thrown = e
  }
  return thrown
}

// Local yyyy-mm-dd N days from today (the shape input[type=date] submits).
function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000)
}

describe('assignDevice — guard + atomic event/projection (MOVE-01, RESEARCH C1)', () => {
  it('assign from in_stock writes the assigned event and the projection in one tx', () => {
    const emp = newEmployee('Выдача Кому')
    const dev = newDevice()
    assignDevice(dev, emp.id)
    const row = rawDevice(dev)
    expect(row.status).toBe('assigned')
    expect(row.current_employee_id).toBe(emp.id)
    const events = rawMovements(dev)
    expect(events).toHaveLength(1)
    expect(events[0].event_type).toBe('assigned')
    expect(events[0].to_employee_id).toBe(emp.id)
    expect(events[0].from_employee_id).toBeNull()
    expect(events[0].occurred_at).toBeGreaterThan(0)
  })

  it('assign accepts a backdated occurredAt and a comment (D-01)', () => {
    const emp = newEmployee('Выдача Задним')
    const dev = newDevice()
    const yesterday = daysAgo(1)
    assignDevice(dev, emp.id, { occurredAt: yesterday, comment: 'Акт 7' })
    const event = rawMovements(dev)[0]
    expect(event.comment).toBe('Акт 7')
    // timestamp mode stores whole seconds
    expect(event.occurred_at).toBe(Math.floor(yesterday.getTime() / 1000))
  })

  it('assign rejects assigned/repair/disposed with ZERO side effects (D-08 guard)', () => {
    for (const status of ['assigned', 'repair', 'disposed']) {
      const dev = newDevice()
      const emp = newEmployee(`Выдача Страж ${status}`)
      db.$client
        .prepare(
          'UPDATE devices SET status = ?, current_employee_id = ? WHERE id = ?',
        )
        .run(status, status === 'assigned' ? emp.id : null, dev.id)
      const before = movementsCount()
      const thrown = captureThrown(() => assignDevice(dev, emp.id))
      expect(thrown).toEqual({ code: 'ILLEGAL_TRANSITION' })
      const row = rawDevice(dev)
      expect(row.status).toBe(status)
      expect(row.current_employee_id).toBe(status === 'assigned' ? emp.id : null)
      expect(movementsCount()).toBe(before)
    }
  })

  it('assign requires an ACTIVE target employee (C2 matrix)', () => {
    const archived = newEmployee('Выдача В Архиве')
    setEmployeeArchived(archived.id, true)
    const dev = newDevice()
    const before = movementsCount()
    expect(captureThrown(() => assignDevice(dev, archived.id))).toEqual({
      code: 'EMPLOYEE_INACTIVE',
    })
    expect(captureThrown(() => assignDevice(dev, 424242))).toEqual({
      code: 'EMPLOYEE_INACTIVE',
    })
    expect(rawDevice(dev).status).toBe('in_stock')
    expect(movementsCount()).toBe(before)
  })
})

describe('acceptDevice — assigned → stock (MOVE-02)', () => {
  it('accept writes returned from the holder and clears the projection', () => {
    const emp = newEmployee('Приём От Кого')
    const dev = newDevice()
    assignDevice(dev, emp.id)
    acceptDevice(dev)
    const row = rawDevice(dev)
    expect(row.status).toBe('in_stock')
    expect(row.current_employee_id).toBeNull()
    const events = rawMovements(dev)
    expect(events).toHaveLength(2)
    expect(events[1].event_type).toBe('returned')
    expect(events[1].from_employee_id).toBe(emp.id)
    expect(events[1].to_employee_id).toBeNull()
  })

  it('accept rejects a device that is not assigned', () => {
    const dev = newDevice()
    const before = movementsCount()
    expect(captureThrown(() => acceptDevice(dev))).toEqual({
      code: 'ILLEGAL_TRANSITION',
    })
    expect(rawDevice(dev).status).toBe('in_stock')
    expect(movementsCount()).toBe(before)
  })
})

describe('transferDevice — holder swap (MOVE-03)', () => {
  it('transfer writes transferred from old to new and swaps the holder', () => {
    const empA = newEmployee('Передача От')
    const empB = newEmployee('Передача Кому')
    const dev = newDevice()
    assignDevice(dev, empA.id)
    transferDevice(dev, empB.id)
    const row = rawDevice(dev)
    expect(row.status).toBe('assigned')
    expect(row.current_employee_id).toBe(empB.id)
    const events = rawMovements(dev)
    expect(events).toHaveLength(2)
    expect(events[1].event_type).toBe('transferred')
    expect(events[1].from_employee_id).toBe(empA.id)
    expect(events[1].to_employee_id).toBe(empB.id)
  })

  it('transfer to the current holder is rejected (adjacency)', () => {
    const emp = newEmployee('Передача Себе')
    const dev = newDevice()
    assignDevice(dev, emp.id)
    const before = movementsCount()
    expect(captureThrown(() => transferDevice(dev, emp.id))).toEqual({
      code: 'ILLEGAL_TRANSITION',
    })
    expect(rawDevice(dev).current_employee_id).toBe(emp.id)
    expect(movementsCount()).toBe(before)
  })

  it('transfer rejects devices that are not assigned', () => {
    const emp = newEmployee('Передача Мимо')
    const dev = newDevice()
    const before = movementsCount()
    expect(captureThrown(() => transferDevice(dev, emp.id))).toEqual({
      code: 'ILLEGAL_TRANSITION',
    })
    expect(movementsCount()).toBe(before)
  })
})

describe('movement schemas — whitelist + D-01 bounds', () => {
  it('accepts a minimal assign payload with coerced ids', () => {
    const parsed = assignSchema.safeParse({
      deviceId: '1',
      employeeId: '2',
      comment: undefined,
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects an empty employee id (coerces to 0, not positive)', () => {
    const parsed = assignSchema.safeParse({ deviceId: '1', employeeId: '' })
    expect(parsed.success).toBe(false)
  })

  it('rejects a future occurredAt, accepts yesterday and today (D-01)', () => {
    const future = assignSchema.safeParse({
      deviceId: '1',
      employeeId: '2',
      occurredAt: isoDaysFromNow(1),
    })
    expect(future.success).toBe(false)
    const yesterday = assignSchema.safeParse({
      deviceId: '1',
      employeeId: '2',
      occurredAt: isoDaysFromNow(-1),
    })
    expect(yesterday.success).toBe(true)
    const today = assignSchema.safeParse({
      deviceId: '1',
      employeeId: '2',
      occurredAt: isoDaysFromNow(0),
    })
    expect(today.success).toBe(true)
  })

  it('rejects a malformed occurredAt (regex)', () => {
    const parsed = assignSchema.safeParse({
      deviceId: '1',
      employeeId: '2',
      occurredAt: '2026-13-45',
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects comments over 500 chars, accepts exactly 500', () => {
    expect(
      assignSchema.safeParse({ deviceId: '1', employeeId: '2', comment: 'а'.repeat(500) })
        .success,
    ).toBe(true)
    expect(
      assignSchema.safeParse({ deviceId: '1', employeeId: '2', comment: 'а'.repeat(501) })
        .success,
    ).toBe(false)
  })

  it('accept schema is strict: an employeeId key is a tampering signal', () => {
    const parsed = acceptSchema.safeParse({ deviceId: '1', employeeId: '2' })
    expect(parsed.success).toBe(false)
  })

  it('transfer schema rejects the current holder (passed as an argument)', () => {
    expect(
      transferSchema(5).safeParse({ deviceId: '1', employeeId: '5' }).success,
    ).toBe(false)
    expect(
      transferSchema(5).safeParse({ deviceId: '1', employeeId: '6' }).success,
    ).toBe(true)
    expect(
      transferSchema(null).safeParse({ deviceId: '1', employeeId: '5' }).success,
    ).toBe(true)
  })

  it('occurredAtFromDate: backdated day keeps now time-of-day (C7)', () => {
    const before = new Date()
    const back = occurredAtFromDate(isoDaysFromNow(-2))
    const after = new Date()
    const [y, m, d] = isoDaysFromNow(-2).split('-').map(Number)
    expect(back.getFullYear()).toBe(y)
    expect(back.getMonth()).toBe(m - 1)
    expect(back.getDate()).toBe(d)
    // Time-of-day is «now» (±1h tolerance against an hour-boundary race)
    expect(Math.abs(back.getHours() - after.getHours())).toBeLessThanOrEqual(1)
    expect(back.getTime()).toBeLessThan(before.getTime())
    expect(occurredAtFromDate(undefined).getTime()).toBeLessThanOrEqual(
      after.getTime(),
    )
  })
})

describe('returnAllDevices — one tx, N events (D-07, RESEARCH C3)', () => {
  it('returns every held device with one returned event each', () => {
    const emp = newEmployee('Возврат Всё')
    const other = newEmployee('Возврат Чужой')
    const dev1 = newDevice()
    const dev2 = newDevice()
    const dev3 = newDevice()
    const dev4 = newDevice()
    assignDevice(dev1, emp.id)
    assignDevice(dev2, emp.id)
    assignDevice(dev4, other.id)
    // dev3 stays in_stock — not the employee's
    const n = returnAllDevices(emp.id)
    expect(n).toBe(2)
    for (const dev of [dev1, dev2]) {
      const row = rawDevice(dev)
      expect(row.status).toBe('in_stock')
      expect(row.current_employee_id).toBeNull()
      const events = rawMovements(dev)
      expect(events[events.length - 1].event_type).toBe('returned')
      expect(events[events.length - 1].from_employee_id).toBe(emp.id)
    }
    // The other employee's device is untouched
    expect(rawDevice(dev4).status).toBe('assigned')
    expect(rawDevice(dev4).current_employee_id).toBe(other.id)
  })

  it('is a no-op for an employee without devices', () => {
    expect(returnAllDevices(newEmployee('Возврат Пусто').id)).toBe(0)
  })

  it('injected mid-flight failure rolls back ALL events and projections (D-07)', () => {
    const emp = newEmployee('Возврат Откат')
    const devA = newDevice()
    const devB = newDevice()
    assignDevice(devA, emp.id)
    assignDevice(devB, emp.id)
    const before = movementsCount()
    // Landmine: the SECOND returned insert aborts — the first event and the
    // first projection must not survive (transaction rollback).
    db.$client.exec(
      `CREATE TRIGGER inject_return_all_fail BEFORE INSERT ON movements
       WHEN NEW.event_type = 'returned'
         AND (SELECT count(*) FROM movements WHERE event_type = 'returned') >= 1
       BEGIN SELECT RAISE(ABORT, 'injected return-all failure'); END;`,
    )
    try {
      const thrown = captureThrown(() => returnAllDevices(emp.id))
      expect(thrown).toBeDefined()
    } finally {
      db.$client.exec('DROP TRIGGER IF EXISTS inject_return_all_fail')
    }
    expect(rawDevice(devA).status).toBe('assigned')
    expect(rawDevice(devA).current_employee_id).toBe(emp.id)
    expect(rawDevice(devB).status).toBe('assigned')
    expect(rawDevice(devB).current_employee_id).toBe(emp.id)
    expect(movementsCount()).toBe(before)
  })
})

describe('listTimeline — order and names (MOVE-04, RESEARCH C4)', () => {
  it('orders backdated events by occurredAt; id breaks ties', () => {
    const empA = newEmployee('Таймлайн А')
    const empB = newEmployee('Таймлайн Б')
    const dev = newDevice('Таймлайн Модель')
    // Insertion order ids 1,2,3 — occurredAt deliberately out of insertion order
    assignDevice(dev, empA.id, { occurredAt: daysAgo(3) })
    transferDevice(dev, empB.id, { occurredAt: daysAgo(1) })
    acceptDevice(dev, { occurredAt: daysAgo(2) })
    const events = listTimeline(dev)
    expect(events.map((e) => e.eventType)).toEqual([
      'transferred',
      'returned',
      'assigned',
    ])
    // Same-second events: the newer id renders first
    const ts = Math.floor(Date.now() / 1000)
    const ins = db.$client.prepare(
      "INSERT INTO movements (device_id, event_type, occurred_at, created_at) VALUES (?, 'received', ?, unixepoch())",
    )
    ins.run(dev, ts)
    ins.run(dev, ts)
    const again = listTimeline(dev)
    expect(again[0].eventType).toBe('received')
    expect(again[1].eventType).toBe('received')
    expect(again[0].id).toBeGreaterThan(again[1].id)
  })

  it('resolves holder names via the alias join, including archived employees', () => {
    const empA = newEmployee('Архивный Держатель')
    const empB = newEmployee('Активный Приёмник')
    const dev = newDevice()
    assignDevice(dev, empA.id)
    transferDevice(dev, empB.id)
    setEmployeeArchived(empA.id, true)
    const transfer = listTimeline(dev).find((e) => e.eventType === 'transferred')
    expect(transfer).toBeDefined()
    expect(transfer!.fromName).toBe(empA.name)
    expect(transfer!.toName).toBe(empB.name)
  })

  it('returns [] for a device without events', () => {
    expect(listTimeline(newDevice())).toEqual([])
  })
})

describe('listIssuedByEmployee — issued list (EMP-02, RESEARCH C6)', () => {
  it('lists only devices currently assigned to the holder', () => {
    const emp = newEmployee('Выданной Список')
    const other = newEmployee('Выданной Другой')
    const dev1 = newDevice()
    const dev2 = newDevice()
    const dev3 = newDevice()
    const dev4 = newDevice()
    assignDevice(dev1, emp.id)
    assignDevice(dev2, emp.id)
    assignDevice(dev4, other.id)
    const issued = listIssuedByEmployee(emp.id)
    expect(issued.map((d) => d.id).sort()).toEqual([dev1, dev2].sort())
    // dev3 (in_stock) is absent — implicitly covered by the length check above
  })

  it('issuedAt is the LATEST assigned event, not the creation time', () => {
    const emp = newEmployee('Выдано Дата')
    const dev = newDevice()
    assignDevice(dev, emp.id, { occurredAt: daysAgo(30) })
    acceptDevice(dev, { occurredAt: daysAgo(5) })
    assignDevice(dev, emp.id, { occurredAt: daysAgo(1) })
    const issued = listIssuedByEmployee(emp.id)
    expect(issued).toHaveLength(1)
    const expected = daysAgo(1)
    expect(issued[0].issuedAt).not.toBeNull()
    expect(issued[0].issuedAt!.getDate()).toBe(expected.getDate())
    expect(issued[0].issuedAt!.getMonth()).toBe(expected.getMonth())
  })

  it('orders by model with Russian collation (Ё after Е)', () => {
    const emp = newEmployee('Выданной Порядок')
    const c = newDevice('Ёлка Выдан')
    const b = newDevice('Ежов Выдан')
    const a = newDevice('Анна Выдан')
    for (const dev of [a, b, c]) assignDevice(dev, emp.id)
    expect(listIssuedByEmployee(emp.id).map((d) => d.model)).toEqual([
      'Анна Выдан',
      'Ежов Выдан',
      'Ёлка Выдан',
    ])
  })

  it('returns [] for an employee without devices', () => {
    expect(listIssuedByEmployee(newEmployee('Выданной Пусто').id)).toEqual([])
  })
})

describe('listActiveEmployees — picker source', () => {
  it('lists active employees only, {id, name} shape', () => {
    const keep = listActiveEmployees().length
    const active = newEmployee('Яков Активный')
    const archived = newEmployee('Ёлка Архивная')
    setEmployeeArchived(archived.id, true)
    const options = listActiveEmployees()
    expect(options.length).toBe(keep + 1)
    expect(options.some((o) => o.id === active.id)).toBe(true)
    expect(options.some((o) => o.id === archived.id)).toBe(false)
    for (const option of options) {
      expect(typeof option.id).toBe('number')
      expect(typeof option.name).toBe('string')
    }
  })
})

describe('perimeter — append-only movements (MOVE-04)', () => {
  it('exposes no movement update/delete capability at module level', () => {
    expect(
      Object.keys(movementsQueries).some((k) =>
        /update|delete|remove|destroy/i.test(k),
      ),
    ).toBe(false)
  })

  it('UPDATE movements aborts via the append-only trigger', () => {
    const emp = newEmployee('Триггер Хранитель')
    const dev = newDevice()
    assignDevice(dev, emp.id)
    expect(
      captureThrown(() =>
        db.$client
          .prepare('UPDATE movements SET comment = ? WHERE device_id = ?')
          .run('tampered', dev),
      ),
    ).toBeDefined()
  })
})

describe('source gates (plan 04-01 acceptance)', () => {
  it('custody actions never read status/currentEmployeeId from the payload', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/(app)/devices/actions.ts'),
      'utf8',
    )
    expect(
      src.match(/formData\.get\(\s*['"](status|currentEmployeeId)['"]\s*\)/g) ??
        [],
    ).toEqual([])
  })

  it('employee actions never read status/currentEmployeeId from the payload', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/(app)/employees/actions.ts'),
      'utf8',
    )
    expect(
      src.match(/formData\.get\(\s*['"](status|currentEmployeeId)['"]\s*\)/g) ??
        [],
    ).toEqual([])
  })

  it('device actions matrix branches by status (D-08 source-assert)', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/(app)/devices/device-actions.tsx'),
      'utf8',
    )
    expect(src).toContain("status === 'in_stock'")
    expect(src).toContain("status === 'assigned'")
    expect(src).toContain('<AssignDialog')
    expect(src).toContain('<AcceptDialog')
    expect(src).toContain('<TransferDialog')
  })
})
