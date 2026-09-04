import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import { db } from '@/db'
import { attachments, departments, devices, employees } from '@/db/schema'
import { normalizeInventory, normalizeNumber, normalizeSerial } from '@/lib/normalize'
import { addDaysUtc, displayTodayUtc, WARRANTY_WARN_DAYS } from '@/lib/warranty'
import type { DeviceStatusKey, DeviceTypeKey } from '@/lib/device-schema'

// Device data-access (REG-01/REG-02). Pure sync functions over the module-level
// db — no framework imports at all: Server Actions add session + zod on top,
// vitest imports this module directly against a temp database.
//
// The list type of the registry. 'all' is the unfiltered view behind the type
// filter's «Все типы» option; the 4 keys mirror lib/device-schema.
export type DeviceListType = DeviceTypeKey | 'all'

// db-layer filter contract (phase 5, FIND-01/02/03): undefined means INACTIVE
// for every field. The page strips the URL-layer sentinels ('all'/null/false/''
// from query-params.ts DeviceFilters) into undefined before calling — the
// plan-02 presence guards assume undefined, a leaked sentinel would corrupt
// every composed filter. This task wires only the q consumer; plan 02 fills
// the remaining predicates.
export type DeviceListFilters = {
  q?: string
  status?: DeviceStatusKey
  departmentId?: number
  warranty?: 'w30' | 'w60' | 'expired'
  ramNoUpgrade?: boolean
}

export type DeviceListItem = {
  id: number
  typeKey: string
  model: string
  serialNumber: string
  inventoryNumber: string | null
  status: string
  holder: string | null
}

export type DeviceRow = DeviceListItem & {
  purchaseDate: Date | null
  purchasePrice: number | null
  supplier: string | null
  warrantyUntil: Date | null
  notes: string | null
  ramGb: number | null
  ramUpgraded: number | null
  ssdGb: number | null
  screenDiagonal: number | null
  panelType: string | null
  portCount: number | null
  peripheralKind: string | null
}

// One registry row plus its photo cover (REG-05 «thumbnails in lists»): the
// id of the device's FIRST photo attachment, or null when it has none — the
// list renders a leading thumbnail only then (no placeholder box, UI-SPEC).
// warrantyUntil rides along for the WAR-01 site-1 color segment (plan 05-03):
// the component cannot color what the query does not select (Pitfall 9).
export type DeviceListItemWithCover = DeviceListItem & {
  warrantyUntil: Date | null
  coverAttachmentId: number | null
}

// One row of the CSV export (D-18, plan 05-04): the registry's visible fields
// as a SUPERSET of the six list columns — the export is a byproduct of the
// registry, never a richer parallel schema. departmentName is the CURRENT
// holder's department (D-09 semantics made visible in the file); id rides
// along as the stable identity for parity assertions (export == union of
// pages) and is not a CSV column.
export type DeviceExportRow = {
  id: number
  typeKey: string
  model: string
  serialNumber: string
  inventoryNumber: string | null
  status: string
  holder: string | null
  departmentName: string | null
  ramGb: number | null
  ramUpgraded: number | null
  ssdGb: number | null
  purchaseDate: Date | null
  purchasePrice: number | null
  supplier: string | null
  warrantyUntil: Date | null
  notes: string | null
}

// Editable device fields. Deliberately EXCLUDES status, currentEmployeeId and
// (for updates) typeKey — state changes ride the phase 4 custody actions and
// the type is the identity of the field set (Pitfall 3/4).
export type DeviceInput = {
  model: string
  serialNumber: string
  inventoryNumber: string | null
  purchaseDate: Date | null
  purchasePrice: number | null
  supplier: string | null
  warrantyUntil: Date | null
  notes: string | null
  ramGb?: number | null
  ramUpgraded?: 0 | 1 | null
  ssdGb?: number | null
  screenDiagonal?: number | null
  panelType?: string | null
  portCount?: number | null
  peripheralKind?: string | null
}

// Russian-correct sort key (same recipe as employees): SQLite binary UTF-8
// puts «Ё» before «А» and NOCASE folds ASCII only — replace Ё/ё→Е/е in ORDER
// BY; devices.id is the stable tiebreaker.
const ruSortKey = sql`replace(replace(${devices.model}, 'Ё', 'Е'), 'ё', 'е')`

// UNIQUE collisions on the normalized columns are a business condition
// (D-17), not a 500: rethrow as a plain { code } the action maps onto the
// UI-SPEC field copy. The constraint name decides which column collided.
function uniqueCodeOf(e: unknown): unknown {
  if (
    e !== null &&
    typeof e === 'object' &&
    (e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  ) {
    const message = e instanceof Error ? e.message : ''
    return {
      code: message.includes('inventory_normalized')
        ? 'inventoryNormalized'
        : 'serialNormalized',
    }
  }
  return e
}

// Pitfall 5: an EMPTY inventory number must store the NULL/NULL pair —
// normalize('') is '' and a UNIQUE index on '' would collapse the second
// device. A given number writes both columns normalized (Pitfall 1/2).
function inventoryPair(inventoryNumber: string | null) {
  return {
    inventoryNumber,
    inventoryNormalized: inventoryNumber
      ? normalizeInventory(inventoryNumber)
      : null,
  }
}

// FIND-01 search predicate (05-RESEARCH Pattern 1): the query folds through
// the SAME normalizeNumber the write path uses — serial/inventory compare
// their stored *_normalized columns, the model folds via the norm() UDF
// registered in openDb (SQLite LIKE/upper fold ASCII only). An empty folded
// query means NO predicate (the full list). The folded query is capped at
// 100 chars server-side (A4, mirrors the serial bound); LIKE wildcards are
// escaped with an ESCAPE '\' clause so '%', '_' match literals only
// (Pitfall 3) — drizzle binds the pattern, user text never enters SQL text
// (T-05-01). D-02: exactly serial/inventory/model — the employees join stays
// out of the predicate.
function searchPredicate(rawQ: string | undefined) {
  const q = normalizeNumber(rawQ ?? '').slice(0, 100)
  if (q === '') return undefined
  const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
  return or(
    sql`${devices.serialNormalized} like ${pattern} escape '\\'`,
    sql`${devices.inventoryNormalized} like ${pattern} escape '\\'`,
    sql`norm(${devices.model}) like ${pattern} escape '\\'`,
  )
}

// Warranty-window predicate (WAR-01, D-15): boundaries are computed in JS on
// the DISPLAY_TZ wall clock (displayTodayUtc — the CR-01 recipe) and bound as
// Date operands on the timestamp-mode column (binds unix seconds,
// probe-verified). «Истекает ≤ N» is an ACTIVE-ONLY window (today ≤ wu ≤
// today+N, D-15 separates «истекает» from «истекла»); «Истекла» is wu < today
// with wu non-null; NULL warranty matches NO warranty filter (null is not
// «expired» — three-valued SQL would drop it anyway, the isNotNull makes the
// intent explicit). The ≤ 60 window shares WARRANTY_WARN_DAYS with the future
// color state — a filter hit can never render green (edge 8).
function warrantyPredicate(w: DeviceListFilters['warranty']) {
  if (!w) return undefined
  const today = displayTodayUtc()
  if (w === 'expired') {
    return and(isNotNull(devices.warrantyUntil), lt(devices.warrantyUntil, today))
  }
  const days = w === 'w30' ? 30 : WARRANTY_WARN_DAYS
  return and(
    isNotNull(devices.warrantyUntil),
    gte(devices.warrantyUntil, today),
    lte(devices.warrantyUntil, addDaysUtc(today, days)),
  )
}

// The ONE filter predicate assembly of the registry (plan 05-04 factoring):
// listDevices and exportDevices consume exactly this function — the export is
// literally the same predicate, so «полный результат текущих фильтров» (D-18)
// can never drift from what the page shows. Every filter composes into a
// single and(...); each term is guarded by the presence of its parsed filter
// so inactive filters contribute nothing (the page/route strip the URL
// sentinels into undefined). Sort stays the canonical RU-sort with the id
// tiebreaker: no relevance ranking anywhere in the search path (D-03).
function deviceWhere(
  type: DeviceListType,
  filters: DeviceListFilters | undefined,
) {
  return and(
    type === 'all' ? undefined : eq(devices.typeKey, type),
    filters?.q ? searchPredicate(filters.q) : undefined,
    filters?.status ? eq(devices.status, filters.status) : undefined,
    // D-09: the department predicate rides the EXISTING leftJoin — a device
    // matches when its CURRENT holder belongs to the department. In-stock
    // rows (NULL holder) drop out of the join for free; archived employees
    // join normally (isActive is deliberately not filtered — приёмка
    // единицы не теряется).
    filters?.departmentId
      ? eq(employees.departmentId, filters.departmentId)
      : undefined,
    // D-07 (edge 5, orchestrator resolution 5): the ramUpgraded flag is the
    // ONLY semantics — NULL means not upgraded (the checkbox is set only by
    // the upgrade fact). A plain `!= 1` silently drops NULL rows (SQL
    // three-valued logic, probe-verified). The term is self-limiting to
    // laptops server-side, so a hand-crafted ?type=monitor&ram=1 is inert —
    // the client coupling (D-08 in buildDevicesQuery) is UX only, never the
    // boundary (T-05-06).
    filters?.ramNoUpgrade
      ? and(
          eq(devices.typeKey, 'laptop'),
          or(isNull(devices.ramUpgraded), ne(devices.ramUpgraded, 1)),
        )
      : undefined,
    warrantyPredicate(filters?.warranty),
  )
}

export function listDevices({
  type,
  page,
  pageSize,
  filters,
}: {
  type: DeviceListType
  page: number
  pageSize: number
  filters?: DeviceListFilters
}): {
  rows: DeviceListItemWithCover[]
  total: number
  page: number
  pages: number
} {
  // One where shared by the count and the rows query (Pitfall 5 property).
  const where = deviceWhere(type, filters)
  // The SAME where spans employees (department predicate), so the count query
  // carries the same leftJoin. employees is joined on its primary key — the
  // join cannot multiply rows, the total stays exact while count and rows
  // provably cannot drift (Pitfall 5).
  const total = db
    .select({ value: count() })
    .from(devices)
    .leftJoin(employees, eq(devices.currentEmployeeId, employees.id))
    .where(where)
    .get()!.value
  const pages = Math.max(1, Math.ceil(total / pageSize))
  // Clamp into [1, pages] — never render a page beyond the last one.
  const current = Math.min(Math.max(1, page), pages)
  const rows = db
    .select({
      id: devices.id,
      typeKey: devices.typeKey,
      model: devices.model,
      serialNumber: devices.serialNumber,
      inventoryNumber: devices.inventoryNumber,
      status: devices.status,
      holder: employees.name,
      // WAR-01 site 1 (plan 05-03): the registry row colors «гар. до …» via
      // the shared warrantyState — the field must be selected here.
      warrantyUntil: devices.warrantyUntil,
    })
    .from(devices)
    .leftJoin(employees, eq(devices.currentEmployeeId, employees.id))
    .where(where)
    .orderBy(ruSortKey, asc(devices.id))
    .limit(pageSize)
    .offset((current - 1) * pageSize)
    .all()
  // Photo covers (REG-05 «thumbnails in lists», RESEARCH C6): ONE batched
  // scan over the ≤20 page ids — attachments has no device_id index (none
  // addable, frozen migration) and one per-page scan stays milliseconds.
  // First attachment per device by id; grouped in JS (≤20 rows).
  const coverByDevice = new Map<number, number>()
  if (rows.length > 0) {
    const covers = db
      .select({ id: attachments.id, deviceId: attachments.deviceId })
      .from(attachments)
      .where(
        and(
          inArray(
            attachments.deviceId,
            rows.map((row) => row.id),
          ),
          eq(attachments.kind, 'photo'),
        ),
      )
      .orderBy(asc(attachments.id))
      .all()
    for (const cover of covers) {
      if (!coverByDevice.has(cover.deviceId)) {
        coverByDevice.set(cover.deviceId, cover.id)
      }
    }
  }
  return {
    rows: rows.map((row) => ({
      ...row,
      coverAttachmentId: coverByDevice.get(row.id) ?? null,
    })),
    total,
    page: current,
    pages,
  }
}

// The CSV export scan (D-18, plan 05-04): the FULL filtered result — the same
// deviceWhere predicate as listDevices (one predicate, two callers), the same
// canonical RU-sort + id order, but NO limit/offset: every page lands in the
// file. Holder AND the holder's department are joined (a second leftJoin on
// the pk sides — neither can multiply rows) so the «Отдел» column carries the
// D-09 semantics the department filter matches on. The select mirrors the CSV
// columns exactly (DeviceExportRow — a superset of the six list columns, never
// a richer parallel schema).
export function exportDevices({
  type,
  filters,
}: {
  type: DeviceListType
  filters?: DeviceListFilters
}): DeviceExportRow[] {
  return db
    .select({
      id: devices.id,
      typeKey: devices.typeKey,
      model: devices.model,
      serialNumber: devices.serialNumber,
      inventoryNumber: devices.inventoryNumber,
      status: devices.status,
      holder: employees.name,
      departmentName: departments.name,
      ramGb: devices.ramGb,
      ramUpgraded: devices.ramUpgraded,
      ssdGb: devices.ssdGb,
      purchaseDate: devices.purchaseDate,
      purchasePrice: devices.purchasePrice,
      supplier: devices.supplier,
      warrantyUntil: devices.warrantyUntil,
      notes: devices.notes,
    })
    .from(devices)
    .leftJoin(employees, eq(devices.currentEmployeeId, employees.id))
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(deviceWhere(type, filters))
    .orderBy(ruSortKey, asc(devices.id))
    .all()
}

export function getDevice(id: number): DeviceRow | undefined {
  return db
    .select({
      id: devices.id,
      typeKey: devices.typeKey,
      model: devices.model,
      serialNumber: devices.serialNumber,
      inventoryNumber: devices.inventoryNumber,
      status: devices.status,
      holder: employees.name,
      purchaseDate: devices.purchaseDate,
      purchasePrice: devices.purchasePrice,
      supplier: devices.supplier,
      warrantyUntil: devices.warrantyUntil,
      notes: devices.notes,
      ramGb: devices.ramGb,
      ramUpgraded: devices.ramUpgraded,
      ssdGb: devices.ssdGb,
      screenDiagonal: devices.screenDiagonal,
      panelType: devices.panelType,
      portCount: devices.portCount,
      peripheralKind: devices.peripheralKind,
    })
    .from(devices)
    .leftJoin(employees, eq(devices.currentEmployeeId, employees.id))
    .where(eq(devices.id, id))
    .get()
}

export function createDevice(input: { typeKey: DeviceTypeKey } & DeviceInput): number {
  try {
    return db
      .insert(devices)
      .values({
        typeKey: input.typeKey,
        model: input.model,
        serialNumber: input.serialNumber,
        serialNormalized: normalizeSerial(input.serialNumber),
        ...inventoryPair(input.inventoryNumber),
        purchaseDate: input.purchaseDate,
        purchasePrice: input.purchasePrice,
        supplier: input.supplier,
        warrantyUntil: input.warrantyUntil,
        notes: input.notes,
        ramGb: input.ramGb ?? null,
        ramUpgraded: input.ramUpgraded ?? null,
        ssdGb: input.ssdGb ?? null,
        screenDiagonal: input.screenDiagonal ?? null,
        panelType: input.panelType ?? null,
        portCount: input.portCount ?? null,
        peripheralKind: input.peripheralKind ?? null,
      })
      .returning({ id: devices.id })
      .get()!.id
  } catch (e) {
    throw uniqueCodeOf(e)
  }
}

// Returns true when the row existed and was updated; an unknown id neither
// throws nor creates rows. Normalized numbers are ALWAYS recomputed (Pitfall
// 2) so the UNIQUE indexes and the phase 5 search never diverge from the raw
// columns. Type and status are not updatable here — by signature.
export function updateDevice(id: number, input: DeviceInput): boolean {
  const existing = db
    .select({ id: devices.id })
    .from(devices)
    .where(eq(devices.id, id))
    .get()
  if (!existing) return false
  try {
    db.update(devices)
      .set({
        model: input.model,
        serialNumber: input.serialNumber,
        serialNormalized: normalizeSerial(input.serialNumber),
        ...inventoryPair(input.inventoryNumber),
        purchaseDate: input.purchaseDate,
        purchasePrice: input.purchasePrice,
        supplier: input.supplier,
        warrantyUntil: input.warrantyUntil,
        notes: input.notes,
        ramGb: input.ramGb ?? null,
        ramUpgraded: input.ramUpgraded ?? null,
        ssdGb: input.ssdGb ?? null,
        screenDiagonal: input.screenDiagonal ?? null,
        panelType: input.panelType ?? null,
        portCount: input.portCount ?? null,
        peripheralKind: input.peripheralKind ?? null,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, id))
      .run()
    return true
  } catch (e) {
    throw uniqueCodeOf(e)
  }
}
