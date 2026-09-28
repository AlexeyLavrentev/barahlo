import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { db } from '@/db'
import { devices, employees, movements } from '@/db/schema'
import type { MovementEventType } from '@/lib/movement-schema'

// Movement data-access (MOVE-01..05, EMP-02, phase 12 HIST-01..03). Pure sync
// functions over the module-level db — no framework imports at all: Server
// Actions add session + zod on top, vitest imports this module directly
// against a temp database.
//
// Every custody transition is ONE sync transaction (RESEARCH C1): the
// projection write is itself the guard — a conditional UPDATE
// `WHERE id AND status=<precondition>` decides by .changes, so an illegal
// transition is rejected with ZERO writes (no event, no projection) and there
// is no read-then-write race window. eventType is hardcoded per function,
// never taken from a caller-supplied payload.
//
// Since migration 0002 (phase 12, SC5) the table is no longer append-only at
// the DB level: editMovement/deleteMovement mutate rows server-side with a
// compound `WHERE id AND device_id` and re-derive the device projection by
// replaying the FULL corrected chain inside the same transaction (D-04) —
// a replay throw rolls everything back, zero writes (D-03). Row creation
// still flows exclusively through the custody actions.

type DbHandle = typeof db
type Tx = Parameters<Parameters<DbHandle['transaction']>[0]>[0]

// Timeline row of one device (04-UI-SPEC «История перемещений»). Holder names
// resolve through LEFT JOINs — archived employees keep their names in history.
// fromId/toId ride along beside the names (phase 12: the edit dialog needs the
// ids for prefill; the timeline still renders names as text — D-05).
export type MovementEventView = {
  id: number
  eventType: string
  comment: string | null
  occurredAt: Date
  fromId: number | null
  fromName: string | null
  toId: number | null
  toName: string | null
}

// One row of the employee card's «Техника» list (EMP-02): the device plus the
// date of its latest assigned event («выдано {дата}», 04-UI-SPEC Default 14).
// warrantyUntil rides along for the WAR-01 site-3 color segment (plan 05-03,
// orchestrator resolution 3) — the component cannot color what the query does
// not select (Pitfall 9).
export type IssuedDeviceView = {
  id: number
  model: string
  // D-08: nullable since migration 0001 — clones are born without a serial.
  serialNumber: string | null
  warrantyUntil: Date | null
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

// Списать (D-03): in_stock|assigned|repair → disposed. Terminal for ACTIONS:
// the guard precondition enumerates every non-disposed status, so from
// disposed the .changes===0 branch rejects with zero writes and no custody
// button leads out — but since phase 12 the terminality lives in the action
// set, not the DB: deleting the disposed RECORD via deleteMovement replays
// the shortened chain back to in_stock (D-06 — the undo of a mistaken
// disposal is a history edit, not a new action). The reason rides in the
// event comment; a holder, if there was one, lands in the from slot.
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

// Bulk-операции (MOVE-06): результат — discriminated union, а не throw:
// blocker-отчёт несёт ДАННЫЕ (какая единица и почему — SC 3), которые
// { code }-throw передать не может. Записей при blockers нет вовсе
// (всё-или-ничего, D-03): превалидация — один SELECT всех id ВНУТРИ tx до
// первой записи.
export type BulkBlocker = { id: number; model: string; status: string }
export type BulkOutcome =
  | { ok: true; results: Array<{ deviceId: number; eventType: string }> }
  | { ok: false; blockers: BulkBlocker[] }

// Выдать партию (MOVE-06, D-02): только in_stock-единицы, один АКТИВНЫЙ
// сотрудник на всех. ONE sync tx (module contract): SELECT-превалидация →
// blockers (ноль записей) ИЛИ loop guard-UPDATE — условный UPDATE
// `WHERE id AND status='in_stock'`, .changes===0 → throw → ПОЛНЫЙ откат
// (повторный вызов после успеха и in-batch дубликат id не создают дублей,
// Pitfall 4) + ровно одно событие assigned на единицу с ОБЩИМИ
// occurredAt/comment (D-06; occurredAtFromDate вызывает экшен ОДИН раз на
// партию — сюда приходит готовый Date). Обработка по возрастанию id —
// детерминированный порядок событий (asc в SELECT и в цикле).
export function bulkAssignDevices(
  deviceIds: number[],
  employeeId: number,
  event: EventInput = {},
): BulkOutcome {
  return db.transaction((tx) => {
    assertActiveEmployee(tx, employeeId)
    const rows = tx
      .select({ id: devices.id, model: devices.model, status: devices.status })
      .from(devices)
      .where(inArray(devices.id, deviceIds))
      .orderBy(asc(devices.id))
      .all()
    const byId = new Map(rows.map((r) => [r.id, r]))
    const blockers: BulkBlocker[] = deviceIds
      .filter((id) => byId.get(id)?.status !== 'in_stock')
      .map((id) => ({
        id,
        model: byId.get(id)?.model ?? '—',
        status: byId.get(id)?.status ?? 'not_found',
      }))
    if (blockers.length > 0) return { ok: false, blockers }
    const occurredAt = occurredOf(event)
    const results: Array<{ deviceId: number; eventType: string }> = []
    for (const id of deviceIds) {
      const upd = tx
        .update(devices)
        .set({
          status: 'assigned',
          currentEmployeeId: employeeId,
          updatedAt: new Date(),
        })
        .where(and(eq(devices.id, id), eq(devices.status, 'in_stock')))
        .run()
      if (upd.changes === 0) throw { code: 'ILLEGAL_TRANSITION' }
      tx
        .insert(movements)
        .values({
          deviceId: id,
          eventType: 'assigned',
          fromEmployeeId: null,
          toEmployeeId: employeeId,
          comment: commentOf(event),
          occurredAt,
        })
        .run()
      results.push({ deviceId: id, eventType: 'assigned' })
    }
    return { ok: true, results }
  })
}

// Принять партию (MOVE-06, D-02): источники ОБА статуса — assigned И repair
// (двух-статусный precondition, прецедент sendToRepair; Pitfall 3 — цикл
// одиночных acceptDevice не годится, тот требует assigned). Держатель для
// события returned читается из tx-снапшота (прецедент acceptDevice), никогда
// из payload; from_repair — без person slots (прецедент returnFromRepair).
// Ta же ONE-tx форма, что bulkAssignDevices: SELECT-превалидация → blockers
// (ноль записей) ИЛИ loop guard-UPDATE с throw-откатом всей партии.
export function bulkAcceptDevices(
  deviceIds: number[],
  event: EventInput = {},
): BulkOutcome {
  return db.transaction((tx) => {
    const rows = tx
      .select({
        id: devices.id,
        model: devices.model,
        status: devices.status,
        currentEmployeeId: devices.currentEmployeeId,
      })
      .from(devices)
      .where(inArray(devices.id, deviceIds))
      .orderBy(asc(devices.id))
      .all()
    const byId = new Map(rows.map((r) => [r.id, r]))
    const blockers: BulkBlocker[] = deviceIds
      .filter((id) => {
        const status = byId.get(id)?.status
        return status !== 'assigned' && status !== 'repair'
      })
      .map((id) => ({
        id,
        model: byId.get(id)?.model ?? '—',
        status: byId.get(id)?.status ?? 'not_found',
      }))
    if (blockers.length > 0) return { ok: false, blockers }
    const occurredAt = occurredOf(event)
    const results: Array<{ deviceId: number; eventType: string }> = []
    for (const id of deviceIds) {
      const snapshot = byId.get(id)
      if (!snapshot) throw { code: 'ILLEGAL_TRANSITION' }
      const fromRepair = snapshot.status === 'repair'
      const upd = tx
        .update(devices)
        .set({ status: 'in_stock', currentEmployeeId: null, updatedAt: new Date() })
        .where(
          and(
            eq(devices.id, id),
            inArray(devices.status, ['assigned', 'repair']),
          ),
        )
        .run()
      if (upd.changes === 0) throw { code: 'ILLEGAL_TRANSITION' }
      tx
        .insert(movements)
        .values({
          deviceId: id,
          eventType: fromRepair ? 'from_repair' : 'returned',
          fromEmployeeId: fromRepair ? null : snapshot.currentEmployeeId,
          toEmployeeId: null,
          comment: commentOf(event),
          occurredAt,
        })
        .run()
      results.push({
        deviceId: id,
        eventType: fromRepair ? 'from_repair' : 'returned',
      })
    }
    return { ok: true, results }
  })
}

// Replay matrix of one device's chain (D-03/D-04, RESEARCH Pattern 1): start
// state is in_stock/null (D-05 — a chain without «Поступление» is valid, and
// deleting that first record too), each event's precondition mirrors the
// guard-UPDATE of the action class that created it; `received` (seed-only —
// no app action writes it) is legal only from in_stock and changes nothing
// (OQ1, strict semantics). from-slots are NOT cross-validated against the
// holder (OQ3 — the owner fixes their own typos, including from-slots).
// Ordering is occurredAt ASC, id ASC — the exact mirror of listTimeline
// DESC,DESC; the id tiebreaker is load-bearing because bulk parties (phase
// 10) share one occurredAt. A violation throws inside the caller's
// transaction → full rollback, zero writes (D-03).
function replayChain(
  tx: Tx,
  deviceId: number,
): { status: string; currentEmployeeId: number | null } {
  const rows = tx
    .select({ eventType: movements.eventType, to: movements.toEmployeeId })
    .from(movements)
    .where(eq(movements.deviceId, deviceId))
    .orderBy(asc(movements.occurredAt), asc(movements.id))
    .all()
  let status = 'in_stock'
  let holder: number | null = null
  for (const row of rows) {
    switch (row.eventType) {
      case 'received':
        if (status !== 'in_stock') throw { code: 'INVALID_CHAIN' }
        break
      case 'assigned':
        if (status !== 'in_stock' || row.to === null)
          throw { code: 'INVALID_CHAIN' }
        status = 'assigned'
        holder = row.to
        break
      case 'transferred':
        if (status !== 'assigned' || row.to === null)
          throw { code: 'INVALID_CHAIN' }
        holder = row.to
        break
      case 'returned':
        if (status !== 'assigned') throw { code: 'INVALID_CHAIN' }
        status = 'in_stock'
        holder = null
        break
      case 'to_repair':
        if (status !== 'in_stock' && status !== 'assigned')
          throw { code: 'INVALID_CHAIN' }
        status = 'repair'
        holder = null
        break
      case 'from_repair':
        if (status !== 'repair') throw { code: 'INVALID_CHAIN' }
        status = 'in_stock'
        holder = null
        break
      case 'disposed':
        if (status !== 'in_stock' && status !== 'assigned' && status !== 'repair')
          throw { code: 'INVALID_CHAIN' }
        status = 'disposed'
        holder = null
        break
      default:
        throw { code: 'INVALID_CHAIN' }
    }
  }
  return { status, currentEmployeeId: holder }
}

export type MovementEditInput = {
  eventType: MovementEventType
  employeeId?: number
  fromEmployeeId?: number
  occurredAt: Date
  comment: string | null
}

// Правка записи истории (HIST-01, D-01..D-04): ONE transaction — read the
// row (device-scoped), derive the person slots FULLY from (eventType, input),
// activity-check only CHANGED slots (OQ2: an untouched archived id survives),
// UPDATE with the compound WHERE (Pitfall 1: a tampered movementId cannot
// cross devices), then re-derive the projection by replaying the corrected
// chain in the same tx. A replay throw rolls the whole edit back — zero
// writes (D-03). The schema layer guarantees occurredAt is a valid day
// (required — a cleared date never reaches «now»).
export function editMovement(
  deviceId: number,
  movementId: number,
  input: MovementEditInput,
): void {
  db.transaction((tx) => {
    const row = tx
      .select({
        fromEmployeeId: movements.fromEmployeeId,
        toEmployeeId: movements.toEmployeeId,
      })
      .from(movements)
      .where(
        and(eq(movements.id, movementId), eq(movements.deviceId, deviceId)),
      )
      .get()
    if (!row) throw { code: 'MOVEMENT_GONE' }

    // Slot derivation by type (D-01): the irrelevant slots are wiped —
    // editing to_repair intentionally drops «от {держателя}» (UI-SPEC locked
    // semantics; the timeline renders the slotless row correctly).
    let fromEmployeeId: number | null = null
    let toEmployeeId: number | null = null
    if (input.eventType === 'assigned') {
      toEmployeeId = input.employeeId ?? null
    } else if (input.eventType === 'transferred') {
      toEmployeeId = input.employeeId ?? null
      fromEmployeeId = input.fromEmployeeId ?? null
    } else if (input.eventType === 'returned') {
      fromEmployeeId = input.fromEmployeeId ?? null
    }

    if (toEmployeeId !== null && toEmployeeId !== row.toEmployeeId)
      assertActiveEmployee(tx, toEmployeeId)
    if (fromEmployeeId !== null && fromEmployeeId !== row.fromEmployeeId)
      assertActiveEmployee(tx, fromEmployeeId)

    const upd = tx
      .update(movements)
      .set({
        eventType: input.eventType,
        fromEmployeeId,
        toEmployeeId,
        comment: input.comment,
        occurredAt: input.occurredAt,
      })
      .where(
        and(eq(movements.id, movementId), eq(movements.deviceId, deviceId)),
      )
      .run()
    if (upd.changes === 0) throw { code: 'MOVEMENT_GONE' }

    const final = replayChain(tx, deviceId)
    tx
      .update(devices)
      .set({
        status: final.status,
        currentEmployeeId: final.currentEmployeeId,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, deviceId))
      .run()
  })
}

// Удаление записи истории (HIST-02, D-05/D-06): same one-tx contract as
// editMovement. Deleting «Поступление» is legal (replay starts in_stock);
// deleting the disposed record walks the device back out of disposal (D-06).
// Re-deleting is a cheap explicit MOVEMENT_GONE.
export function deleteMovement(deviceId: number, movementId: number): void {
  db.transaction((tx) => {
    const del = tx
      .delete(movements)
      .where(
        and(eq(movements.id, movementId), eq(movements.deviceId, deviceId)),
      )
      .run()
    if (del.changes === 0) throw { code: 'MOVEMENT_GONE' }
    const final = replayChain(tx, deviceId)
    tx
      .update(devices)
      .set({
        status: final.status,
        currentEmployeeId: final.currentEmployeeId,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, deviceId))
      .run()
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
      fromId: fromEmp.id,
      fromName: fromEmp.name,
      toId: toEmp.id,
      toName: toEmp.name,
    })
    .from(movements)
    .leftJoin(fromEmp, eq(movements.fromEmployeeId, fromEmp.id))
    .leftJoin(toEmp, eq(movements.toEmployeeId, toEmp.id))
    .where(eq(movements.deviceId, deviceId))
    .orderBy(desc(movements.occurredAt), desc(movements.id))
    .all()
}

// One row of the dashboard's «Последние перемещения» feed (DASH-03, phase 6).
// Unlike MovementEventView this selects the employee ids TOO (fromId/toId) —
// D-05 turns the names into /employees/[id] links, and a link needs the id,
// not just the label (the timeline renders names as text, hence no ids there).
export type RecentMovementView = {
  id: number
  eventType: string
  occurredAt: Date
  deviceId: number
  model: string
  // D-08: nullable since migration 0001 — clones are born without a serial.
  serialNumber: string | null
  fromId: number | null
  fromName: string | null
  toId: number | null
  toName: string | null
}

// The 10 (limit) most recent movements across ALL devices (DASH-03): ONE
// three-way join, never N+1. innerJoin(devices) is safe — the FK is NOT NULL
// + restrict, and deleteDevice (phase 13) removes a device's movements in the
// SAME transaction as its device row, so the feed never sees an orphan.
// Names resolve through the same alias double-join as
// listTimeline — archived employees render like active ones (history is
// history; the employee card shows its own state). Order is occurredAt DESC
// with id as the tiebreaker — backdated events (D-01) sort by their own
// dates, and tied instants must not interleave between requests (probe-
// verified). Rows may be edited or deleted server-side since migration 0002
// (editMovement/deleteMovement) — the feed simply reflects the corrected
// history on the next read.
export function listRecentMovements(limit = 10): RecentMovementView[] {
  const fromEmp = alias(employees, 'from_emp')
  const toEmp = alias(employees, 'to_emp')
  return db
    .select({
      id: movements.id,
      eventType: movements.eventType,
      occurredAt: movements.occurredAt,
      deviceId: devices.id,
      model: devices.model,
      serialNumber: devices.serialNumber,
      fromId: fromEmp.id,
      fromName: fromEmp.name,
      toId: toEmp.id,
      toName: toEmp.name,
    })
    .from(movements)
    .innerJoin(devices, eq(movements.deviceId, devices.id))
    .leftJoin(fromEmp, eq(movements.fromEmployeeId, fromEmp.id))
    .leftJoin(toEmp, eq(movements.toEmployeeId, toEmp.id))
    .orderBy(desc(movements.occurredAt), desc(movements.id))
    .limit(limit)
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
      // WAR-01 site 3 (plan 05-03): the employee card's issued rows carry the
      // colored «гар. до …» segment — one added select field, no join change.
      warrantyUntil: devices.warrantyUntil,
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
