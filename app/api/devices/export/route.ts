import type { NextRequest } from 'next/server'
import { requireSession } from '@/lib/auth'
import { exportDevices } from '@/db/queries/devices'
import { deviceStatusLabel, deviceTypeName } from '@/lib/device-schema'
import { formatWarrantyDate } from '@/lib/warranty-date'
import { buildCsv, csvResponseHeaders } from '@/lib/csv'
import {
  parseDevicesSearchParams,
  toDeviceListFilters,
} from '@/app/(app)/devices/query-params'

// CSV export of the FULL filtered registry (D-18, REG-01 byproduct; T-05-09..
// T-05-12). GET only: the «Скачать CSV» link is a plain server-rendered <a>
// (filter-bar.tsx) — the browser-native download UI is the feedback, no JS.
//
// Zero-drift contract: this route calls parseDevicesSearchParams — the EXACT
// parser the /devices page uses — and exportDevices, which composes the SAME
// deviceWhere predicate as listDevices (one parser, one predicate, one
// sentinel-strip — toDeviceListFilters — shared with the page; any second
// parse or strip path WILL drift — RESEARCH anti-pattern, WR-01).
//
// Security shape (mirrors the attachments-route precedent): requireSession()
// is the FIRST statement of the handler (V3 defense-in-depth on top of the
// proxy default-deny perimeter that already covers api/*); the response
// carries the hardcoded header set from csvResponseHeaders — Content-Type:
// text/csv; charset=utf-8 (never echoed from input, V5), X-Content-Type-
// Options: nosniff, Cache-Control: no-store, and the RFC 5987 dual-filename
// Content-Disposition (ASCII `devices-YYYY-MM-DD.csv` fallback + `filename*`
// for «устройства-ГГГГ-ММ-ДД.csv»). No error path echoes internals: filter
// params cannot crash anything (the parser degrades every invalid value to
// its inactive sentinel — T-03-04 discipline), so the happy path is the only
// path; an unexpected failure surfaces as Next's generic 500 (V7).

// CSV columns (A3 discretion, RESEARCH Pattern 5): the registry's visible
// fields as a superset of the six list columns — the file is the registry,
// not a richer parallel table (D-18 column discipline).
const HEADER = [
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
  'Дата закупки',
  'Стоимость',
  'Поставщик',
  'Гарантия до',
  'Заметки',
]

export async function GET(request: NextRequest) {
  await requireSession()
  const sp = Object.fromEntries(request.nextUrl.searchParams)
  const filters = parseDevicesSearchParams(sp)
  // Strip the URL-layer sentinels into the db-layer contract via the ONE
  // shared toDeviceListFilters (WR-01) — the exact mapping the page runs:
  // undefined means INACTIVE (the plan-02 presence guards and the shared
  // deviceWhere assume undefined, never 'all'/null/false/'').
  const listFilters = toDeviceListFilters(filters)
  // The full scan: every page of the current filters, canonical order, holder
  // + holder's department joined (D-09 semantics visible in the file).
  const rows = exportDevices({ type: filters.type, filters: listFilters })
  const cells = rows.map((r) => [
    deviceTypeName(r.typeKey),
    r.model,
    r.serialNumber,
    r.inventoryNumber,
    deviceStatusLabel(r.status),
    r.holder,
    r.departmentName,
    r.ramGb,
    // D-06 semantics as text: 1 = upgraded, 0 = explicitly not, null = the
    // checkbox was never touched («без отметки» renders empty, edge 5).
    r.ramUpgraded === null ? null : r.ramUpgraded === 1 ? 'да' : 'нет',
    r.ssdGb,
    // UTC-midnight timestamps render dd.mm.yyyy through the ONE module-level
    // UTC formatter (formatWarrantyDate — plan 05-03 blessed the reuse; a
    // second date formatter would be a second way to disagree).
    r.purchaseDate ? formatWarrantyDate(r.purchaseDate) : null,
    r.purchasePrice,
    r.supplier,
    r.warrantyUntil ? formatWarrantyDate(r.warrantyUntil) : null,
    r.notes,
  ])
  // BOM + «;» + CRLF + the esc() injection guard all live in buildCsv (D-18,
  // T-05-10); the header set (dual filename, nosniff, no-store) in
  // csvResponseHeaders (T-05-11). Filename date = today UTC (A7).
  const body = buildCsv(HEADER, cells)
  const isoDate = new Date().toISOString().slice(0, 10)
  return new Response(body, { headers: csvResponseHeaders(isoDate) })
}
