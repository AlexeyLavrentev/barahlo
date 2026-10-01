// XLSX-ведомость полного контекста (EXP-02, phase 14): the file-side pure layer
// behind /api/devices/export-xlsx. Pure named exports over Node built-ins and
// other pure lib modules only — no framework imports, no side effects, safe to
// import from the route, RSC and vitest alike (lib/device-csv.ts discipline).
// The route stays a thin composer: header + cells live HERE so the 20-column
// layout (D-01/D-05) is pinned positionally by vitest — route.ts imports
// lib/auth → next/headers and is not vitest-importable.
//
// The column MODEL is SHARED with the CSV file, not its renderers (D-05):
// labels come from deviceCsvHeader() — the phase-8 keystone (one edit to a
// keystone label changes the form AND both files) — and the warranty verdict
// MAPS the shared warrantyState() through WARRANTY_STATE_LABELS. The CSV-only
// hacks (BOM, «;», esc(), decimal-comma diagonalCell, ISO-text isoFileDate)
// deliberately do NOT transfer: XLSX cells are typed and inert.
//
// Library: write-excel-file@4.1.1 exact pin (D-04), imported ONLY through the
// nested node entry — the package root resolves the browser build and
// /universal yields Blob-only output without toBuffer (server-only rule).

import writeXlsxFile from 'write-excel-file/node'
import { deviceStatusLabel, deviceTypeName } from '@/lib/device-schema'
import { deviceCsvHeader, WARRANTY_STATE_LABELS } from '@/lib/device-csv'
import { warrantyState } from '@/lib/warranty'
import type { DeviceExportRow } from '@/db/queries/devices'

// Sheet name (Claude's discretion per CONTEXT): 10 characters, safely under
// the 31-char sheet limit; the library rejects empty names and []/\:*? chars.
export const XLSX_SHEET_NAME = 'Устройства'

// Column widths in character units (D-01 «по содержимому»): 20 entries in
// deviceCsvHeader() order — narrow for RAM/SSD/ports/да-нет, wide for
// Модель/Поставщик/Заметки. Starting values; tuned on plan 14-03 UAT.
export const XLSX_COLUMN_WIDTHS: readonly number[] = [
  14, // Тип
  30, // Модель
  18, // Серийный номер
  18, // Инвентарный номер
  12, // Статус
  22, // Держатель
  18, // Отдел
  12, // RAM, ГБ
  15, // RAM апгрейдена
  12, // SSD, ГБ
  14, // Диагональ, ″
  16, // Тип матрицы
  18, // Количество портов
  14, // Вид
  14, // Дата закупки
  14, // Стоимость
  24, // Поставщик
  14, // Гарантия до
  16, // Статус гарантии
  30, // Заметки
]

// Bold header row (D-01): labels are deviceCsvHeader() verbatim — never a
// second 20-label dictionary (D-02/D-05 anti-pattern).
export function deviceXlsxHeaderCells() {
  return deviceCsvHeader().map((label) => ({
    value: label,
    fontWeight: 'bold' as const,
  }))
}

// One 20-cell row per device, in deviceCsvHeader() order. TRACER version
// (plan 14-01): values pass through AS-IS from the DB — no Date
// reconstruction and no number coercion (serials/inventory stay TEXT; Date
// cells ride the sheet-level dateFormat). Plan 14-02 replaces the body with
// the pinned typed-cell matrix (explicit type/format per column, defensive
// notes slice) WITHOUT changing this signature. `today` feeds only the
// warranty verdict — the same warrantyState behind the site color (WR-01),
// hoisted by the caller ONCE per request.
export function deviceXlsxSheetData(rows: DeviceExportRow[], today: Date) {
  return rows.map((r) => [
    deviceTypeName(r.typeKey),
    r.model,
    r.serialNumber,
    r.inventoryNumber,
    deviceStatusLabel(r.status),
    r.holder,
    r.departmentName,
    r.ramGb,
    // Phase-5 semantics as text: 1 = upgraded, 0 = explicitly not, null =
    // the checkbox was never touched (renders empty) — CSV parity (D-05).
    r.ramUpgraded === null ? null : r.ramUpgraded === 1 ? 'да' : 'нет',
    r.ssdGb,
    r.screenDiagonal,
    r.panelType,
    r.portCount,
    r.peripheralKind,
    r.purchaseDate,
    r.purchasePrice,
    r.supplier,
    r.warrantyUntil,
    WARRANTY_STATE_LABELS[warrantyState(r.warrantyUntil, today)], // D-05
    r.notes,
  ])
}

// The workbook: bold header + one row per device. stickyRowsCount: 1 freezes
// the header row (D-01/SC 2); dateFormat is set ONCE at sheet level because a
// Date cell without any format throws at generation (D-02); columns carry the
// widths (D-01). write-excel-file is called via the /node entry only (D-04).
export async function buildDeviceXlsx(
  rows: DeviceExportRow[],
  today: Date,
): Promise<Buffer> {
  const out = writeXlsxFile(
    [deviceXlsxHeaderCells(), ...deviceXlsxSheetData(rows, today)],
    {
      sheet: XLSX_SHEET_NAME,
      stickyRowsCount: 1,
      dateFormat: 'dd.mm.yyyy',
      columns: XLSX_COLUMN_WIDTHS.map((width) => ({ width })),
    },
  )
  return out.toBuffer()
}

// The response header contract of the export-xlsx route (D-08, mirror of
// csvResponseHeaders in lib/csv.ts), pure so vitest pins it without a server:
// hardcoded XLSX MIME — a constant, never echoed from input (V5); no charset
// suffix (ZIP bytes are not text); nosniff; no-store (bulk personal data
// never caches); the RFC 5987 DUAL filename — ASCII fallback
// `devices-YYYY-MM-DD.xlsx` plus filename* for
// «устройства-ГГГГ-ММ-ДД.xlsx». Deliberately NOT csvResponseHeaders —
// text/csv MIME on ZIP bytes triggers Excel's repair dialog.
// isoDate is the route's own `new Date().toISOString().slice(0, 10)`.
export function xlsxResponseHeaders(isoDate: string): Record<string, string> {
  const ascii = `devices-${isoDate}.xlsx`
  const unicode = `устройства-${isoDate}.xlsx`
  return {
    'Content-Type':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(unicode)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  }
}
