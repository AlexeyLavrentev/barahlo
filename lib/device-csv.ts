// CSV-ведомость полного контекста (EXP-01, phase 8): the file-side pure layer
// behind /api/devices/export. Pure named exports over Node built-ins and other
// pure lib modules only — no framework imports, no side effects, safe to
// import from the route, RSC and vitest alike (lib/warranty.ts discipline).
// The route stays a thin composer: header + cells live HERE so the 20-column
// layout (D-01/D-05) is pinned positionally by vitest — route.ts imports
// lib/auth → next/headers and is not vitest-importable.
//
// Three single-source rules shape this module (research anti-patterns):
// - Column labels of the config block are DERIVED from the keystone
//   (lib/device-schema.ts PER_TYPE_FIELDS via DEVICE_TYPES) — never
//   duplicated (D-02: one edit to a keystone label changes the form AND
//   the file).
// - Warranty status text MAPS states, it never re-derives them: the
//   dictionary wraps warrantyState() output. No warn-boundary constant and
//   no day-count arithmetic live here — the boundary lives only in
//   lib/warranty.ts, and the file stays in parity with the site color
//   by construction (WR-01).
// - Dates render ISO through ONE formatter (D-06). Stored purchaseDate/
//   warrantyUntil are UTC-midnight stamps (the form writes
//   new Date('yyyy-mm-dd')), so toISOString().slice(0, 10) round-trips the
//   exact calendar day on any host timezone — no local getters, no Intl
//   (CR-01 bug class). The site's dd.mm.yyyy formatter (lib/warranty-date)
//   is untouched and unused here.

import {
  DEVICE_TYPES,
  deviceStatusLabel,
  deviceTypeName,
  type DeviceField,
  type DeviceFieldKey,
} from '@/lib/device-schema'
import { warrantyState, type WarrantyState } from '@/lib/warranty'
import { buildCsv } from '@/lib/csv'
import type { DeviceExportRow } from '@/db/queries/devices'

// The export's sparse config-block layout (D-01): a CROSS-type order no single
// per-type array contains — so the order lives here as KEYS and the labels are
// looked up in the keystone (D-02). Each device type fills only the keys its
// PER_TYPE_FIELDS declares; foreign cells stay empty (sparse is structural —
// createDevice writes `?? null` for every config field).
export const CONFIG_EXPORT_KEYS: readonly DeviceFieldKey[] = [
  'screenDiagonal',
  'panelType',
  'portCount',
  'peripheralKind',
]

// The keystone's field table flattened once (4 types × their fields).
const ALL_KEYSTONE_FIELDS: readonly DeviceField[] = DEVICE_TYPES.flatMap(
  (t) => t.fields,
)

// Label of a config field, verbatim from the keystone — 'Диагональ, ″' with
// the real U+2033 double-prime, exactly as the form renders it. Unknown keys
// throw: a CONFIG_EXPORT_KEYS typo must fail loudly, not mislabel a column.
export function keystoneLabel(key: DeviceFieldKey): string {
  const field = ALL_KEYSTONE_FIELDS.find((f) => f.key === key)
  if (!field) throw new Error(`unknown config field key: ${key}`)
  return field.label
}

// D-03/D-04: the ONE state→text dictionary of the file. 'none' renders text,
// never an empty cell — the status column answers in every row. No day
// numbers in the text (the boundary is visible as the date next door and must
// not leak the warn threshold into strings).
export const WARRANTY_STATE_LABELS: Record<WarrantyState, string> = {
  ok: 'Действует',
  warn: 'Истекает',
  expired: 'Истекла',
  none: 'Без гарантии',
}

// D-06: the file's ONE date formatter. Exact for UTC-midnight operands on any
// host timezone; locale-independent sorting in Excel is lexicographic ISO.
export function isoFileDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

// The file's FIRST fractional column (screen_diagonal is REAL, step 0.1).
// Dot-decimal values like 21.5 are read as DATES (21 May) by comma-decimal
// RU-Excel — the very locale the file's «;» separator and BOM already target —
// so the cell writes a decimal COMMA («21,5»). Integers are unaffected
// (replace('.', ',') never fires). null → null → empty cell (esc()).
export function diagonalCell(value: number | null): string | null {
  if (value === null) return null
  return String(value).replace('.', ',')
}

// The 20 columns in D-01/D-05 order: the registry's visible fields with the
// cross-type config block inserted contiguously after «SSD, ГБ» and the
// warranty verdict right after its date («Гарантия до» → «Статус гарантии»).
export function deviceCsvHeader(): string[] {
  return [
    'Тип',
    'Модель',
    'Серийный номер',
    'Инвентарный номер',
    'Статус',
    'Держатель',
    'Отдел',
    'RAM, ГБ',
    'RAM апгрейдена',
    'SSD, ГБ',
    ...CONFIG_EXPORT_KEYS.map(keystoneLabel),
    'Дата закупки',
    'Стоимость',
    'Поставщик',
    'Гарантия до',
    'Статус гарантии',
    'Заметки',
  ]
}

// Header + one 20-cell row per device, assembled through the ONE body builder
// buildCsv (BOM + «;» + CRLF): every cell and the header pass the esc()
// CWE-1236 guard by construction — there is no raw join path, so formula
// injection through the new free-text columns is impossible (SC 3).
// Sparse pass-through: nullable config fields render null → empty cell with
// no per-type branching. `today` is hoisted by the caller ONCE per request
// (same per-render discipline as the page) — parity with the site color via
// the shared warrantyState (WR-01).
export function buildDeviceCsv(rows: DeviceExportRow[], today: Date): string {
  const cells = rows.map((r) => [
    deviceTypeName(r.typeKey),
    r.model,
    r.serialNumber,
    r.inventoryNumber,
    deviceStatusLabel(r.status),
    r.holder,
    r.departmentName,
    r.ramGb,
    // Phase-5 semantics as text: 1 = upgraded, 0 = explicitly not, null =
    // the checkbox was never touched («без отметки» renders empty).
    r.ramUpgraded === null ? null : r.ramUpgraded === 1 ? 'да' : 'нет',
    r.ssdGb,
    // ── config block, contiguous (D-01) ──
    diagonalCell(r.screenDiagonal),
    r.panelType,
    r.portCount,
    r.peripheralKind,
    // ── end config block ──
    r.purchaseDate ? isoFileDate(r.purchaseDate) : null,
    r.purchasePrice,
    r.supplier,
    r.warrantyUntil ? isoFileDate(r.warrantyUntil) : null,
    WARRANTY_STATE_LABELS[warrantyState(r.warrantyUntil, today)], // D-05
    r.notes,
  ])
  return buildCsv(deviceCsvHeader(), cells)
}
