import { and, asc, count, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import { attachments, devices, employees } from '@/db/schema'
import { normalizeInventory, normalizeSerial } from '@/lib/normalize'
import type { DeviceTypeKey } from '@/lib/device-schema'

// Device data-access (REG-01/REG-02). Pure sync functions over the module-level
// db — no framework imports at all: Server Actions add session + zod on top,
// vitest imports this module directly against a temp database.
//
// The list type of the registry. 'all' is the unfiltered view behind the type
// filter's «Все типы» option; the 4 keys mirror lib/device-schema.
export type DeviceListType = DeviceTypeKey | 'all'

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
export type DeviceListItemWithCover = DeviceListItem & {
  coverAttachmentId: number | null
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

export function listDevices({
  type,
  page,
  pageSize,
}: {
  type: DeviceListType
  page: number
  pageSize: number
}): {
  rows: DeviceListItemWithCover[]
  total: number
  page: number
  pages: number
} {
  const where = type === 'all' ? undefined : eq(devices.typeKey, type)
  const total = db
    .select({ value: count() })
    .from(devices)
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
