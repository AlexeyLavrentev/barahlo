import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { db } from '@/db'
import { devices, employees, movements } from '@/db/schema'

// Movement data-access (MOVE-01..05, EMP-02). Pure sync functions over the
// module-level db — no framework imports at all: Server Actions add session +
// zod on top, vitest imports this module directly against a temp database.
//
// Every custody transition is ONE sync transaction (RESEARCH C1): the
// projection write is itself the guard — a conditional UPDATE
// `WHERE id AND status=<precondition>` decides by .changes, so an illegal
// transition is rejected with ZERO writes (no event, no projection) and there
// is no read-then-write race window. eventType is hardcoded per function,
// never taken from a caller-supplied payload; the movements table stays
// append-only (INSERT only — the DB triggers abort UPDATE/DELETE).

type DbHandle = typeof db
type Tx = Parameters<Parameters<DbHandle['transaction']>[0]>[0]

// Timeline row of one device (04-UI-SPEC «История перемещений»). Holder names
// resolve through LEFT JOINs — archived employees keep their names in history.
export type MovementEventView = {
  id: number
  eventType: string
  comment: string | null
  occurredAt: Date
  fromName: string | null
  toName: string | null
}

// One row of the employee card's «Техника» list (EMP-02): the device plus the
// date of its latest assigned event («выдано {дата}», 04-UI-SPEC Default 14).
export type IssuedDeviceView = {
  id: number
  model: string
  serialNumber: string
  issuedAt: Date | null
}

// Flat picker option for the assign/transfer dialogs (active employees only).
export type EmployeeOption = { id: number; name: string }

// Optional event fields of every custody action: an omitted date means «now»,
// an omitted comment means NULL. The projections' expected post-states are
// documented per function (RESEARCH C2 matrix).
export type EventInput = { occurredAt?: Date; comment?: string | null }

// Russian-correct sort key (same recipe as devices/employees queries):
// SQLite binary UTF-8 puts «Ё» before «А» — replace Ё/ё→Е/е in ORDER BY.
const ruSortKey = sql`replace(replace(${devices.model}, 'Ё', 'Е'), 'ё', 'е')`

function occurredOf(event: EventInput): Date {
  return event.occurredAt ?? new Date()
}

function commentOf(event: EventInput): string | null {
  return event.comment ?? null
}

// C2: the target of an assign/transfer must be an ACTIVE employee — the
// pickers only offer active ones, so a direct POST with an archived or
// unknown id is a business rejection, not a 500.
function assertActiveEmployee(tx: Tx, employeeId: number): void {
  const row = tx
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.isActive, 1)))
    .get()
  if (!row) throw { code: 'EMPLOYEE_INACTIVE' }
}

// Выдать (MOVE-01): in_stock → assigned, holder = employeeId.
// Guard precondition: status='in_stock' (D-08 server side — the button is
// hidden on assigned devices and this rejects a crafted direct POST).
export function assignDevice(
  deviceId: number,
  employeeId: number,
  event: EventInput = {},
): void {
  db.transaction((tx) => {
    assertActiveEmployee(tx, employeeId)
    const upd = tx
      .update(devices)
      .set({
        status: 'assigned',
        currentEmployeeId: employeeId,
        updatedAt: new Date(),
      })
      .where(and(eq(devices.id, deviceId), eq(devices.status, 'in_stock')))
      .run()
    if (upd.changes === 0) throw { code: 'ILLEGAL_TRANSITION' }
    tx
      .insert(movements)
      .values({
        deviceId,
        eventType: 'assigned',
        fromEmployeeId: null,
        toEmployeeId: employeeId,
        comment: commentOf(event),
        occurredAt: occurredOf(event),
      })
      .run()
  })
}

// Принять (MOVE-02): assigned → in_stock, holder cleared.
// The holder is read INSIDE the tx for the event's from slot; the conditional
// UPDATE below still decides — no window for a concurrent flip.
export function acceptDevice(
  deviceId: number,
  event: EventInput = {},
): void {
  db.transaction((tx) => {
    const row = tx
      .select({ currentEmployeeId: devices.currentEmployeeId })
      .from(devices)
      .where(eq(devices.id, deviceId))
      .get()
    if (!row) throw { code: 'ILLEGAL_TRANSITION' }
    const upd = tx
      .update(devices)
      .set({ status: 'in_stock', currentEmployeeId: null, updatedAt: new Date() })
      .where(and(eq(devices.id, deviceId), eq(devices.status, 'assigned')))
      .run()
    if (upd.changes === 0) throw { code: 'ILLEGAL_TRANSITION' }
    tx
      .insert(movements)
      .values({
        deviceId,
        eventType: 'returned',
        fromEmployeeId: row.currentEmployeeId,
        toEmployeeId: null,
        comment: commentOf(event),
        occurredAt: occurredOf(event),
      })
      .run()
  })
}

// Передать (MOVE-03): assigned → assigned with a new holder.
// The current holder is read inside the tx for the from slot; transferring to
// the holder himself is a rejected no-op (adjacency — mirrored by the zod
// refine in lib/movement-schema for the dialog path).
export function transferDevice(
  deviceId: number,
  toEmployeeId: number,
  event: EventInput = {},
): void {
  db.transaction((tx) => {
    const row = tx
      .select({
        status: devices.status,
        currentEmployeeId: devices.currentEmployeeId,
      })
      .from(devices)
      .where(eq(devices.id, deviceId))
      .get()
    if (!row || row.status !== 'assigned') {
      throw { code: 'ILLEGAL_TRANSITION' }
    }
    assertActiveEmployee(tx, toEmployeeId)
    if (row.currentEmployeeId === toEmployeeId) {
      throw { code: 'ILLEGAL_TRANSITION' }
    }
    const upd = tx
      .update(devices)
      .set({ currentEmployeeId: toEmployeeId, updatedAt: new Date() })
      .where(and(eq(devices.id, deviceId), eq(devices.status, 'assigned')))
      .run()
    if (upd.changes === 0) throw { code: 'ILLEGAL_TRANSITION' }
    tx
      .insert(movements)
      .values({
        deviceId,
        eventType: 'transferred',
        fromEmployeeId: row.currentEmployeeId,
        toEmployeeId,
        comment: commentOf(event),
        occurredAt: occurredOf(event),
      })
      .run()
  })
}

// В ремонт (D-04, RESEARCH C2): in_stock|assigned → repair, holder cleared.
// A holder is auto-ACCEPTED inside the same tx — a real returned event — and
// the to_repair event records the handover «от держателя» in its from slot.
// The conditional UPDATE with the two-status precondition is the guard: from
// repair/disposed nothing is written at all (RESEARCH C1 — .changes decides).
export function sendToRepair(deviceId: number, event: EventInput = {}): void {
  db.transaction((tx) => {
    const row = tx
      .select({ currentEmployeeId: devices.currentEmployeeId })
      .from(devices)
      .where(eq(devices.id, deviceId))
      .get()
    const upd = tx
      .update(devices)
      .set({ status: 'repair', currentEmployeeId: null, updatedAt: new Date() })
      .where(
        and(
          eq(devices.id, deviceId),
          inArray(devices.status, ['in_stock', 'assigned']),
        ),
      )
      .run()
    if (upd.changes === 0) throw { code: 'ILLEGAL_TRANSITION' }
    const holderId = row?.currentEmployeeId ?? null
    if (holderId !== null) {
      tx
        .insert(movements)
        .values({
          deviceId,
          eventType: 'returned',
          fromEmployeeId: holderId,
          toEmployeeId: null,
          comment: commentOf(event),
          occurredAt: occurredOf(event),
        })
        .run()
    }
    tx
      .insert(movements)
      .values({
        deviceId,
        eventType: 'to_repair',
        fromEmployeeId: holderId,
        toEmployeeId: null,
        comment: commentOf(event),
        occurredAt: occurredOf(event),
      })
      .run()
  })
}

// Из ремонта (D-04): repair → in_stock. Nobody hands the device over, so the
// from_repair event carries no person slots (04-UI-SPEC timeline vocabulary).
export function returnFromRepair(
  deviceId: number,
  event: EventInput = {},
): void {
  db.transaction((tx) => {
    const upd = tx
      .update(devices)
      .set({ status: 'in_stock', currentEmployeeId: null, updatedAt: new Date() })
      .where(and(eq(devices.id, deviceId), eq(devices.status, 'repair')))
      .run()
    if (upd.changes === 0) throw { code: 'ILLEGAL_TRANSITION' }
    tx
      .insert(movements)
      .values({
        deviceId,
        eventType: 'from_repair',
        fromEmployeeId: null,
        toEmployeeId: null,
        comment: commentOf(event),
        occurredAt: occurredOf(event),
      })
      .run()
  })
}

// Списать (D-03): in_stock|assigned|repair → disposed — ФИНАЛЬНО. The guard
// precondition enumerates every non-disposed status, so from disposed the
// .changes===0 branch rejects with zero writes forever: no code path leads
// back (an erroneous record is corrected by registering a new device, never
// by editing this one). The reason rides in the event comment; a holder, if
// there was one, lands in the from slot.
export function disposeDevice(deviceId: number, event: EventInput = {}): void {
  db.transaction((tx) => {
    const row = tx
      .select({ currentEmployeeId: devices.currentEmployeeId })
      .from(devices)
      .where(eq(devices.id, deviceId))
      .get()
    const upd = tx
      .update(devices)
      .set({
        status: 'disposed',
        currentEmployeeId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(devices.id, deviceId),
          inArray(devices.status, ['in_stock', 'assigned', 'repair']),
        ),
      )
      .run()
    if (upd.changes === 0) throw { code: 'ILLEGAL_TRANSITION' }
    tx
      .insert(movements)
      .values({
        deviceId,
        eventType: 'disposed',
        fromEmployeeId: row?.currentEmployeeId ?? null,
        toEmployeeId: null,
        comment: commentOf(event),
        occurredAt: occurredOf(event),
      })
      .run()
  })
}

// Вернуть всю технику (D-07, RESEARCH C3): one transaction, one returned
// event PER device. Any mid-flight failure rolls back every event and every
// projection — the action's error copy promises exactly that. Works for
// archived employees too (offboarding = archive + return-all). Empty holder
// list is a no-op returning 0.
export function returnAllDevices(
  employeeId: number,
  event: EventInput = {},
): number {
  return db.transaction((tx) => {
    const rows = tx
      .select({ id: devices.id })
      .from(devices)
      .where(
        and(
          eq(devices.currentEmployeeId, employeeId),
          eq(devices.status, 'assigned'),
        ),
      )
      .orderBy(asc(devices.id))
      .all()
    for (const d of rows) {
      tx
        .insert(movements)
        .values({
          deviceId: d.id,
          eventType: 'returned',
          fromEmployeeId: employeeId,
          toEmployeeId: null,
          comment: commentOf(event),
          occurredAt: occurredOf(event),
        })
        .run()
      tx
        .update(devices)
        .set({ status: 'in_stock', currentEmployeeId: null, updatedAt: new Date() })
        .where(and(eq(devices.id, d.id), eq(devices.status, 'assigned')))
        .run()
    }
    return rows.length
  })
}

// Current holder of one device — the transfer action reads it (DB, never the
// payload) to feed the dialog's transfer-refine argument.
export function getDeviceHolder(
  deviceId: number,
): { currentEmployeeId: number | null } | undefined {
  return db
    .select({ currentEmployeeId: devices.currentEmployeeId })
    .from(devices)
    .where(eq(devices.id, deviceId))
    .get()
}

// Timeline of one device (MOVE-04): alias double-join resolves both holder
// names — archived employees render as text exactly like active ones (history
// is history). Order is occurredAt DESC with id as the tiebreaker — backdated
// events (D-01) sort by their own dates, never by insertion order.
export function listTimeline(deviceId: number): MovementEventView[] {
  const fromEmp = alias(employees, 'from_emp')
  const toEmp = alias(employees, 'to_emp')
  return db
    .select({
      id: movements.id,
      eventType: movements.eventType,
      comment: movements.comment,
      occurredAt: movements.occurredAt,
      fromName: fromEmp.name,
      toName: toEmp.name,
    })
    .from(movements)
    .leftJoin(fromEmp, eq(movements.fromEmployeeId, fromEmp.id))
    .leftJoin(toEmp, eq(movements.toEmployeeId, toEmp.id))
    .where(eq(movements.deviceId, deviceId))
    .orderBy(desc(movements.occurredAt), desc(movements.id))
    .all()
}

// Issued devices of one employee (EMP-02, RESEARCH C6): two batched queries —
// the currently assigned rows, then ONE grouped max(occurred_at) over their
// assigned events for «выдано {дата}». Sorted for the card list (RU model
// order, id tiebreaker).
export function listIssuedByEmployee(employeeId: number): IssuedDeviceView[] {
  const issued = db
    .select({
      id: devices.id,
      model: devices.model,
      serialNumber: devices.serialNumber,
    })
    .from(devices)
    .where(
      and(
        eq(devices.currentEmployeeId, employeeId),
        eq(devices.status, 'assigned'),
      ),
    )
    .orderBy(ruSortKey, asc(devices.id))
    .all()
  if (issued.length === 0) return []
  // Raw max() returns the stored unixepoch seconds — wrap back into Date.
  const latest = db
    .select({
      deviceId: movements.deviceId,
      lastAt: sql<number>`max(${movements.occurredAt})`,
    })
    .from(movements)
    .where(
      and(
        eq(movements.eventType, 'assigned'),
        inArray(
          movements.deviceId,
          issued.map((d) => d.id),
        ),
      ),
    )
    .groupBy(movements.deviceId)
    .all()
  const lastById = new Map(latest.map((r) => [r.deviceId, r.lastAt]))
  return issued.map((d) => {
    const lastAt = lastById.get(d.id)
    return { ...d, issuedAt: lastAt === undefined ? null : new Date(lastAt * 1000) }
  })
}

// Active employees for the assign/transfer pickers (04-UI-SPEC Default 20):
// id + name only, RU-sorted — no archived rows ever reach a custody dialog.
export function listActiveEmployees(): EmployeeOption[] {
  return db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.isActive, 1))
    .orderBy(
      sql`replace(replace(${employees.name}, 'Ё', 'Е'), 'ё', 'е')`,
      asc(employees.id),
    )
    .all()
}
