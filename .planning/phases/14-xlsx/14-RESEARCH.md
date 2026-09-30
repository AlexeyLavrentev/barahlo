# Phase 14: XLSX-выгрузка ведомости - Research

**Researched:** 2026-09-30
**Domain:** Server-side XLSX generation (`write-excel-file@4.1.1`) in a Next.js 16.3.3 GET route handler; typed cells for the existing 20-column ведомость
**Confidence:** HIGH — every API claim in the core section was verified THIS RUN against the pinned 4.1.1 registry tarball source (TypeScript definitions + implementation), not docs, training data, or memory. Milestone research (STACK/PITFALLS/ARCHITECTURE) already settled the library choice and route shape; this document goes one level deeper: exact v4 option/prop names, format-string semantics, and byte-level insertion points.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Минимал — ровно то, что уже зафиксировано в SC фазы: жирная шапка, закреплённая первая строка (freeze pane), ширины колонок по содержимому. Без границ, зебр и прочего украшательства. — Reversibility: reversible — локальные опции вызова библиотеки, один модуль.
- **D-02:** Даты закупки и «Гарантия до» — настоящие Excel-даты (Date cells): Excel сам рисует дд.мм.гггг по локали, сортировка/фильтрация по дате в Excel работают нативно. ISO-текстовый форматтер `isoFileDate` (D-06 фазы 8) остаётся CSV-only — не переносится. Внимание: write-excel-file кидает на Date cell без `format` — формат отображения задать явно. — Reversibility: reversible — маппинг ячеек в одном pure-модуле.
- **D-03:** Числовые колонки — числа: RAM (ГБ), SSD (ГБ), Диагональ (REAL), Стоимость. Стоимость с форматом отображения «разделитель тысяч» (в ячейке 125000, выглядит «125 000»). Серийники/инвентарники — СТРОГО String cells (`type: String` + текстовый формат), никогда Number() — иначе scientific notation и потеря ведущих нулей (рецидив c4b2e2d в слое экспорта). — Reversibility: reversible.
- **D-04:** Библиотека `write-excel-file@4.1.1`, точный pin, server-only (импорт `write-excel-file/node`). exceljs/SheetJS отбракованы research (CVE/стагнация). Одна новая зависимость вехи.
- **D-05:** CSV-хаки в XLSX не переносятся: запятая-десятичная «21,5» (`diagonalCell`), ISO-текст-даты, BOM/«;»/esc() — CSV-format-specific. XLSX шарит МОДЕЛЬ колонок (метки из `deviceCsvHeader()` через keystone, словарь `WARRANTY_STATE_LABELS`), а не рендереры ячеек.
- **D-06:** Спайк standalone-Docker сборки (`next build` + standalone server + curl) — ПЕРВАЯ задача фазы: write-excel-file не в авто-external списке Next (в отличие от better-sqlite3/sharp); escape hatch — `serverExternalPackages`.
- **D-07:** Parity-цепочка CSV повторяется дословно: `requireSession()` первым стейтментом → `searchParamsRecord` → `parseDevicesSearchParams` → `toDeviceListFilters` → `exportDevices` → один `today = displayTodayUtc()` на запрос. Никакого второго парсера/сканирования.
- **D-08:** Поверхности: кнопка «Скачать XLSX» рядом с «Скачать CSV» в filter-bar; строка XLSX в ⌘K-палитре (нативный `<a href>`, как CSV-строка). RFC 5987 dual-filename + nosniff + no-store — новый xlsx-хелпер заголовков по образцу `csvResponseHeaders`.

### Claude's Discretion

- Имя листа (кандидат «Устройства» — однострочный probe при имплементации), лимит 31 символ.
- Имя файла: `устройства-ГГГГ-ММ-ДД.xlsx` + ASCII fallback `devices-YYYY-MM-DD.xlsx` (зеркало CSV).
- Пустой результат (0 строк): файл с шапкой без строк — как ведёт себя CSV.
- Заметки длиннее 32 767 символов (лимит ячейки XLSX): защитный slice.
- Автофильтр не эмулировать (в библиотеке нет, PR #19 не смёржжен) — пользователь жмёт «Данные → Фильтр» сам.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXP-02 | Руководитель может скачать ведомость устройств в XLSX: те же 20 колонок и тот же состав строк, что CSV-ведомость (EXP-01), те же поверхности экспорта; типизированные ячейки — числа числами (Excel сам рендерит «21,5» в RU-локали), серийники/инвентарники строками без научной записи, даты настоящими Excel-датами | Exact v4 API pinned from the 4.1.1 artifact (sheet options, cell objects, format rules, `toBuffer`); 20-column cell-type map below; route/surface insertion points byte-verified; test harness precedent (tests/csv-export.test.ts) carries over 1:1 |
</phase_requirements>

## Summary

Everything structural was settled by milestone research and the CONTEXT decisions; this run resolved the remaining implementation-level unknowns by downloading and reading the actual `write-excel-file@4.1.1` tarball (types + implementation). The open probe «exact v4 option name for sheet name» is CLOSED: it is `sheet` (2nd argument of the single-sheet call). Frozen rows: `stickyRowsCount` (matches the milestone OOXML probe). Column widths: `columns: [{ width }]`. Bold header: `fontWeight: 'bold'` (the literal `'bold'` is the only legal value of the `FontWeight` type). The Date-format throw is confirmed verbatim, and — the sharpest new finding — **`format` on a String cell accepts ONLY `'@'`; any other string throws at generation time**, which makes D-03's «String + текстовый формат» concrete and trivially verifiable in vitest.

The route is a mechanical mirror of `app/api/devices/export/route.ts` (D-07 chain verbatim, one added `await` for `toBuffer()`); the surfaces are two additive edits (a sibling `<a>` in `filter-bar.tsx` — note the CSV link owns `ml-auto`, the XLSX link must not repeat it — and a sibling `Autocomplete.Item` with `render={<a href>}` next to `CSV_ITEM` in `command-palette.tsx`). The binary-body shape (`new Response(new Uint8Array(bytes))`) is already proven in-house by the attachments route.

**Primary recommendation:** Build `lib/device-xlsx.ts` as a pure module exporting `deviceXlsxSheetData(rows, today)` (the vitest-pinned cell matrix), `buildDeviceXlsx(rows, today)` (thin async `writeXlsxFile(...).toBuffer()` wrapper), and `xlsxResponseHeaders(isoDate)` (mirror of `csvResponseHeaders` with the XLSX MIME and `.xlsx` RFC 5987 filenames); run the standalone-Docker spike first (D-06); pin the cell-type matrix + header parity + headers helper in `tests/xlsx-export.test.ts` using the csv-export harness.

## Project Constraints (from CLAUDE.md / AGENTS.md)

- **Next.js docs mandate:** "This is NOT the Next.js you know" — read the relevant guide in `node_modules/next/dist/docs/` before writing route code. Done for this phase: `route.md` (Web Request/Response handlers) and `serverExternalPackages.md` (default external list) verified in the pinned 16.3.3 docs; the relevant findings are in this document. The executing agent must re-read the route-handler guide before implementing.
- **GSD workflow:** repo edits only through GSD commands (this research is a GSD phase artifact).
- **Skill mandate (`vercel-react-best-practices`):** applies as follows — `server-auth-actions` (requireSession first on the new route — already the house pattern), `bundle-analyzable-paths` (import the direct subpath `write-excel-file/node`, never the package root/barrel — this also satisfies D-04 server-only), `server-no-shared-module-state` (`lib/device-xlsx.ts` stays pure functions, no module-level mutable state — same as `device-csv.ts`). No client-side changes at all, so the client rules are moot.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| XLSX bytes generation (typed cells, styling, widths, freeze) | API / Backend (pure `lib/` module) | — | Same pure-lib + thin-route split as CSV (`device-csv.ts` precedent): route.ts imports `lib/auth → next/headers` and is not vitest-importable, so the 20-column layout must live in a pure module to stay positionally pinned |
| Session gate + filter parity chain | API / Backend (route handler) | — | D-07: `requireSession()` first statement, then the exact 5-call chain shared with the page and CSV route |
| Download surfaces (buttons) | Browser / Client (server-rendered `<a>`) | — | Plain anchors — browser-native download UI, no JS, no island (CSV precedent, UI-SPEC Defaults #9/#16) |
| Response headers (MIME, RFC 5987, nosniff, no-store) | API / Backend (pure helper in `lib/`) | — | Hardcoded, never echoed from input (V5 discipline); pure so vitest pins it without a server |
| File date in filename | API / Backend | — | `displayTodayUtc()` hoisted once per request (CR-01 discipline, WR-01) |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `write-excel-file` | **4.1.1 (exact pin, no caret)** | Generate the styled, typed XLSX workbook server-side | Settled by milestone research + probe; legitimacy-gated OK this run (1.21M weekly downloads, published 2026-06-08, no postinstall, repo gitlab.com/catamphetamine/write-excel-file); sole runtime dep `fflate ^0.8.2`; `engines: node>=18`; TypeScript types ship in the package [VERIFIED: npm registry + legitimacy gate + tarball] |
| (existing) `@/lib/device-csv` | — | Header labels (`deviceCsvHeader()`), `WARRANTY_STATE_LABELS`, optionally an extracted `ramUpgradedCell()` | D-05: XLSX shares the column MODEL, not cell renderers — zero hand-copied labels [VERIFIED: source read this run] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (existing) `vitest` | 4.1.11 | Pin the cell matrix, header parity, headers helper | Test tasks — same harness as `tests/csv-export.test.ts` |
| `read-excel-file` (OPTIONAL, devDependency only) | 9.3.10 | Round-trip assertion: open the generated buffer in tests, assert `'0042'` stays a string cell | Only if the planner wants byte-level round-trip proof beyond the matrix pin; same author (catamphetamine), legitimacy-gated OK (2.64M/wk). NOTE: v9 API is beyond training-data familiarity — verify its Node read API at implementation [ASSUMED]. The matrix pin alone is sufficient per the CONTEXT «async wrapper thin» pattern; this is a planner option, not a requirement |

### Alternatives Considered

Settled by milestone research (STACK.md): exceljs (4 unfixed 2026 CVEs incl. 9.4 prototype pollution), SheetJS/xlsx (stale on npm, CE cannot style), excel4node, xlsx-js-style, xlsx-populate, node-xlsx — all rejected. Do not revisit. No query-param `?format=xlsx` variant on the CSV route — sibling route keeps the production CSV path untouched (milestone ARCHITECTURE decision).

**Installation:**

```bash
npm install --save-exact write-excel-file@4.1.1
# nothing else in production deps; optionally: npm install -D read-excel-file@9.3.10
```

## Package Legitimacy Audit

> Gate run this session: `gsd-tools query package-legitimacy check --ecosystem npm write-excel-file read-excel-file`.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| write-excel-file@4.1.1 | npm | ~16 mo (published 2026-06-08) | 1,213,853/wk | gitlab.com/catamphetamine/write-excel-file | OK | Approved — exact pin, server-only |
| read-excel-file@9.3.10 | npm | ~2 mo (published 2026-08-10) | 2,638,225/wk | gitlab.com/catamphetamine/read-excel-file | OK | Approved — optional devDependency (test-only) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
`npm view` cross-check: read-excel-file@9.3.10 exists on npm registry [VERIFIED: npm registry]. No postinstall scripts on either package [VERIFIED: legitimacy gate signals].

## The write-excel-file@4.1.1 API — Exact Reference

All claims in this section are [VERIFIED: write-excel-file@4.1.1 tarball source, read this run] unless marked otherwise. Files cited: `types/*.d.ts`, `modules/xlsx/files/sheet.xml/cell.js`, `modules/xlsx/files/sheet.xml/row.js`, `modules/xlsx/validateSheetName.js`, `modules/xlsx/helpers/convertDateToSerialNumber.js`, `modules/xlsx/files/styles.xml.js`, `modules/xlsx/generateXlsxFileContents.js`, `node/ReturnType.d.ts`, `package.json`.

### Import and call shape

```typescript
import writeXlsxFile from 'write-excel-file/node'   // subpath export: types + ESM + CJS
// single sheet:
const out = writeXlsxFile(sheetData, sheetOptions)   // (Row[], SheetOptions) -> ReturnType
const buffer: Buffer = await out.toBuffer()          // node entry: Promise<Buffer>
```

- `SheetData = Row[]`, `Row = Cell[]`, `Cell = CellObject | string | number | Date | boolean | null | undefined`.
- The sheet options (`sheet`, `columns`, `stickyRowsCount`, `dateFormat`, …) go in the **second argument** of the single-sheet call (`getArguments` routes `arg2` there). The third argument (`Options`) is only `{ fontFamily, fontSize, features }` — a global default font; not needed.
- `ReturnType` (node entry): `toBuffer(): Promise<Buffer>`, `toStream`, `toFile(filePath)`. Use `toBuffer` — streaming has no length information in advance (chunked encoding for zero benefit at hundreds of rows; milestone PITFALLS Pitfall 3).
- Never import the package root, `/browser`, or `/universal` server-side: root resolves the browser build, `/universal` returns Blob-only output (no `toBuffer`) [VERIFIED: milestone PITFALLS + exports map].

### SheetOptions (2nd argument)

| Option | Type | Verified behavior |
|--------|------|-------------------|
| `sheet` | `string` | Sheet name — **the open probe is closed; this is the v4 option name**. Validated by `validateSheetName`: throws on empty, >31 chars, or any of `[]/\:*?`. «Устройства» (10 chars) is safe |
| `columns` | `{ width?: number }[]` | One entry per column; `width` is in character units. Emits `<col min max width customWidth="1"/>` (milestone probe) |
| `stickyRowsCount` | `number` | Frozen rows. `stickyRowsCount: 1` emitted `<pane ySplit="1" topLeftCell="A2" state="frozen"/>` (milestone probe) — this is the freeze-pane mechanism for SC 2 |
| `stickyColumnsCount` | `number` | Frozen columns — not needed (D-01 minimal) |
| `dateFormat` | `string` | Sheet-level default format for Date cells. Applied per-cell in `row.js`: `if (type === Date && !cell.format) format = dateFormat`. **Recommended: set once here instead of repeating per Date cell** (also the milestone PITFALLS recommendation) |
| `showGridLines`, `zoomScale`, `orientation` (`'landscape'`) | — | Available; not needed for D-01 minimal |

### Cell object

| Prop | Type | Notes |
|------|------|-------|
| `value` | `string \| number \| Date \| boolean \| null \| undefined` | `null`/`undefined`/`''` all become an empty cell (skipped entirely unless styled) |
| `type` | `String` \| `Number` \| `Date` \| `Boolean` (constructors) \| `'Formula'` | Optional: inferred from the raw value — string→String, number→Number, boolean→Boolean, `instanceof Date`→Date; anything else → `String(String(value))`. Pass `type: String` explicitly on serials/inventory per D-03 |
| `format` | `string` | See format rules below |
| `fontWeight` | `'bold'` — the literal is the ONLY value of the `FontWeight` type | This is the bold-header mechanism for SC 2 |
| `align` | `'left' \| 'center' \| 'right'` | Note: the prop is **`alignVertical`** (`'top'|'center'|'bottom'`), not «alignVertically» as the CONTEXT sketch wrote — unneeded for D-01 minimal, but plan snippets must use the right name if ever used |
| `wrap`, `height`, `fontSize`, `fontFamily`, `textColor`, `backgroundColor`, `border*`, `columnSpan`, `rowSpan`, `indent`, `textRotation` | — | Available; all out of D-01 scope |

### Format rules (the sharp edges)

1. **String cells: `format: '@'` is the ONLY legal format.** Any other string on a String-typed cell throws: «`format` "X" was specified on a cell of type `String`. The only supported `format` for a cell of type `String` is "@"». This makes D-03's «текстовый формат» exactly `format: '@'` — and it is self-verifying: a wrong format crashes generation loudly.
2. **Date cells REQUIRE a format** — per-cell or the sheet-level `dateFormat`; with neither, generation throws: «No `format` was specified for a `Date` value in a cell in row N column M. Either specify a `format` for this cell or specify a default global one by passing `dateFormat` option to `writeXlsxFile()` function» (confirmed verbatim in `cell.js`; D-02's warning).
3. `format` is otherwise legal only on Date / Number / String / `'Formula'` cells.
4. **Format strings pass through VERBATIM** into custom `<numFmt numFmtId="≥164" formatCode="…"/>` entries in `styles.xml` — the library does no validation or translation. `dd.mm.yyyy`, `#,##0`, `0.0` are emitted as-is; Excel interprets them.
5. Date → serial conversion: `getTime() / 86400000 + 25569` — pure UTC epoch math, no local getters. The project's UTC-midnight stamps (`new Date('yyyy-mm-dd')` from the form) land on the exact calendar-day integer serial on ANY host timezone — the CR-01 bug class is structurally absent.

### Strictness rules (typing correctness is enforced by throws)

- A `type: Number` cell with a non-number value throws («Invalid cell value … Expected a number»); a `type: String` cell with a non-string throws. Stringy numbers crash loudly — good.
- The dangerous direction is silent: numbers that SHOULD be strings (serials/inventory) would be written as numbers without error and mangle in Excel (scientific notation, stripped leading zeros). DB `serial_number`/`inventory_number` are TEXT [VERIFIED: db/schema.ts:73,77] — pass them through verbatim, never `Number()`/`+`-coerce. Pinned-test the cell matrix.
- `type: 'Formula'` exists — never use it (milestone PITFALLS Pitfall 6): no cell of the ведомость may be Formula; pin `type ∈ {String, Number, Date}` in vitest.
- Legacy guard: an array-of-arrays whose inner rows contain arrays throws «In order to write multiple sheets, pass an array of sheet objects». Our cells are objects/primitives, so a correct builder never trips this — but a mis-mapped builder (row pushed where a cell belongs) surfaces as exactly this error.

## Cell-Type Map (20 columns → typed cells)

The concrete mapping the builder task implements, in `deviceCsvHeader()` order. Header row: `deviceCsvHeader().map(label => ({ value: label, fontWeight: 'bold' as const }))` — String inferred, bold per D-01. Sheet-level: `{ sheet: 'Устройства', stickyRowsCount: 1, dateFormat: 'dd.mm.yyyy', columns: [...20 widths...] }`.

| # | Column (label source) | Cell | Notes |
|---|----------------------|------|-------|
| 1 | Тип | `deviceTypeName(r.typeKey)` raw string | String inferred |
| 2 | Модель | `r.model` raw | String |
| 3 | Серийный номер | `{ value: r.serialNumber, type: String, format: '@' }` | D-03; nullable TEXT → null = empty cell |
| 4 | Инвентарный номер | `{ value: r.inventoryNumber, type: String, format: '@' }` | D-03 — leading zeros, no `E+15` |
| 5 | Статус | `deviceStatusLabel(r.status)` raw | String |
| 6 | Держатель | `r.holder` raw | String |
| 7 | Отдел | `r.departmentName` raw | String |
| 8 | RAM, ГБ | `r.ramGb` raw number | Number inferred (integer) |
| 9 | RAM апгрейдена | `'да' \| 'нет' \| null` | Same logic as CSV — extract `ramUpgradedCell()` in device-csv.ts and import (milestone ARCHITECTURE anti-pattern 3); or inline once more if the planner prefers zero production refactor |
| 10 | SSD, ГБ | `r.ssdGb` raw number | Number (integer) |
| 11 | Диагональ, ″ | `{ value: r.screenDiagonal, type: Number, format: '0.0' }` | Real number; RU-Excel renders «21,5» from `21.5` — `diagonalCell()` stays CSV-only (D-05). Integer diagonals render fine too |
| 12 | Тип матрицы | `r.panelType` raw | String |
| 13 | Количество портов | `r.portCount` raw number | Number (integer) |
| 14 | Вид | `r.peripheralKind` raw | String |
| 15 | Дата закупки | `r.purchaseDate` (Date \| null, sheet `dateFormat` covers format) | REAL Date cell; pass the DB Date verbatim — never reconstruct; null → empty cell |
| 16 | Стоимость | `{ value: r.purchasePrice, type: Number, format: '#,##0' }` | D-03 thousands grouping; RU-Excel renders «125 000» |
| 17 | Поставщик | `r.supplier` raw | String |
| 18 | Гарантия до | `r.warrantyUntil` (Date \| null, sheet `dateFormat`) | REAL Date cell — sortable natively (SC 3) |
| 19 | Статус гарантии | `WARRANTY_STATE_LABELS[warrantyState(r.warrantyUntil, today)]` | WR-01 parity with site color by construction; `today` injected once per request |
| 20 | Заметки | `r.notes === null ? null : r.notes.slice(0, 32767)` | Defensive 32 767-char slice (CONTEXT discretion); no esc() — XLSX string cells are inert (D-05, milestone PITFALLS Pitfall 6) |

Display-format note: the numFmt codes reaching Excel are [VERIFIED] passthrough; how RU-Excel renders them («21,5», «125 000», «05.01.2026») is standard Excel viewer-locale behavior — `0.0` uses the locale decimal comma, `#,##0` the locale grouping separator (space in RU), `dd.mm.yyyy` draws literal dots in any locale [ASSUMED — standard Excel semantics; this is exactly what UAT in real RU Excel (SC 2/3) gates]. `dd.mm.yyyy` is preferred over `dd/mm/yyyy` because the dots are literal characters, deterministic even if a viewer's locale date separator differs.

## Architecture Patterns

### System Architecture Diagram

```
«Скачать XLSX» <a> (filter-bar)          «Скачать ведомость XLSX» (⌘K palette row)
        │ native <a href>                          │ native <a href> via render={}
        └───────────────┬──────────────────────────┘
                        ▼
   GET /api/devices/export-xlsx?…(buildDevicesQuery output)
                        │
        requireSession()                       ← FIRST statement (V3; 401 when logged out)
        searchParamsRecord → parseDevicesSearchParams → toDeviceListFilters
                        │   (the ONE parser + ONE strip — D-07, no second parse path)
                        ▼
        exportDevices({ type, filters })       ← full filtered scan, no limit/offset
                        │
        today = displayTodayUtc()              ← once per request (CR-01/WR-01)
                        ▼
        buildDeviceXlsx(rows, today)           ← pure lib/device-xlsx.ts
           deviceXlsxSheetData(rows, today)    ← pinned cell matrix (typed cells)
           writeXlsxFile([boldHeader, ...rows], { sheet, stickyRowsCount, dateFormat, columns })
           .toBuffer()                         ← Promise<Buffer>
                        ▼
        new Response(new Uint8Array(buffer), { headers: xlsxResponseHeaders(isoDate) })
           Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
           Content-Disposition: RFC 5987 dual filename (.xlsx) + nosniff + no-store
                        ▼
        browser-native download → opens in RU-Excel without repair dialog (SC 2)
```

### Recommended Project Structure

```
lib/
├── device-csv.ts              # EXISTS — header labels / warranty dictionary become shared imports
├── device-xlsx.ts             # NEW — deviceXlsxSheetData + buildDeviceXlsx + xlsxResponseHeaders
app/api/devices/
├── export/route.ts            # EXISTS (CSV) — untouched
├── export-xlsx/route.ts       # NEW — thin composer mirroring export/route.ts
app/(app)/devices/
├── filter-bar.tsx             # EDIT — one more <a> sibling after «Скачать CSV»
components/
├── command-palette.tsx        # EDIT — one more native-anchor Autocomplete.Item after CSV_ITEM row
tests/
├── xlsx-export.test.ts        # NEW — mirror of csv-export.test.ts harness
```

### Pattern 1: Pure lib file-builder + thin route composer (the device-csv pattern)

**What:** the cell matrix is a pure, framework-free named export; the write-excel-file call is a one-line async wrapper; the route only composes session + parse + query + builder + headers.
**When to use:** every new file-export surface.
**Why:** `route.ts` imports `lib/auth → next/headers` and is not vitest-importable (this is also why `lib/device-csv.ts` deliberately does NOT import `server-only` — only `lib/auth.ts`/`lib/session.ts` do [VERIFIED: grep this run]; `lib/device-xlsx.ts` must likewise stay free of `server-only` and `next/*` imports).

```typescript
// lib/device-xlsx.ts — pure named exports only (lib/device-csv.ts discipline).
// NO 'server-only', NO next/* imports — vitest must import this file directly.
import writeXlsxFile from 'write-excel-file/node'
import { deviceCsvHeader, WARRANTY_STATE_LABELS } from '@/lib/device-csv'
import { warrantyState } from '@/lib/warranty'
import type { DeviceExportRow } from '@/db/queries/devices'

// ── THE PINNED CORE ── vitest asserts this matrix positionally (20 cells,
// exact types). See the Cell-Type Map table for every column.
export function deviceXlsxSheetData(rows: DeviceExportRow[], today: Date) { /* … */ }

// Bold header = deviceCsvHeader() verbatim (D-02/D-05: one keystone edit
// changes the form AND both files; a pinned parity test asserts
// xlsxHeaderLabels === deviceCsvHeader()).
export function deviceXlsxHeaderCells() {
  return deviceCsvHeader().map((label) => ({ value: label, fontWeight: 'bold' as const }))
}

export async function buildDeviceXlsx(rows: DeviceExportRow[], today: Date): Promise<Buffer> {
  const out = writeXlsxFile(
    [deviceXlsxHeaderCells(), ...deviceXlsxSheetData(rows, today)],
    {
      sheet: 'Устройства',        // VERIFIED option name; validateSheetName: ≤31 chars, no []/\:*?
      stickyRowsCount: 1,         // freeze first row (SC 2)
      dateFormat: 'dd.mm.yyyy',   // sheet-level Date format (D-02) — set once
      columns: XLSX_COLUMN_WIDTHS // 20 entries, character units (D-01)
    },
  )
  return out.toBuffer()
}

// Mirror of csvResponseHeaders (lib/csv.ts): hardcoded MIME (never echoed — V5),
// RFC 5987 dual filename, nosniff, no-store. The encoding form transfers
// unchanged from CSV — only extension and MIME differ (D-08).
export function xlsxResponseHeaders(isoDate: string): Record<string, string> { /* … */ }
```

```typescript
// app/api/devices/export-xlsx/route.ts — thin composer (D-07 chain verbatim).
// Header comment mirrors the CSV route's zero-drift contract (WR-01).
import type { NextRequest } from 'next/server'
import { requireSession } from '@/lib/auth'
import { exportDevices } from '@/db/queries/devices'
import { displayTodayUtc } from '@/lib/warranty'
import { buildDeviceXlsx, xlsxResponseHeaders } from '@/lib/device-xlsx'
import { searchParamsRecord } from '@/lib/search-params-record'
import { parseDevicesSearchParams, toDeviceListFilters } from '@/app/(app)/devices/query-params'

export async function GET(request: NextRequest) {
  await requireSession()                                    // FIRST statement (V3)
  const sp = searchParamsRecord(request.nextUrl.searchParams)
  const filters = parseDevicesSearchParams(sp)              // the ONE parser
  const listFilters = toDeviceListFilters(filters)          // the ONE strip
  const rows = exportDevices({ type: filters.type, filters: listFilters })
  const today = displayTodayUtc()                           // once per request (WR-01)
  const body = await buildDeviceXlsx(rows, today)           // the only new await
  const isoDate = new Date().toISOString().slice(0, 10)
  return new Response(new Uint8Array(body), { headers: xlsxResponseHeaders(isoDate) })
}
```

The `new Response(new Uint8Array(bytes))` binary-body shape is already proven in-house — the attachments route serves photo bytes exactly this way [VERIFIED: `app/api/attachments/[attachmentId]/route.ts:80`].

### Pattern 2: Surfaces — two additive sibling edits

**filter-bar.tsx** — the CSV anchor (lines 44–49) carries `ml-auto` (it pushes itself to the bar's end). The XLSX anchor goes AFTER it **without** `ml-auto` (a second `ml-auto` would re-split the free space); copy the rest of the class string verbatim (secondary button recipe, h-10, press rule):

```tsx
<a href={`/api/devices/export-xlsx${buildDevicesQuery(filters)}`} className="inline-flex h-10 shrink-0 …same recipe minus ml-auto…">Скачать XLSX</a>
```

**command-palette.tsx** — the CSV row is `const CSV_ITEM = { kind: 'csv' } as const` (line 86) rendered as an `Autocomplete.Item` with `render={<a href="/api/devices/export" />}` and `onClick={() => setOpen(false)}` (lines 456–465); keyboard Enter works because Base UI dispatches a real DOM click on the native anchor (phase-11 decision). The XLSX row mirrors it verbatim: `const XLSX_ITEM = { kind: 'xlsx' } as const`, `render={<a href="/api/devices/export-xlsx" />}`, label «Скачать ведомость XLSX», same classes, placed immediately after the CSV row (both stay the last keyboard stops). Note the palette rows carry NO query string — palette export = whole park, exactly like CSV today.

### Anti-Patterns to Avoid

- **A second 20-label array** in the XLSX builder — import `deviceCsvHeader()`; parallel dictionaries drift (D-02).
- **Porting CSV renderers** (`diagonalCell`, `isoFileDate`, `esc`, BOM, «;») into the XLSX builder — typed cells make them wrong, not redundant (D-05; milestone PITFALLS Pitfalls 2/6).
- **Numeric coercion of serials/inventory** (`Number(...)`, `+`) anywhere between the query row and the cell array — silent scientific-notation corruption (D-03, c4b2e2d recurrence in the export layer).
- **`type: 'Formula'` anywhere** — turns free text into executable formulas; pin `type ∈ {String, Number, Date}`.
- **`serverExternalPackages: ['write-excel-file']` preemptively** — bundling is the better default for a pure-JS dep; add only if the standalone spike actually errors, and record the decision (milestone debt table).
- **Streaming the response** — no length info in advance; `toBuffer` + `Content-Length` for free at this scale.
- **Reusing `csvResponseHeaders`** for the XLSX route — `text/csv` MIME on ZIP bytes = Excel repair dialog; the browser may name the file `*.csv` (milestone PITFALLS Pitfall 3).
- **A wrong-row legacy error:** passing a builder bug (row where a cell belongs) surfaces as the «write multiple sheets» throw — read the error literally before hunting bundle causes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| XLSX/OOXML zip generation | Hand-rolled zip/XML writer (the lib/csv.ts temptation does NOT transfer) | `write-excel-file@4.1.1` | OOXML is a multi-part zipped XML format with styles/sharedStrings/panes machinery; hand-rolling is a milestone-scale project, and the library is probe-verified against the exact pinned version |
| Filter parity for the export | A second parser or param reshaping | The exact 5-call chain (D-07) | Any second parse path drifts from the page view (phase-11 duplicate-`?q=` bug class) |
| Filename encoding | Manual Content-Disposition crafting | Mirror `csvResponseHeaders`' RFC 5987 dual-filename form | Proven on Windows Chrome/Edge by the CSV route; only extension + MIME change |
| RU decimal/thousand/date display | String formatting «21,5»/«125 000» | Typed cells + numFmt codes | The cell TYPE is the localization; viewer-locale rendering is native and SUM/sort work (SC 3) |
| Freeze panes / column widths | Post-processing the XML | `stickyRowsCount` / `columns[].width` | Both are first-class v4 sheet options, probe-verified in the emitted OOXML |

**Key insight:** the CSV hand-rolling decision (T-05-SC) was about TEXT assembly where the injection guard had to exist anyway. XLSX is a binary container format — the exact opposite case; here the library is the supply-chain-minimal choice (1 dep, types included, no CVE history).

## Common Pitfalls

Milestone PITFALLS.md Pitfalls 1–6 are all phase-14 pitfalls and carry over verbatim (serials-as-strings, no-CSV-hack-porting, Response shape/MIME, standalone spike first, header drift + sheet name, no esc()/no Formula). Phase-specific deltas from this run's artifact verification:

### Pitfall 14.1: `format` on a String cell — only `'@'` is legal
**What goes wrong:** giving a String cell any display format other than `'@'` (e.g. copying a date format) throws at generation time.
**Why it happens:** the library validates format/type pairing in `row.js` and String has exactly one legal format.
**How to avoid:** serials/inventory = `{ value, type: String, format: '@' }` — nothing else.
**Warning signs:** «The only supported `format` for a cell of type `String` is "@"» on first dev run — means a cell object carries the wrong format.

### Pitfall 14.2: Date cell format is mandatory — per-cell OR sheet-level, never neither
**What goes wrong:** a Date cell with no format anywhere throws mid-generation («No `format` was specified for a `Date` value…»).
**How to avoid:** set `dateFormat: 'dd.mm.yyyy'` once at sheet level (recommended — one place, covers both date columns); per-cell `format` overrides if ever needed.
**Warning signs:** the throw names row/column — cross-check against the Cell-Type Map rows 15/18.

### Pitfall 14.3: Silent type inference can un-Type your cells
**What goes wrong:** relying on inference, a `null`-safe rewrite like `value: r.ramGb ?? ''` turns a Number column into an empty **String** cell (`''` → null → empty cell, fine) but `value: String(r.ramGb)` produces a left-aligned text number that breaks SUM/sort.
**How to avoid:** pass DB values verbatim; handle null by passing null, not by coercing to strings. Pin the matrix in vitest (types are asserted per column).
**Warning signs:** left-aligned number columns, SUM not working in UAT.

### Pitfall 14.4: The palette row must keep native-anchor semantics
**What goes wrong:** rendering the XLSX palette row as a button with `router.push` or `window.open` breaks the keyboard-download contract Enter-on-highlighted-item relies on.
**Why it happens:** `Autocomplete.Item` defaults to acting, not navigating.
**How to avoid:** copy the CSV row shape exactly — `render={<a href="/api/devices/export-xlsx" />}` + `onClick={() => setOpen(false)}` (phase-11 verified behavior: Enter dispatches a real DOM click on the anchor).
**Warning signs:** palette row navigates instead of downloading; download blocked as popup.

### Pitfall 14.5: `ml-auto` duplication in filter-bar
**What goes wrong:** the XLSX anchor copying the CSV anchor's full class list (including `ml-auto`) re-distributes the bar's free space, visually detaching the CSV button.
**How to avoid:** XLSX anchor = CSV classes minus `ml-auto`, placed after the CSV anchor.
**Warning signs:** two gaps in the filter bar; buttons not flush right.

## Code Examples

The two load-bearing code blocks (builder + route) are inline in Pattern 1 above; surfaces in Pattern 2. One more: the response-header helper contract to mirror.

```typescript
// lib/csv.ts:54-63 — the form to mirror for xlsxResponseHeaders (D-08):
// 'Content-Type': 'text/csv; charset=utf-8'                    → XLSX MIME, no charset suffix
//   = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
// 'Content-Disposition': attachment; filename="devices-ISO.csv";
//   filename*=UTF-8''…  (.csv → .xlsx; «устройства-ГГГГ-ММ-ДД.xlsx» encoded)
// 'X-Content-Type-Options': 'nosniff'                          → unchanged
// 'Cache-Control': 'no-store'                                  → unchanged
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| write-excel-file v3 callback/stream API | v4: `writeExcelFile(data, opts)` returns `{ toBuffer, toStream, toFile }` | 4.x line (2026) | `toBuffer()` maps directly onto Web `Response`; exact pin 4.1.1 avoids caret drift across the 3.x→4.x boundary |
| exceljs as the default styled-XLSX choice | Avoid — 4 unfixed 2026 CVEs (one CRITICAL 9.4), last stable 2023 | NVD, 2026 | write-excel-file is the maintained minimal choice |
| SheetJS on npm | npm copy frozen at 0.18.5; real releases on vendor CDN | since 2022 | Unfixable-from-npm CVEs — disqualified |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | RU-Excel renders the passthrough numFmt codes as expected: `0.0` → «21,5», `#,##0` → «125 000» (space grouping), `dd.mm.yyyy` → dotted dates | Cell-Type Map | Display-only; sort/SUM still work because underlying values are real numbers/dates. Gated by UAT in real RU Excel (SC 2/3) — cosmetic fix = change one format string |
| A2 | `read-excel-file@9.x` Node API suits a round-trip test if adopted | Standard Stack | Test-only dependency; if API differs, drop the round-trip test — the matrix pin alone satisfies the discipline |
| A3 | Next 16 runtime accepts a `Uint8Array` body for a GET handler | Architecture Patterns | Already proven in-house by the attachments route serving photo bytes — risk ≈ 0 |

## Open Questions

1. **Standalone spike outcome (D-06, first task)** — does `next build` bundle write-excel-file cleanly into the standalone server, or is `serverExternalPackages: ['write-excel-file']` needed?
   - What we know: pure JS + fflate, not on the default external list; `next.config.ts` currently has only `{ output: "standalone" }` [VERIFIED].
   - Recommendation: run the spike exactly as D-06 scopes it; only add the config entry on an actual error, and record the decision.
2. **read-excel-file round-trip test — adopt or not** (planner decision). The sheetData matrix pin + header parity + headers pin already satisfy the csv-export discipline; the round-trip adds byte-level confidence for the serial/inventory string cells at the cost of a devDependency. CONTEXT's «async wrapper thin» pattern suggests matrix-only is sufficient.
3. **Sheet name final choice** — «Устройства» (10 chars, safe) vs «Ведомость» (9 chars, safe). Claude's discretion per CONTEXT; option name `sheet` now verified, so no probe is needed — either constant just works.
4. **Column width values** — sensible per-column character widths are an implementation/UAT eyeball matter (D-01 «по содержимому»); suggest starting values in the plan (e.g. 12–30 chars per column) and tuning during UAT.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | route runtime, vitest, spike | ✓ | 22.23.0 (dev machine); container = node:24-slim (Phase 1 image) | — (engines ≥18 satisfied) |
| npm | install write-excel-file@4.1.1 | ✓ | 10.9.8 | — |
| vitest | tests | ✓ | 4.1.11 (devDep, `vitest.config.ts` present) | — |
| Docker | standalone spike (D-06) | ✓ | 29.6.1 (Dockerfile + compose.yml present) | `next build` + `node .next/standalone/server.js` + curl without compose if needed |
| write-excel-file@4.1.1 | the feature | To install (tarball fetched from registry this run — registry reachable) | 4.1.1 | none needed |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.11 (node environment; `@` alias → repo root; `server-only` stubbed via `tests/stubs/server-only.ts` — why lib modules must stay server-only-free to be importable) |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `npx vitest run tests/xlsx-export.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXP-02 | Header parity: XLSX header labels === `deviceCsvHeader()` (20, keystone-derived, byte-exact U+2033 ″) | unit | `npx vitest run tests/xlsx-export.test.ts` | ❌ Wave 0 (created with the lib task, TDD RED→GREEN like phase 8 c7e095a→51bb5c9) |
| EXP-02 | Typed cells: diagonal/ram/ssd/price are Number cells (diagonal has format `0.0`), serial/inventory are String + `'@'`, dates are Date cells; no `type: 'Formula'` | unit | same | ❌ Wave 0 |
| EXP-02 | Warranty label parity: cell maps `WARRANTY_STATE_LABELS[warrantyState(until, today)]`; MSK 00:00–03:00 frozen-clock boundary | unit | same (boundary case mirrors warranty/movement-schema patterns) | ❌ Wave 0 |
| EXP-02 | `xlsxResponseHeaders`: XLSX MIME hardcoded, RFC 5987 dual filename `.xlsx`, nosniff, no-store | unit | same | ❌ Wave 0 |
| EXP-02 | Row-count parity: `exportDevices({type:'all'}).length === totalDeviceCount()` (no filters = whole park) | unit | same (reuses csv-export harness: DATABASE_PATH before `@/db` import, `applyMigrations`, dynamic imports) | ❌ Wave 0 |
| EXP-02 | File downloads with session, 401 without; Content-Length/no-store in devtools; opens in real RU-Excel without repair dialog; «21,5»/leading zeros/dates correct; Cyrillic filename on Windows Chrome/Edge; CSV link unchanged | manual UAT + spike | D-06 spike: `next build` + `node .next/standalone/server.js` + `curl -i` the route; UAT per milestone «Looks Done But Isn't» checklist (real RU Excel, Numbers, Google Sheets) | manual-only — justified: SC 2/3 require a real RU-Excel viewer and Windows browser behavior no in-repo runner can emulate |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/xlsx-export.test.ts`
- **Per wave merge:** `npx vitest run` (full suite; 341+ tests currently green)
- **Phase gate:** full suite green + spike artifact (curl output) + UAT checklist before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/xlsx-export.test.ts` — covers all EXP-02 unit rows above; harness copy from `tests/csv-export.test.ts` (tmpdir DATABASE_PATH → dynamic imports → `applyMigrations`)
- [ ] Optional: `read-excel-file` devDependency IF the planner adopts the round-trip test (not required)
- [ ] Framework install: none needed (vitest present)

## Security Domain

`security_enforcement` is not disabled in `.planning/config.json` → included. This phase adds one authenticated read surface exporting personal data (holder names ride along in the ведомость).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (reuses session) | existing jose session; `requireSession()` |
| V3 Session Management | no changes | existing |
| V4 Access Control | **yes** | `await requireSession()` as the FIRST statement of the new handler — V3 defense-in-depth over the proxy default-deny perimeter (T-03-01 discipline; logged-out tab gets 401 — SC 4) |
| V5 Input Validation | **yes** | No new parser: the shared `parseDevicesSearchParams` degrades every invalid value to inactive sentinels; response headers are hardcoded constants — nothing echoed from input (the CSV route's V5 shape, mirrored) |
| V6 Cryptography | no | — |
| V14/Config | no changes | `nosniff` + `no-store` on a personal-data download; `serverExternalPackages` only on proven spike failure (untraced-dep hygiene) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Formula injection via free-text cells (CWE-1236) | Tampering/Execution | Structurally absent: no `type: 'Formula'` cells (pinned in vitest); XLSX String cells are shared strings, inert on open. The `esc()` guard stays CSV-only (D-05) — porting it would VANDALIZE the XLSX with tab-prefixed cells |
| MIME confusion / header injection | Tampering | Hardcoded `Content-Type` + constant RFC 5987 filename built only from the injected ISO date (mirrors `csvResponseHeaders`) |
| Data exposure without session | Information Disclosure | `requireSession()` first statement (grep-verified pattern per route); `no-store` prevents caching of bulk personal data |
| Supply chain | Tampering | Single pinned dependency, legitimacy-gated OK, no postinstall scripts, 1.2M weekly downloads, active maintainer |

## Sources

### Primary (HIGH confidence)

- **write-excel-file@4.1.1 registry tarball** — downloaded and read this run: `types/SheetOptions.d.ts`, `types/CellStyleProperties.d.ts`, `types/SheetData.d.ts`, `types/Options.d.ts`, `types/features/stickyRowsOrColumns.d.ts`, `node/index.d.ts`, `node/ReturnType.d.ts`, `modules/xlsx/files/sheet.xml/cell.js`, `modules/xlsx/files/sheet.xml/row.js`, `modules/xlsx/validateSheetName.js`, `modules/xlsx/helpers/convertDateToSerialNumber.js`, `modules/xlsx/files/styles.xml.js`, `modules/xlsx/generateXlsxFileContents.js`, `package.json` (exports map, engines, deps)
- **npm registry** — write-excel-file 4.1.1 publish date/downloads/deps; read-excel-file 9.3.10 (`npm view`); legitimacy gate verdicts
- **Pinned Next.js 16.3.3 docs** — `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (Web Request/Response handlers); `…/05-config/01-next-config-js/serverExternalPackages.md` (default list incl. better-sqlite3/sharp; opt-in syntax)
- **Project source (read this run)** — `app/api/devices/export/route.ts`, `lib/device-csv.ts`, `lib/csv.ts`, `app/(app)/devices/filter-bar.tsx`, `components/command-palette.tsx`, `next.config.ts`, `package.json`, `vitest.config.ts`, `tests/csv-export.test.ts`, `db/schema.ts`, `app/api/attachments/[attachmentId]/route.ts`
- **Milestone research** — `.planning/research/STACK.md`, `PITFALLS.md`, `ARCHITECTURE.md` (probe evidence: OOXML freeze pane, column widths, numeric cells, Cyrillic sharedStrings)

### Secondary (MEDIUM confidence)

- Excel number-format rendering semantics (locale decimal comma, grouping separator, literal dots in `dd.mm.yyyy`) — standard Excel behavior, cross-checked against the milestone research; not independently re-verified this run (A1)

### Tertiary (LOW confidence)

- read-excel-file@9.x Node API details (A2 — only relevant if the optional round-trip test is adopted)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — library choice settled by milestone probe; version/legitimacy re-verified this run
- write-excel-file API: HIGH — every option/prop/rule read from the pinned artifact's types and implementation
- Architecture: HIGH — insertion points byte-verified in the actual production files; route shape proven by the CSV route + attachments route
- Pitfalls: HIGH for library/typing edges (source-read); MEDIUM only for viewer-locale display rendering (A1, UAT-gated by design)

**Research date:** 2026-09-30
**Valid until:** 2026-10-30 (stable domain; write-excel-file pinned exact — no drift risk)
