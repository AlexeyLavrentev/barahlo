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

import writeXlsxFile, { type SheetData } from 'write-excel-file/node'
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

// One 20-cell row per device, in deviceCsvHeader() order. THE PINNED TYPED
// MATRIX (plan 14-02, Cell-Type Map of 14-RESEARCH.md): DB values pass
// through verbatim — dates are never reconstructed (Date cells ride the
// sheet-level dateFormat, D-02) and numbers are never stringified (the
// library throws loudly on a type:Number cell with a non-number value).
// Serials/inventory are the DANGEROUS direction — a numeric write is silent:
// they are String cells with '@', the ONLY legal String-cell format
// (Pitfall 14.1), and no Number()/+ coercion may appear between the query
// row and this array (scientific notation + stripped leading zeros,
// c4b2e2d recurrence, D-03). Explicit type/format objects carry ONLY the
// four columns whose cell contract differs from the inferred default;
// everything else stays a raw value — String/Number inference is the
// library's own and is pinned positionally by tests/xlsx-export.test.ts
// (type ∈ {String, Number, Date}, no Formula cells). CSV-only renderers
// (decimal-comma diagonalCell, ISO-text isoFileDate, esc(), BOM, «;») do
// NOT transfer — typed cells make them wrong, not redundant (D-05).
// `today` feeds only the warranty verdict — the same warrantyState behind
// the site color (WR-01), hoisted by the caller ONCE per request.
export function deviceXlsxSheetData(
  rows: DeviceExportRow[],
  today: Date,
): SheetData {
  // The `as SheetData` edge: the library's `CellObjectOfType<Value>` omits
  // null from `value`, but its RUNTIME writes a null value as an empty cell
  // (research §Cell object) — DB nulls pass through verbatim, so the cast
  // documents a library-type omission, never a value transformation.
  return rows.map((r) => [
    deviceTypeName(r.typeKey),
    r.model,
    // D-03: TEXT columns ride as String cells — never Number() (see above);
    // null stays null → empty cell, not the empty string.
    { value: r.serialNumber, type: String, format: '@' },
    { value: r.inventoryNumber, type: String, format: '@' },
    deviceStatusLabel(r.status),
    r.holder,
    r.departmentName,
    r.ramGb,
    // Phase-5 semantics as text: 1 = upgraded, 0 = explicitly not, null =
    // the checkbox was never touched (renders empty) — CSV parity (D-05).
    r.ramUpgraded === null ? null : r.ramUpgraded === 1 ? 'да' : 'нет',
    r.ssdGb,
    // Raw REAL (D-03/D-05): RU-Excel renders «21,5» from 21.5 via the 0.0
    // numFmt — diagonalCell()'s decimal comma stays CSV-only.
    { value: r.screenDiagonal, type: Number, format: '0.0' },
    r.panelType,
    r.portCount,
    r.peripheralKind,
    // D-02: the Date itself; the display format is the sheet-level
    // dateFormat 'dd.mm.yyyy' — no per-cell format to duplicate it.
    r.purchaseDate,
    // D-03: thousands grouping is drawn by Excel from '#,##0' — the cell
    // holds 125000, not a pre-formatted string.
    { value: r.purchasePrice, type: Number, format: '#,##0' },
    r.supplier,
    r.warrantyUntil,
    WARRANTY_STATE_LABELS[warrantyState(r.warrantyUntil, today)], // WR-01
    // XLSX cell limit 32 767 chars (CONTEXT discretion); null stays null.
    r.notes === null ? null : r.notes.slice(0, 32_767),
  ]) as SheetData
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
