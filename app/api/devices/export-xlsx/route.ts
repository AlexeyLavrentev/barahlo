import type { NextRequest } from 'next/server'
import { requireSession } from '@/lib/auth'
import { exportDevices } from '@/db/queries/devices'
import { displayTodayUtc } from '@/lib/warranty'
import { buildDeviceXlsx, xlsxResponseHeaders } from '@/lib/device-xlsx'
import { searchParamsRecord } from '@/lib/search-params-record'
import {
  parseDevicesSearchParams,
  toDeviceListFilters,
} from '@/app/(app)/devices/query-params'

// XLSX export of the FULL filtered registry (EXP-02, phase 14; D-07/D-08).
// GET only: the «Скачать XLSX» link is a plain server-rendered <a>
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
// carries the hardcoded header set from xlsxResponseHeaders — Content-Type:
// application/vnd.openxmlformats-officedocument.spreadsheetml.sheet (never
// echoed from input, V5; no charset suffix — ZIP bytes are not text),
// X-Content-Type-Options: nosniff, Cache-Control: no-store, and the RFC 5987
// dual-filename Content-Disposition (ASCII `devices-YYYY-MM-DD.xlsx` fallback
// + `filename*` for «устройства-ГГГГ-ММ-ДД.xlsx»). No error path echoes
// internals: filter params cannot crash anything (the parser degrades every
// invalid value to its inactive sentinel — T-03-04 discipline), so the happy
// path is the only path; an unexpected failure surfaces as Next's generic 500
// (V7).

// XLSX columns (phase 14, EXP-02): the SAME 20 columns as the CSV ведомость —
// the header array and the per-row cells mapping live in lib/device-xlsx
// (pure, vitest-importable — D-05 labels are derived from deviceCsvHeader
// there); this route stays a thin composer.

export async function GET(request: NextRequest) {
  await requireSession()
  // D-08 fix #1 (phase 11, WR-01): shape duplicated params into arrays —
  // the SAME record shape Next gives the page — before the shared parser.
  // Object.fromEntries here kept only the LAST value of a duplicate, so a
  // malformed URL made the CSV diverge from the page view; now both sides
  // hit the parser's intended array-degradation path (the shaping loop
  // lives in the pure lib module, vitest-pinned by
  // tests/search-params-record.test.ts — never duplicated per route).
  const sp = searchParamsRecord(request.nextUrl.searchParams)
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
  // site color, so file cells and site color cannot drift (WR-01, D-05).
  const today = displayTodayUtc()
  // The workbook bytes (typed cells, freeze pane, widths) live in
  // buildDeviceXlsx (D-02/D-04); the header set (XLSX MIME, dual filename,
  // nosniff, no-store) in xlsxResponseHeaders (D-08). Filename date = today
  // UTC (A7). Buffer → Uint8Array wrap: the Web Response body accepts
  // body-init types, and the attachments route serves bytes exactly this way.
  const body = await buildDeviceXlsx(rows, today)
  const isoDate = new Date().toISOString().slice(0, 10)
  return new Response(new Uint8Array(body), {
    headers: xlsxResponseHeaders(isoDate),
  })
}
