// Pure CSV assembly (D-18, phase 5): the RFC-4180 escaper + builder + response
// header set behind /api/devices/export. No framework imports at all — vitest
// calls every function directly (Task 2 pins the injection matrix, the BOM/
// «;»/CRLF shape and the dual-filename headers without a server).
//
// Hand-rolled BY DESIGN (T-05-SC / plan prohibition): a dependency (papaparse,
// json2csv, csv-stringify) would add supply-chain surface for nothing at this
// scale — the escaper must exist anyway for the formula-injection guard
// (CWE-1236, RESEARCH Pitfall 8 / Don't-Hand-Roll table).

// RU Excel/Numbers open the file out of the box (D-18): UTF-8 BOM so Excel
// does not read UTF-8 as Windows-1251 (mojibake), «;» separator (the RU list
// separator — comma is the decimal mark), CRLF line endings (RFC-4180).
const BOM = '\uFEFF'
const SEPARATOR = ';'
const LINE_ENDING = '\r\n'

// One cell → one CSV field (RESEARCH Pattern 5):
// 1. null → empty field; numbers stringify.
// 2. Formula-injection guard (T-05-10, CWE-1236): a cell whose FIRST character
//    is = + - @ TAB or CR would execute as a formula when the file opens —
//    prefix a TAB so Excel/Numbers treat it as text (OWASP-recommended
//    tab-prefix; every cell passes through here — no raw join path exists).
// 3. RFC-4180 quoting ONLY when the field contains a quote, the separator or
//    CR/LF — inner quotes doubled. Plain identifiers stay untouched.
export function esc(v: string | number | null): string {
  let s = v === null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = '\t' + s
  if (/[";\n\r]/.test(s)) s = '"' + s.replaceAll('"', '""') + '"'
  return s
}

// Header row + data rows → the full file body (BOM included). Header cells
// pass through the same esc() — the quoting rule is uniform, the header row is
// just row 0 (it never contains injection-relevant leading characters, but a
// separator inside a label must not shift columns either).
export function buildCsv(
  header: string[],
  rows: (string | number | null)[][],
): string {
  const lines = [
    header.map(esc).join(SEPARATOR),
    ...rows.map((cells) => cells.map(esc).join(SEPARATOR)),
  ]
  return BOM + lines.join(LINE_ENDING)
}

// The response header contract of the export route (V5/V7, T-05-11), pure so
// vitest pins it without a server: hardcoded Content-Type (never echoed from
// input — MIME confusion is dead), nosniff, no-store (bulk data never caches),
// and the RFC 5987 DUAL filename — ASCII fallback for old agents plus
// filename* for the Cyrillic «устройства-ГГГГ-ММ-ДД.csv» (MDN-verified form).
// isoDate is the route's own `new Date().toISOString().slice(0, 10)`.
export function csvResponseHeaders(isoDate: string): Record<string, string> {
  const ascii = `devices-${isoDate}.csv`
  const unicode = `устройства-${isoDate}.csv`
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(unicode)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  }
}
