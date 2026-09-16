import type { NextRequest } from 'next/server'
import { requireSession } from '@/lib/auth'
import { exportDevices } from '@/db/queries/devices'
import { displayTodayUtc } from '@/lib/warranty'
import { buildDeviceCsv } from '@/lib/device-csv'
import { csvResponseHeaders } from '@/lib/csv'
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

// CSV columns (phase 8, EXP-01): 20 columns — the registry's visible fields
// plus the cross-type config block (Диагональ, ″ / Тип матрицы / Количество
// портов / Вид, D-01) and the warranty verdict «Статус гарантии» (D-03/D-05).
// The header array and the per-row cells mapping live in lib/device-csv (pure,
// vitest-importable — D-02 labels are derived from the PER_TYPE_FIELDS
// keystone there); this route stays a thin composer.

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
  // One today per request (per-render hoist discipline): the warranty verdict
  // column composes the shared warrantyState — the SAME calculation behind the
  // site color, so file text and site color cannot drift (WR-01, D-03).
  const today = displayTodayUtc()
  // BOM + «;» + CRLF + the esc() injection guard all live in buildCsv via
  // buildDeviceCsv (D-18, T-05-10); the header set (dual filename, nosniff,
  // no-store) in csvResponseHeaders (T-05-11). Filename date = today UTC (A7).
  const body = buildDeviceCsv(rows, today)
  const isoDate = new Date().toISOString().slice(0, 10)
  return new Response(body, { headers: csvResponseHeaders(isoDate) })
}
