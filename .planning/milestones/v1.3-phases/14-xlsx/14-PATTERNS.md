# Phase 14: XLSX-выгрузка ведомости - Pattern Map

**Mapped:** 2026-09-29
**Files analyzed:** 7 (4 new, 3 modified)
**Analogs found:** 7 / 7 (all exact or self-analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/device-xlsx.ts` (NEW) | utility (pure lib file-builder) | transform | `lib/device-csv.ts` + `lib/csv.ts` (headers helper) | exact |
| `app/api/devices/export-xlsx/route.ts` (NEW) | route (API handler) | request-response | `app/api/devices/export/route.ts` | exact |
| `app/(app)/devices/filter-bar.tsx` (EDIT) | component (server) | request-response | self — CSV anchor (lines 36–49) | exact (additive sibling) |
| `components/command-palette.tsx` (EDIT) | component (client island) | event-driven | self — CSV palette row (lines 82–86, 450–465) | exact (additive sibling) |
| `tests/xlsx-export.test.ts` (NEW) | test (unit) | batch/transform assertions | `tests/csv-export.test.ts` | exact |
| `next.config.ts` (CONDITIONAL EDIT) | config | — | self (only if D-06 spike fails) | self |
| `package.json` (EDIT) | config (dep pin) | — | n/a — mechanical `npm install --save-exact write-excel-file@4.1.1` | no analog needed |

## Pattern Assignments

### `lib/device-xlsx.ts` (utility, transform)

**Analog:** `lib/device-csv.ts` — same role (pure file-side layer behind an export route), same data flow (DeviceExportRow[] → file format).

**Module contract pattern** (`lib/device-csv.ts` lines 1–7 — copy the discipline, not the CSV specifics):
```typescript
// CSV-ведомость полного контекста (EXP-01, phase 8): the file-side pure layer
// behind /api/devices/export. Pure named exports over Node built-ins and other
// pure lib modules only — no framework imports, no side effects, safe to
// import from the route, RSC and vitest alike (lib/warranty.ts discipline).
// The route stays a thin composer: header + cells live HERE so the 20-column
// layout (D-01/D-05) is pinned positionally by vitest — route.ts imports
// lib/auth → next/headers and is not vitest-importable.
```
Rules to reproduce verbatim: NO `server-only` import, NO `next/*` imports (vitest imports this file directly — `tests/stubs/server-only.ts` exists only because some lib files do import `server-only`).

**Imports pattern** (`lib/device-csv.ts` lines 26–35 — XLSX imports the same shared sources, plus the new lib):
```typescript
import {
  DEVICE_TYPES,
  deviceStatusLabel,
  deviceTypeName,
  type DeviceField,
  type DeviceFieldKey,
} from '@/lib/device-schema'
import { warrantyState, type WarrantyState } from '@/lib/warranty'
import { buildCsv } from '@/lib/csv'                       // ← XLSX does NOT import this
import type { DeviceExportRow } from '@/db/queries/devices'
```
XLSX version: `import writeXlsxFile from 'write-excel-file/node'` (subpath only, never the package root — D-04), `import { deviceCsvHeader, WARRANTY_STATE_LABELS } from '@/lib/device-csv'`, `warrantyState` from `@/lib/warranty`, `type { DeviceExportRow }` from `@/db/queries/devices`.

**Single-source column model** (`lib/device-csv.ts` lines 42–47, 57–61, 93–113 — import these, never re-declare):
```typescript
export const CONFIG_EXPORT_KEYS: readonly DeviceFieldKey[] = [
  'screenDiagonal', 'panelType', 'portCount', 'peripheralKind',
]

export function keystoneLabel(key: DeviceFieldKey): string {
  const field = ALL_KEYSTONE_FIELDS.find((f) => f.key === key)
  if (!field) throw new Error(`unknown config field key: ${key}`)
  return field.label
}

export function deviceCsvHeader(): string[] {
  return [
    'Тип', 'Модель', 'Серийный номер', 'Инвентарный номер',
    'Статус', 'Держатель', 'Отдел', 'RAM, ГБ', 'RAM апгрейдена', 'SSD, ГБ',
    ...CONFIG_EXPORT_KEYS.map(keystoneLabel),
    'Дата закупки', 'Стоимость', 'Поставщик', 'Гарантия до',
    'Статус гарантии', 'Заметки',
  ]
}
```
The XLSX header row derives from `deviceCsvHeader()` — a pinned parity test asserts the label lists are identical (D-02: one keystone edit changes form + CSV + XLSX together).

**Warranty dictionary** (`lib/device-csv.ts` lines 67–72 — maps, never re-derives):
```typescript
export const WARRANTY_STATE_LABELS: Record<WarrantyState, string> = {
  ok: 'Действует',
  warn: 'Истекает',
  expired: 'Истекла',
  none: 'Без гарантии',
}
```

**Row-mapping shape** (`lib/device-csv.ts` lines 123–151 — the cell order to mirror, but with TYPED cells, not CSV renderers):
```typescript
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
```
D-05 inversion for XLSX — keep the ORDER and the `today` injection, DROP the CSV renderers:
- `diagonalCell(...)` → `{ value: r.screenDiagonal, type: Number, format: '0.0' }` (raw REAL; null passes through as empty cell)
- `isoFileDate(...)` → raw Date: `r.purchaseDate` / `r.warrantyUntil` verbatim (Date cells; sheet-level `dateFormat: 'dd.mm.yyyy'` covers the format — never reconstruct the Date)
- `esc()` / BOM / `«;»` — do not exist here; XLSX String cells are inert
- notes: `r.notes === null ? null : r.notes.slice(0, 32767)` (XLSX cell limit)
- serial/inventory: `{ value: r.serialNumber, type: String, format: '@' }` — never `Number()`/`+` (D-03; `'@'` is the ONLY legal String-cell format in write-excel-file 4.1.1)

**Response-headers helper to mirror** (`lib/csv.ts` lines 54–63 — `xlsxResponseHeaders` is this function with MIME + extension swapped):
```typescript
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
```
XLSX deltas (D-08): `'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'` (no charset suffix), `.xlsx` extensions, same RFC 5987 dual-filename form, same nosniff/no-store. NEVER reuse `csvResponseHeaders` for XLSX (text/csv MIME on ZIP bytes = Excel repair dialog).

**API reference for the library call** — no in-codebase analog exists (first XLSX producer). Source of truth is RESEARCH.md «The write-excel-file@4.1.1 API — Exact Reference» (verified against the pinned tarball): `writeXlsxFile(sheetData, { sheet, stickyRowsCount, dateFormat, columns })` → `.toBuffer(): Promise<Buffer>`; header cells `{ value: label, fontWeight: 'bold' as const }`; `type ∈ {String, Number, Date}` only (never `'Formula'`).

---

### `app/api/devices/export-xlsx/route.ts` (route, request-response)

**Analog:** `app/api/devices/export/route.ts` — exact mirror; only the builder call, headers helper, and one added `await` differ.

**Imports pattern** (lines 1–11):
```typescript
import type { NextRequest } from 'next/server'
import { requireSession } from '@/lib/auth'
import { exportDevices } from '@/db/queries/devices'
import { displayTodayUtc } from '@/lib/warranty'
import { buildDeviceCsv } from '@/lib/device-csv'        // → buildDeviceXlsx from '@/lib/device-xlsx'
import { csvResponseHeaders } from '@/lib/csv'          // → xlsxResponseHeaders from '@/lib/device-xlsx'
import { searchParamsRecord } from '@/lib/search-params-record'
import {
  parseDevicesSearchParams,
  toDeviceListFilters,
} from '@/app/(app)/devices/query-params'
```

**The GET handler — zero-drift chain (D-07), lines 42–71:**
```typescript
export async function GET(request: NextRequest) {
  await requireSession()                                     // FIRST statement (V3)
  const sp = searchParamsRecord(request.nextUrl.searchParams)
  const filters = parseDevicesSearchParams(sp)
  const listFilters = toDeviceListFilters(filters)
  const rows = exportDevices({ type: filters.type, filters: listFilters })
  const today = displayTodayUtc()
  const body = buildDeviceCsv(rows, today)                   // → await buildDeviceXlsx(rows, today)
  const isoDate = new Date().toISOString().slice(0, 10)
  return new Response(body, { headers: csvResponseHeaders(isoDate) })
  // → new Response(new Uint8Array(body), { headers: xlsxResponseHeaders(isoDate) })
}
```
Copy the comment block (lines 13–40) too — the zero-drift contract and security-shape rationale transfer verbatim (WR-01). Every step is copied as-is; the ONLY deltas are: builder is async (`await` + `.toBuffer()`), body wrapped in `new Uint8Array(...)`, headers helper swapped.

**Binary-body precedent** (`app/api/attachments/[attachmentId]/route.ts` line 80 — proves `Uint8Array` bodies work in this Next version):
```typescript
return new Response(new Uint8Array(bytes), {
```

**Error-handling pattern:** none beyond the guard — the happy path is the only path. Filter params cannot crash (the shared parser degrades every invalid value to its inactive sentinel); unexpected failures surface as Next's generic 500. Do NOT add try/catch or error-echo paths (V5/V7 discipline from the CSV route comment, lines 30–33). Note: the attachments route's `statusFor`/`jsonError` machinery is IDOR-specific — do not copy it.

---

### `app/(app)/devices/filter-bar.tsx` (component, request-response)

**Analog:** self — the CSV anchor at lines 44–49 (add one sibling `<a>` AFTER it).

```tsx
      <a
        href={`/api/devices/export${buildDevicesQuery(filters)}`}
        className="ml-auto inline-flex h-10 shrink-0 items-center rounded-lg bg-secondary px-3 text-sm text-secondary-foreground transition-all duration-100 ease-out hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] active:scale-[0.97] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none select-none"
      >
        Скачать CSV
      </a>
```
XLSX sibling: same class string **minus `ml-auto`** (a second `ml-auto` re-splits the bar's free space and visually detaches the CSV button — Pitfall 14.5), `href={/api/devices/export-xlsx${buildDevicesQuery(filters)}}`, label «Скачать XLSX». Plain server-rendered `<a>` — no island, no pending state (UI-SPEC Defaults #9/#16). Update the trailing comment block (lines 36–43) to cover both links.

---

### `components/command-palette.tsx` (component, event-driven)

**Analog:** self — the CSV palette row. Two pieces to mirror:

**Item constant** (line 86):
```typescript
const CSV_ITEM = { kind: 'csv' } as const
```
XLSX: `const XLSX_ITEM = { kind: 'xlsx' } as const` right after it.

**The row** (lines 450–465 — the last keyboard stop; native-anchor semantics are load-bearing):
```tsx
                      <Autocomplete.Item
                        value={CSV_ITEM}
                        render={<a href="/api/devices/export" />}
                        onClick={() => setOpen(false)}
                        className={`${ROW_CLASS} border-t border-hairline text-sm text-ink-secondary group-data-highlighted:text-accent-foreground/80`}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          Скачать ведомость CSV
                        </span>
                      </Autocomplete.Item>
```
XLSX sibling immediately after it: `value={XLSX_ITEM}`, `render={<a href="/api/devices/export-xlsx" />}`, same onClick/class pattern, label «Скачать ведомость XLSX». Do NOT use `router.push`/`window.open` — Enter-on-highlighted works only because Base UI dispatches a real DOM click on the native anchor (comment lines 43–51; Pitfall 14.4). Note the border-t: keep it on the CSV row (the XLSX row sits inside, no second border). Both rows carry NO query string — palette export = whole park.

---

### `tests/xlsx-export.test.ts` (test, batch/transform)

**Analog:** `tests/csv-export.test.ts`.

**Harness pattern** (lines 1–39 — copy verbatim; DATABASE_PATH must be set BEFORE the first `@/db` import, hence the dynamic imports):
```typescript
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { applyMigrations } from './helpers'

const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-csv-'))
process.env.DATABASE_PATH = join(tmpDir, 'csv.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const queries = await import('@/db/queries/devices')
const { createDevice, listDevices, exportDevices, totalDeviceCount } = queries
const { createEmployee } = await import('@/db/queries/employees')
// … then the lib imports under test
```

**Test shapes to mirror** (non-overlapping sections):
- Headers helper pin (lines 390–408): exact-string asserts on Content-Type / Content-Disposition (ASCII fallback + `encodeURIComponent('устройства-…')` form) / nosniff / no-store.
- Positional file tracer (lines 411–465): build the file over `exportDevices({ type: 'all' })`, then assert row-by-row positional cells. XLSX version asserts the CELL MATRIX instead of parsing text: `deviceXlsxSheetData(...)` returns 20 typed cells per row — assert `type` (`String`/`Number`/`Date`, never `'Formula'`), `format` (`'@'` on serial/inventory, `'0.0'` diagonal, `'#,##0'` price), and values.
- Header keystone pin (lines 632–638): `expect(header).toHaveLength(20)` + config labels equal `keystoneLabel(CONFIG_EXPORT_KEYS[i])`. XLSX adds the parity pin: XLSX header labels === `deviceCsvHeader()` byte-exact (U+2033 ″).
- Row-count pin (lines 641–645): `expect(exportDevices({ type: 'all' }).length).toBe(totalDeviceCount())`.
- Warranty parity (lines 555–578 region): frozen-clock MSK boundary — cell label `WARRANTY_STATE_LABELS[warrantyState(until, today)]`.

---

### `next.config.ts` (config — CONDITIONAL)

**Analog:** self (lines 1–8 — currently only `output: "standalone"`). Do NOT preemptively add `serverExternalPackages: ['write-excel-file']` (research anti-pattern: bundling is the better default for a pure-JS dep). Add it ONLY if the D-06 standalone-Docker spike (`next build` + standalone server + curl the route) actually errors, and record the decision.

## Shared Patterns

### requireSession-first route guard
**Source:** `app/api/devices/export/route.ts` line 43; same shape in `app/api/attachments/[attachmentId]/route.ts` lines 48/99
**Apply to:** the new export-xlsx route
```typescript
export async function GET(request: NextRequest) {
  await requireSession()   // FIRST statement — V3 defense-in-depth over proxy default-deny
```

### Pure lib module discipline
**Source:** `lib/device-csv.ts` lines 1–7
**Apply to:** `lib/device-xlsx.ts`
No `server-only`, no `next/*` imports, pure named exports only — vitest imports the file directly (route.ts is not vitest-importable because `lib/auth → next/headers`).

### Single-source column model (keystone)
**Source:** `lib/device-csv.ts` — `deviceCsvHeader()` (93–113), `CONFIG_EXPORT_KEYS` (42–47), `keystoneLabel()` (57–61), `WARRANTY_STATE_LABELS` (67–72); row semantics via `warrantyState()` (`lib/warranty.ts` 49–57)
**Apply to:** `lib/device-xlsx.ts` imports all of it; a second 20-label array is the drift anti-pattern (D-02/D-05)

### One `today` per request
**Source:** `app/api/devices/export/route.ts` lines 64–67 (`displayTodayUtc()` hoisted once)
**Apply to:** the new route; `today` is passed INTO `buildDeviceXlsx(rows, today)` — never called inside the lib loop

### Hardcoded response headers (V5)
**Source:** `lib/csv.ts` lines 54–63 (`csvResponseHeaders`)
**Apply to:** `xlsxResponseHeaders` in `lib/device-xlsx.ts` — MIME and filenames are constants; the only variable is the route's own `isoDate`; nothing echoed from request input

### Binary response body
**Source:** `app/api/attachments/[attachmentId]/route.ts` line 80
**Apply to:** the new route's return — `new Response(new Uint8Array(buffer), { headers })` for the XLSX bytes (CSV returns a string; XLSX returns Buffer → must wrap)

### Test harness (tmp DB + dynamic imports)
**Source:** `tests/csv-export.test.ts` lines 1–39
**Apply to:** `tests/xlsx-export.test.ts` — `mkdtempSync` → `DATABASE_PATH` env → top-level `await import('@/db')` → `applyMigrations(db.$client)` → dynamic lib imports; `afterAll` closes client + rmSync

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none — all files have exact analogs) | | | The write-excel-file call shape itself has no in-codebase precedent (first XLSX producer); the planner must source it from RESEARCH.md «The write-excel-file@4.1.1 API — Exact Reference» (tarball-verified: option names `sheet`/`stickyRowsCount`/`dateFormat`/`columns[].width`, cell props `value`/`type`/`format`/`fontWeight: 'bold'`, `.toBuffer(): Promise<Buffer>`, String-cell format must be `'@'`, Date cells require a format) |

## Metadata

**Analog search scope:** `app/api/devices/`, `app/(app)/devices/`, `lib/`, `components/`, `tests/`, `db/queries/`
**Files scanned:** 10 read in full or targeted (export route, device-csv, csv, filter-bar, command-palette, attachments route, warranty, csv-export test, devices queries, next.config)
**Pattern extraction date:** 2026-09-29
