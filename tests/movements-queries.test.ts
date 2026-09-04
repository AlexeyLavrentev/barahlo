import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { applyMigrations } from './helpers'
import { DISPLAY_TZ } from '@/lib/ru'

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
  sendToRepair,
  returnFromRepair,
  disposeDevice,
  returnAllDevices,
  listTimeline,
  listIssuedByEmployee,
  listActiveEmployees,
} = movementsQueries
const { createEmployee, setEmployeeArchived } = employeeQueries
const { createDevice } = deviceQueries
const {
  assignSchema,
  acceptSchema,
  transferSchema,
  repairSchema,
  disposeSchema,
  occurredAtFromDate,
  movementEventLabel,
} = schemaModule

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

// yyyy-mm-dd N days from today on the DISPLAY_TZ wall clock (the shape
// input[type=date] submits, and the calendar the schema validates against —
// CR-01). Host-local getters would drift a day off Moscow's wall clock
// whenever the host timezone is not Moscow (fixed 2026-09-05: runs on a
// UTC+5 host failed every 00:00–02:00 local because «today» resolved to
// Moscow's tomorrow). Fixed 86_400_000 ms steps are exact — Moscow has no
// DST since 2014.
function isoDaysFromNow(days: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(Date.now() + days * 86_400_000)
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
        .run(status, status === 'assigned' ? emp.id : null, dev)
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

describe('sendToRepair — в ремонт (D-04, plan 04-02)', () => {
  it('from in_stock: one to_repair event, status repair, holder cleared', () => {
    const dev = newDevice('Ремонт Со Склада')
    sendToRepair(dev, { comment: 'Треснул корпус' })
    const row = rawDevice(dev)
    expect(row.status).toBe('repair')
    expect(row.current_employee_id).toBeNull()
    const events = rawMovements(dev)
    expect(events).toHaveLength(1)
    expect(events[0].event_type).toBe('to_repair')
    expect(events[0].from_employee_id).toBeNull()
    expect(events[0].to_employee_id).toBeNull()
    expect(events[0].comment).toBe('Треснул корпус')
    expect(events[0].occurred_at).toBeGreaterThan(0)
  })

  it('from assigned: holder auto-accepted (returned) + to_repair in ONE tx (D-04)', () => {
    const emp = newEmployee('Ремонт От Кого')
    const dev = newDevice()
    assignDevice(dev, emp.id)
    sendToRepair(dev)
    const row = rawDevice(dev)
    expect(row.status).toBe('repair')
    expect(row.current_employee_id).toBeNull()
    const events = rawMovements(dev)
    // [assigned, returned (auto-accept), to_repair]
    expect(events).toHaveLength(3)
    // The auto-accept is a real returned event; the to_repair event follows
    // it and records the handover «от держателя» in its from slot.
    expect(events[0].event_type).toBe('assigned')
    expect(events[1].event_type).toBe('returned')
    expect(events[1].from_employee_id).toBe(emp.id)
    expect(events[1].to_employee_id).toBeNull()
    expect(events[2].event_type).toBe('to_repair')
    expect(events[2].from_employee_id).toBe(emp.id)
    expect(events[2].to_employee_id).toBeNull()
  })

  it('rejects repair→repair and disposed→repair with ZERO side effects', () => {
    for (const status of ['repair', 'disposed']) {
      const dev = newDevice()
      db.$client
        .prepare('UPDATE devices SET status = ? WHERE id = ?')
        .run(status, dev)
      const before = movementsCount()
      expect(captureThrown(() => sendToRepair(dev))).toEqual({
        code: 'ILLEGAL_TRANSITION',
      })
      expect(rawDevice(dev).status).toBe(status)
      expect(movementsCount()).toBe(before)
    }
  })

  it('a backdated date lands on BOTH events of the assigned path (D-01)', () => {
    const emp = newEmployee('Ремонт Задним')
    const dev = newDevice()
    assignDevice(dev, emp.id)
    const yesterday = daysAgo(1)
    sendToRepair(dev, { occurredAt: yesterday, comment: 'Акт 9' })
    // The repair-path events (returned + to_repair) carry the backdated date;
    // the initial assigned event keeps its own «now».
    const repairEvents = rawMovements(dev).filter((e) =>
      ['returned', 'to_repair'].includes(e.event_type),
    )
    expect(repairEvents).toHaveLength(2)
    for (const event of repairEvents) {
      expect(event.occurred_at).toBe(Math.floor(yesterday.getTime() / 1000))
      expect(event.comment).toBe('Акт 9')
    }
  })
})

describe('returnFromRepair — из ремонта (D-04)', () => {
  it('repair → in_stock with a from_repair event (no person slots)', () => {
    const dev = newDevice('Ремонт Возврат')
    sendToRepair(dev)
    returnFromRepair(dev, { comment: 'Готово' })
    const row = rawDevice(dev)
    expect(row.status).toBe('in_stock')
    expect(row.current_employee_id).toBeNull()
    const events = rawMovements(dev)
    expect(events).toHaveLength(2)
    expect(events[1].event_type).toBe('from_repair')
    expect(events[1].from_employee_id).toBeNull()
    expect(events[1].to_employee_id).toBeNull()
    expect(events[1].comment).toBe('Готово')
  })

  it('rejects non-repair sources (in_stock, assigned, disposed) with zero effects', () => {
    const emp = newEmployee('Ремонт Мимо')
    for (const status of ['in_stock', 'assigned', 'disposed']) {
      const dev = newDevice()
      db.$client
        .prepare(
          'UPDATE devices SET status = ?, current_employee_id = ? WHERE id = ?',
        )
        .run(status, status === 'assigned' ? emp.id : null, dev)
      const before = movementsCount()
      expect(captureThrown(() => returnFromRepair(dev))).toEqual({
        code: 'ILLEGAL_TRANSITION',
      })
      expect(rawDevice(dev).status).toBe(status)
      expect(movementsCount()).toBe(before)
    }
  })

  it('transfer is impossible from repair (the device has no holder)', () => {
    const emp = newEmployee('Ремонт Передача')
    const dev = newDevice()
    sendToRepair(dev)
    const before = movementsCount()
    expect(captureThrown(() => transferDevice(dev, emp.id))).toEqual({
      code: 'ILLEGAL_TRANSITION',
    })
    expect(rawDevice(dev).status).toBe('repair')
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
    // The stored instant's DISPLAY_TZ calendar day must equal the submitted
    // one (the C7 contract) — host-local getters would read a different day
    // whenever the host timezone is not Moscow (CR-01 class).
    const backIso = new Intl.DateTimeFormat('en-CA', {
      timeZone: DISPLAY_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(back)
    expect(backIso).toBe(isoDaysFromNow(-2))
    // Time-of-day is «now» (±1h tolerance against an hour-boundary race)
    expect(Math.abs(back.getHours() - after.getHours())).toBeLessThanOrEqual(1)
    expect(back.getTime()).toBeLessThan(before.getTime())
    // No date at all = now (≥ the captured `before`; comparing against a
    // fresh capture would race the millisecond clock).
    expect(occurredAtFromDate(undefined).getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    )
  })
})

describe('repair schema — whitelist + D-01 bounds (plan 04-02)', () => {
  it('accepts a minimal repair payload, rejects an injected employeeId (strict)', () => {
    expect(repairSchema.safeParse({ deviceId: '3' }).success).toBe(true)
    expect(
      repairSchema.safeParse({ deviceId: '3', employeeId: '2' }).success,
    ).toBe(false)
  })

  it('comment ≤500; a future occurredAt is rejected', () => {
    expect(
      repairSchema.safeParse({ deviceId: '1', comment: 'а'.repeat(500) })
        .success,
    ).toBe(true)
    expect(
      repairSchema.safeParse({ deviceId: '1', comment: 'а'.repeat(501) })
        .success,
    ).toBe(false)
    expect(
      repairSchema.safeParse({ deviceId: '1', occurredAt: isoDaysFromNow(1) })
        .success,
    ).toBe(false)
  })

  it('timeline vocabulary: all 7 event labels render per UI-SPEC', () => {
    expect(movementEventLabel('received')).toBe('Поступление')
    expect(movementEventLabel('assigned')).toBe('Выдача')
    expect(movementEventLabel('transferred')).toBe('Передача')
    expect(movementEventLabel('returned')).toBe('Возврат')
    expect(movementEventLabel('to_repair')).toBe('В ремонт')
    expect(movementEventLabel('from_repair')).toBe('Из ремонта')
    expect(movementEventLabel('disposed')).toBe('Списание')
  })
})

describe('disposeDevice — списание финально (D-03, plan 04-02)', () => {
  it('from in_stock/assigned/repair writes the disposed event + projection', () => {
    // in_stock: no holder slot
    const dev1 = newDevice('Списание Склад')
    disposeDevice(dev1, { comment: 'Сгорела после скачка' })
    let row = rawDevice(dev1)
    expect(row.status).toBe('disposed')
    expect(row.current_employee_id).toBeNull()
    let events = rawMovements(dev1)
    expect(events).toHaveLength(1)
    expect(events[0].event_type).toBe('disposed')
    expect(events[0].from_employee_id).toBeNull()
    expect(events[0].to_employee_id).toBeNull()
    expect(events[0].comment).toBe('Сгорела после скачка')

    // assigned: the holder rides in the event's from slot
    const emp = newEmployee('Списание От Кого')
    const dev2 = newDevice()
    assignDevice(dev2, emp.id)
    disposeDevice(dev2)
    row = rawDevice(dev2)
    expect(row.status).toBe('disposed')
    expect(row.current_employee_id).toBeNull()
    events = rawMovements(dev2)
    expect(events[events.length - 1].event_type).toBe('disposed')
    expect(events[events.length - 1].from_employee_id).toBe(emp.id)

    // repair: disposal is reachable from repair too
    const dev3 = newDevice()
    sendToRepair(dev3)
    disposeDevice(dev3)
    expect(rawDevice(dev3).status).toBe('disposed')
    expect(
      rawMovements(dev3).some((e) => e.event_type === 'disposed'),
    ).toBe(true)
  })

  it('disposed is terminal: the 6 direct transitions reject with zero effects', () => {
    const emp = newEmployee('Финальность Свидетель')
    const other = newEmployee('Финальность Получатель')
    const dev = newDevice('Финальность Устройство')
    disposeDevice(dev)
    const before = movementsCount()
    expect(captureThrown(() => assignDevice(dev, emp.id))).toEqual({
      code: 'ILLEGAL_TRANSITION',
    })
    expect(captureThrown(() => acceptDevice(dev))).toEqual({
      code: 'ILLEGAL_TRANSITION',
    })
    expect(captureThrown(() => transferDevice(dev, other.id))).toEqual({
      code: 'ILLEGAL_TRANSITION',
    })
    expect(captureThrown(() => sendToRepair(dev))).toEqual({
      code: 'ILLEGAL_TRANSITION',
    })
    expect(captureThrown(() => returnFromRepair(dev))).toEqual({
      code: 'ILLEGAL_TRANSITION',
    })
    expect(captureThrown(() => disposeDevice(dev))).toEqual({
      code: 'ILLEGAL_TRANSITION',
    })
    expect(rawDevice(dev).status).toBe('disposed')
    expect(rawDevice(dev).current_employee_id).toBeNull()
    expect(movementsCount()).toBe(before)
  })

  it('the 7th path — return-all — cannot touch a disposed device', () => {
    const emp = newEmployee('Финальность Держатель')
    const dev = newDevice()
    assignDevice(dev, emp.id)
    disposeDevice(dev)
    // Disposal cleared the holder, so the device left the issued set: there
    // is no code path from disposed back to anything (D-03 finality).
    expect(returnAllDevices(emp.id)).toBe(0)
    expect(rawDevice(dev).status).toBe('disposed')
  })

  it('the disposed device stays in the DB with its readable history', () => {
    const dev = newDevice('Финальность История')
    disposeDevice(dev, { comment: 'Причина сохранена' })
    const events = listTimeline(dev)
    expect(events).toHaveLength(1)
    expect(events[0].eventType).toBe('disposed')
    expect(events[0].comment).toBe('Причина сохранена')
    // And the row itself is still there — view-only, not deleted.
    expect(rawDevice(dev).status).toBe('disposed')
  })
})

describe('dispose schema — причина обязательна (D-03)', () => {
  it('an empty or missing reason is rejected; 500 ok, 501 rejected', () => {
    expect(
      disposeSchema.safeParse({ deviceId: '1', comment: 'Причина' }).success,
    ).toBe(true)
    expect(
      disposeSchema.safeParse({ deviceId: '1', comment: '' }).success,
    ).toBe(false)
    expect(disposeSchema.safeParse({ deviceId: '1' }).success).toBe(false)
    expect(
      disposeSchema.safeParse({ deviceId: '1', comment: 'а'.repeat(500) })
        .success,
    ).toBe(true)
    expect(
      disposeSchema.safeParse({ deviceId: '1', comment: 'а'.repeat(501) })
        .success,
    ).toBe(false)
  })

  it('strictness: an injected employeeId is a tampering signal', () => {
    expect(
      disposeSchema.safeParse({ deviceId: '1', comment: 'Причина', employeeId: '2' })
        .success,
    ).toBe(false)
    expect(
      disposeSchema.safeParse({ deviceId: '1', comment: 'Причина', status: 'disposed' })
        .success,
    ).toBe(false)
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
    expect(rawDevice(dev3).status).toBe('in_stock')
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
    // dev3 (in_stock) and dev4 (other holder's) are explicitly absent
    expect(issued.some((d) => d.id === dev3)).toBe(false)
    expect(issued.some((d) => d.id === dev4)).toBe(false)
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

  it('device actions matrix covers the repair cycle (plan 04-02 source-assert)', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/(app)/devices/device-actions.tsx'),
      'utf8',
    )
    expect(src).toContain("status === 'repair'")
    expect(src).toContain('<RepairDialog')
    // «В ремонт» is offered from BOTH in_stock and assigned; «Из ремонта»
    // belongs to the repair status only.
    expect(src.match(/<RepairDialog/g)?.length).toBe(3)
  })

  it('dispose is wired: card row hidden for disposed, «Списать» last elsewhere (plan 04-02)', () => {
    const actionsSrc = readFileSync(
      join(process.cwd(), 'app/(app)/devices/device-actions.tsx'),
      'utf8',
    )
    expect(actionsSrc).toContain('<DisposeDialog')
    // in_stock, assigned and repair rows all end with the dispose step
    expect(actionsSrc.match(/<DisposeDialog/g)?.length).toBe(3)
    const pageSrc = readFileSync(
      join(process.cwd(), 'app/(app)/(card)/devices/[id]/page.tsx'),
      'utf8',
    )
    // D-03 view-only: the ENTIRE actions row (Редактировать included) is
    // rendered only for non-disposed devices.
    expect(pageSrc).toContain("device.status !== 'disposed'")
  })

  it('red fills stay scoped: dispose primary + «Списано» pill only (grep-gate)', () => {
    const dialogsSrc = readFileSync(
      join(process.cwd(), 'app/(app)/devices/movement-dialogs.tsx'),
      'utf8',
    )
    // Every bg-destructive fill lives on ONE line — the solid «Списать»
    // primary (base + hover); inline #D70015 ERROR_CLASS text is standing
    // error semantics, not a fill.
    const dialogFillLines = dialogsSrc.match(/.*bg-destructive.*$/gm) ?? []
    expect(dialogFillLines).toHaveLength(1)
    expect(dialogFillLines[0]).toContain('hover:bg-destructive/90')
    const pageSrc = readFileSync(
      join(process.cwd(), 'app/(app)/(card)/devices/[id]/page.tsx'),
      'utf8',
    )
    // The only red fill on the card is the tinted «Списано» status pill.
    const pageFillLines = pageSrc.match(/.*bg-destructive.*$/gm) ?? []
    expect(pageFillLines).toHaveLength(1)
    expect(pageFillLines[0]).toContain('bg-destructive/10')
  })
})
