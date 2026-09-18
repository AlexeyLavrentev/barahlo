# Phase 8: CSV-ведомость полного контекста - Research

**Researched:** 2026-09-16
**Domain:** Server-side CSV export extension (Next.js App Router route handler + Drizzle/SQLite query layer + pure lib modules)
**Confidence:** HIGH (all extension points verified in codebase; one MEDIUM-confidence external finding on RU-Excel decimal parsing)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Конфиг-колонки**
- **D-01:** 4 новые конфиг-колонки стоят конфиг-блоком одним куском сразу после «SSD, ГБ». Итоговый порядок колонок: Тип · Модель · Серийный номер · Инвентарный номер · Статус · Держатель · Отдел · RAM, ГБ · RAM апгрейдена · SSD, ГБ · **Диагональ, ″ · Тип матрицы · Количество портов · Вид** · Дата закупки · Стоимость · Поставщик · Гарантия до · Статус гарантии · Заметки. Вся конфигурация устройства — один неразрывный блок.
- **D-02:** Имена CSV-колонок = метки кейстоуна `lib/device-schema.ts` дословно, включая значок дюйма («Диагональ, ″» как на форме). Параллельный CSV-словарь меток не заводится — одна правка в `PER_TYPE_FIELDS` меняет и форму, и файл. — **Reversibility:** reversible — альтернатива «свои короткие CSV-имена» отклонена как второй источник правды.

**Статус гарантии**
- **D-03:** Словарь состояний: **«Действует / Истекает / Истекла / Без гарантии»** ← `warrantyState()` (ok / warn / expired / none). Без числа дней в тексте — граница видна датой в соседней колонке.
- **D-04:** «Без гарантии» (warrantyUntil null) — текст «Без гарантии», не пустая ячейка: статус-колонка отвечает на вопрос в каждой строке.
- **D-05:** Колонка «Статус гарантии» стоит сразу после «Гарантия до» — дата и её вердикт рядом (пару «Дата закупки … Гарантия до» не разрывать).

**Даты**
- **D-06:** «Дата закупки» и «Гарантия до» в файле → ISO `yyyy-mm-dd`. Сортировка в Excel локале-независима. Форматтер один на файл; сайт не трогается (`formatWarrantyDate` остаётся dd.mm.yyyy).

### Claude's Discretion
- `exportDevices` расширяет SELECT четырьмя полями (`screenDiagonal`, `panelType`, `portCount`, `peripheralKind` — колонки уже есть в таблице, миграций ноль)
- Разреженность: у чужих типов ячейки пустые (RAM/SSD уже так; «Вид» заполняется только у периферии и т.д.)
- Размещение файлового ISO-форматтера и словаря статуса (рядом с роутом экспорта / в lib — но словарь статуса один)
- Тест-матрица (vitest, без новых зависимостей): sparse-заполнение по всем 4 типам; parity статус↔`warrantyState`↔фильтр на границах (0 / 60 / 61 день, null); ISO-формат дат; новые ячейки под `esc()`-гвардом
- Имя файла, `csvResponseHeaders`, ссылка в фильтр-баре — не меняются

### Deferred Ideas (OUT OF SCOPE)
- CSV-выгрузка справочника сотрудников — не запрошена
- Пункт «Скачать ведомость» в ⌘K-палитре — Phase 11 (мягкая зависимость 8→11); контракт роута не менять
- Короткие CSV-имена конфиг-колонок («Матрица», «Порты») — отклонены (D-02)
</user_constraints>

## Project Constraints (from CLAUDE.md / AGENTS.md)

- **AGENTS.md:** this Next.js version may differ from training data — read `node_modules/next/dist/docs/` before writing Next-specific code. Phase 8 touches NO Next-specific API surface (route handler shape, imports and `requireSession`-first pattern are copied verbatim from the existing file), so no new Next knowledge is required — do not refactor what already works.
- **REQUIREMENTS §Out of Scope:** любые новые npm-зависимости запрещены (lib/csv.ts хенд-ролл — T-05-SC; тест `no CSV serialization dependency` в `tests/csv-export.test.ts` уронится при установке csv-библиотеки).
- **Zero UI, zero schema migrations** (roadmap: наименьший diff вехи).
- **GSD workflow enforcement:** file edits only through GSD execution flow.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXP-01 | Оператор выгружает CSV-ведомость полного контекста: 4 типизированных конфиг-поля типа + текстовый статус гарантии; выгрузка без фильтров = весь парк | Extension points verified: `route.ts` HEADER+cells, `exportDevices` SELECT + `DeviceExportRow`, `lib/warranty.ts` `warrantyState()`, `PER_TYPE_FIELDS` labels. Sparse data is structural (createDevice writes `?? null`). Full-park property is structural (exportDevices = full scan via shared `deviceWhere`); research supplies the pinning test recipe. |
</phase_requirements>

## Summary

Phase 8 is a small, fully-verified extension of the existing CSV export. Every extension point named in CONTEXT.md exists exactly as described: `app/api/devices/export/route.ts` (HEADER array + cells mapping), `db/queries/devices.ts` (`exportDevices` SELECT + `DeviceExportRow` type), `lib/warranty.ts` (`warrantyState`), `lib/device-schema.ts` (`PER_TYPE_FIELDS` labels). The work is: add 4 fields to the SELECT and the row type, insert 5 new cells (4 config + 1 status text) at D-01/D-05 positions, add one file-level ISO date formatter (D-06), one status dictionary (D-03/D-04), and extend `tests/csv-export.test.ts`. The esc-guard, BOM/«;»/CRLF, response headers, requireSession-first and the zero-drift query contract are all existing code that must simply not be touched.

Two findings go beyond the trivial diff. First, the «Диагональ, ″» column introduces the file's FIRST fractional number (`screen_diagonal` is SQLite REAL, form step 0.1 → values like 21.5/23.8). In comma-decimal locales — Russian included, which is precisely why the file already uses «;» — Excel opening a CSV interprets dot-decimal values like `21.5` as DATES (21 May) [MEDIUM confidence, cross-checked across StackOverflow/Reddit/Datawrapper/UiPath]. A comma-decimal cell (`21,5`) is the mitigation consistent with the file's RU-first contract; CONTEXT.md does not lock this, so it is flagged as an Open Question for the planner. Second, D-02's sentence «одна правка в `PER_TYPE_FIELDS` меняет и форму, и файл» is only literally true if the HEADER labels are derived from the keystone programmatically (or pinned by a parity test) — a literal copy in HEADER would silently drift.

SC 2 (full park / filtered parity) is already structural — `exportDevices` composes the same `deviceWhere` as `listDevices` with no limit/offset — so the phase only pins it with a row-count test. SC 4 (auth) is already the first statement of the route; nothing to build, only to not break.

**Primary recommendation:** One plan, one wave: extend `exportDevices` + `DeviceExportRow` (4 fields), rebuild HEADER (20 columns, config block after «SSD, ГБ», «Статус гарантии» after «Гарантия до», labels derived from `PER_TYPE_FIELDS`), add pure `isoFileDate` + status dictionary in a small lib module, map cells with sparse pass-through, extend `tests/csv-export.test.ts` (header/sparse/injection/ISO/status-parity/row-count), and resolve the diagonal decimal representation (recommend comma-decimal) before writing cells.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Config fields in export rows | Database / Storage (Drizzle SELECT) | — | Columns already exist; `exportDevices` just widens its select — zero migration |
| CSV column layout + cell values | API / Backend (route handler) | — | HEADER + cells mapping live in the route; file-layout concern, no UI |
| Warranty status text | API / Backend (pure lib module) | — | `warrantyState()` is the single calculator; the text dictionary wraps its 4 states |
| Excel-open correctness (BOM/«;»/ISO/decimal) | API / Backend (`lib/csv.ts` + cell formatting) | — | File-format concern; `buildCsv`/`esc` untouched, new cells pass through automatically |
| Access control | API / Backend (`requireSession()` first) | proxy default-deny perimeter | Existing code (SC 4) — must remain the first statement; do not touch |
| «Скачать CSV» link / filename | — | — | Out of scope (CONTEXT: не меняются) |

## Standard Stack

### Core (all already in the repo — ZERO new installs)

| Library / Module | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router route handler | 16.3.3 (installed) | `/api/devices/export` GET | Existing route; extend in place [VERIFIED: codebase] |
| Drizzle ORM + better-sqlite3 | 0.45.x / 13.x (installed) | Widen `exportDevices` SELECT | Typed select on existing columns [VERIFIED: codebase] |
| `lib/csv.ts` (`buildCsv`/`esc`/`csvResponseHeaders`) | in-repo | File assembly + CWE-1236 guard | Every new cell passes the guard by construction [VERIFIED: codebase] |
| `lib/warranty.ts` (`warrantyState`, `displayTodayUtc`, `WARRANTY_WARN_DAYS`) | in-repo | Status values + request-scoped `today` | Single source shared with site color and filters [VERIFIED: codebase] |
| `lib/device-schema.ts` (`PER_TYPE_FIELDS`, `typeFields`) | in-repo | Label source for D-02 | Keystone = single source of per-type field labels [VERIFIED: codebase] |
| vitest | 4.1.11 (installed) | Test matrix | Existing config `vitest.config.ts`, alias `@`, server-only stub [VERIFIED: codebase] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Keystone-derived HEADER labels | Literal labels in HEADER + parity test | Literal copy is a smaller diff but D-02's «одна правка меняет и форму, и файл» is only true with derivation; a parity test achieves the same drift protection with zero refactor. Either is acceptable — pick ONE (see Architecture Patterns, Pattern 2) |
| Comma-decimal diagonal (recommended) | Dot-decimal as-is | Dot risks RU-Excel date corruption (`21.5` → 21 May); comma is consistent with the file's existing RU-first choices («;», BOM) |
| Status dictionary in `route.ts` | Small pure lib module | Route file imports `lib/auth` → `next/headers`; importing the route in vitest is fragile. Pure lib module keeps the dictionary directly testable (codebase pattern: «Pure lib-модули без фреймворк-импортов») |

**Installation:**
```bash
# NONE — new npm dependencies are forbidden (REQUIREMENTS Out of Scope).
# tests/csv-export.test.ts already asserts no CSV library is ever added.
```

## Package Legitimacy Audit

**Not applicable — this phase installs zero packages.** New dependencies are explicitly out of scope (REQUIREMENTS §Out of Scope), and `tests/csv-export.test.ts` contains a standing guard (`no CSV serialization dependency`) that fails the suite if a CSV library appears in package.json. No legitimacy checks were required.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Browser «Скачать CSV» link (filter-bar.tsx — UNCHANGED)
        │  GET /api/devices/export?[filters]          (cookie session)
        ▼
┌─────────────────────────────────────────────────────────────┐
│ route.ts GET handler                                        │
│  1. requireSession()          ← FIRST statement (SC 4)      │
│  2. parseDevicesSearchParams  ← THE page parser (WR-01)     │
│  3. toDeviceListFilters       ← THE one sentinel-strip      │
│  4. today = displayTodayUtc() ← once per request (NEW)      │
│  5. exportDevices(...) ──────────────┐                      │
└──────────────────────────────────────┼──────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────┐
│ db/queries/devices.ts                                       │
│  deviceWhere()  ← shared with listDevices (zero drift, SC2) │
│  SELECT + screenDiagonal, panelType, portCount,             │
│          peripheralKind   (NEW; columns exist, REAL/TEXT)   │
│  → DeviceExportRow (type widened, NEW fields nullable)      │
└─────────────────────────────────────────────────────────────┘
                                       │ rows (sparse: foreign-type
                                       ▼   config = null, structural)
┌─────────────────────────────────────────────────────────────┐
│ Cell mapping (route.ts, NEW positions per D-01/D-05)        │
│  … SSD,ГБ │ Диагональ″ │ Тип матрицы │ Порты │ Вид │ …      │
│  Дата закупки/Гарантия до → isoFileDate()  (D-06, UTC)      │
│  Статус гарантии → WARRANTY_STATE_LABELS[warrantyState(     │
│                     r.warrantyUntil, today)]  (D-03/D-04)   │
└─────────────────────────────────────────────────────────────┘
                                       ▼
                        buildCsv(HEADER, cells)  ← BOM+«;»+CRLF,
                        every cell through esc()  (CWE-1236 dead)
                                       ▼
                        Response + csvResponseHeaders (UNCHANGED)
                        → Excel/Numbers (RU locale: comma-decimal!)
```

### Recommended Project Structure

No new files are strictly required; one small pure module is recommended:

```
lib/
├── csv.ts              # UNCHANGED — buildCsv/esc/csvResponseHeaders
├── warranty.ts         # UNCHANGED — warrantyState/displayTodayUtc
├── device-schema.ts    # UNCHANGED — PER_TYPE_FIELDS (label source)
└── device-csv.ts       # NEW (optional, recommended): isoFileDate +
                        #   WARRANTY_STATE_LABELS + ordered config-field
                        #   key list — pure, no framework imports
app/api/devices/export/route.ts   # EXTEND: HEADER (20), cells mapping,
                                  #   today per request; requireSession-first untouched
db/queries/devices.ts             # EXTEND: exportDevices SELECT + DeviceExportRow (+4 fields)
tests/csv-export.test.ts          # EXTEND: header/sparse/injection/ISO/status/count
```

### Pattern 1: Widening the export scan (exact existing precedent)

`getDevice()` already selects all 4 config columns — copy that select shape into `exportDevices`. Sparse is structural: `createDevice`/`updateDevice` write `?? null` for config fields of foreign types, so a laptop row simply carries `screenDiagonal: null` — the cells mapping needs no per-type branching.

```typescript
// db/queries/devices.ts — DeviceExportRow gains exactly:
screenDiagonal: number | null
panelType: string | null
portCount: number | null
peripheralKind: string | null
// and the SELECT gains the same four lines (verified available on the
// devices table: db/schema.ts lines 87–90 — real/text/integer/text).
```

### Pattern 2: D-02 label discipline — derive, don't duplicate

D-02: labels verbatim from the keystone, «одна правка в PER_TYPE_FIELDS меняет и форму, и файл». Note the block order (Диагональ/Матрица/Порты/Вид) is a CROSS-type order that no single per-type array contains — so derive by field KEY in a fixed export order, labels from the keystone:

```typescript
// lib/device-csv.ts (pure — vitest imports directly, no next/*)
import { PER_TYPE_FIELDS, type DeviceFieldKey } from '@/lib/device-schema'

// The export's sparse block layout (D-01) — keys, not labels: the label
// lives ONLY in the keystone, so renaming it there renames the file column.
const CONFIG_EXPORT_KEYS: DeviceFieldKey[] = [
  'screenDiagonal', 'panelType', 'portCount', 'peripheralKind',
]

function keystoneLabel(key: DeviceFieldKey): string {
  for (const fields of Object.values(PER_TYPE_FIELDS)) {
    const f = fields.find((f) => f.key === key)
    if (f) return f.label // 'Диагональ, ″' — U+2033, verbatim from keystone
  }
  throw new Error(`unknown config field key: ${key}`)
}
```

Minimal-diff alternative: keep literal labels in HEADER but add a test asserting `HEADER` config labels `===` keystone labels (codebase style: «дрейф громко красный»). Pick one mechanism; do not do neither.

### Pattern 3: Status dictionary + request-scoped `today` (D-03/D-04/D-05)

```typescript
// lib/device-csv.ts
import { warrantyState, type WarrantyState } from '@/lib/warranty'

// D-03: no day numbers in the text (must not duplicate WARRANTY_WARN_DAYS).
// D-04: 'none' renders text, never an empty cell.
export const WARRANTY_STATE_LABELS: Record<WarrantyState, string> = {
  ok: 'Действует',
  warn: 'Истекает',
  expired: 'Истекла',
  none: 'Без гарантии',
}
// Route: const today = displayTodayUtc()  ← ONCE per request, then per row:
// WARRANTY_STATE_LABELS[warrantyState(r.warrantyUntil, today)]
```

### Pattern 4: File-level ISO date formatter (D-06) — UTC only

Stored `purchaseDate`/`warrantyUntil` are UTC-midnight timestamps (form writes `new Date('yyyy-mm-dd')` → UTC midnight per ECMAScript date-only parsing; verified in `app/(app)/devices/actions.ts` line 211/214). Therefore `toISOString().slice(0, 10)` round-trips the exact calendar day on any host timezone — same idiom the route already uses for the filename date:

```typescript
// D-06: one formatter per file. NEVER Intl with a local TZ here (CR-01 bug
// class); NEVER reuse formatWarrantyDate (dd.mm.yyyy — site surface, frozen).
export function isoFileDate(value: Date): string {
  return value.toISOString().slice(0, 10) // exact for UTC-midnight operands
}
// cells: r.purchaseDate ? isoFileDate(r.purchaseDate) : null
```

### Pattern 5: Cell mapping shape (20 cells, D-01/D-05 positions)

```typescript
const cells = rows.map((r) => [
  deviceTypeName(r.typeKey), r.model, r.serialNumber, r.inventoryNumber,
  deviceStatusLabel(r.status), r.holder, r.departmentName,
  r.ramGb,
  r.ramUpgraded === null ? null : r.ramUpgraded === 1 ? 'да' : 'нет',
  r.ssdGb,
  // ── config block, contiguous (D-01) ──
  diagonalCell(r.screenDiagonal),  // see Open Question 1: '21,5' vs '21.5'
  r.panelType,                     // free text — flows through esc() like any cell
  r.portCount,
  r.peripheralKind,
  // ── end config block ──
  r.purchaseDate ? isoFileDate(r.purchaseDate) : null,   // ISO (D-06)
  r.purchasePrice,
  r.supplier,
  r.warrantyUntil ? isoFileDate(r.warrantyUntil) : null, // ISO (D-06)
  WARRANTY_STATE_LABELS[warrantyState(r.warrantyUntil, today)], // after «Гарантия до» (D-05)
  r.notes,
])  // HEADER.length === cells.length === 20 — a parity test pins both
```

### Anti-Patterns to Avoid
- **A second status calculation:** deriving status text from raw date math (`days <= 60`) instead of `warrantyState()` — this is the exact drift Phase 6 killed (WR-01). The dictionary maps STATES, it never re-derives them.
- **A parallel label dictionary:** literal CSV labels drifting from `PER_TYPE_FIELDS` (D-02 violation) — especially the U+2033 ″ char in «Диагональ, ″», which must not degrade to `"` or `ʺ`.
- **Per-row `displayTodayUtc()`:** compute `today` once per request (per-render hoist pattern, same as page renders).
- **Touching the drift-proof core:** any edit to `deviceWhere`, `parseDevicesSearchParams`, `toDeviceListFilters`, `requireSession` position, `buildCsv`/`esc`, or `csvResponseHeaders` is out of scope and risks SC 2/3/4.
- **Local-timezone date math in the file:** `Intl` without `timeZone: 'UTC'` or local getters shifts dates during MSK 00:00–03:00 (CR-01 class, fixed once in Phase 5 — do not reintroduce).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV escaping / formula-injection guard | A second escaper or per-column special cases | `buildCsv`/`esc` (`lib/csv.ts`) — already covers every cell incl. header row | CWE-1236 guard is positional (first char) and tested; a second join path is how injection returns |
| Warranty status decision | Date arithmetic in the route | `warrantyState(warrantyUntil, today)` | Single source for site color + filter + file (SC 1 parity by construction) |
| Config field labels | A CSV labels module | `PER_TYPE_FIELDS` (keystone) | D-02; the form and the file must never disagree |
| CSV transport / filename / headers | New header logic | `csvResponseHeaders(isoDate)` — unchanged | Dual RFC 5987 filename, nosniff, no-store already tested |
| Sparse per-type logic | Per-type branches in cells mapping | Direct pass-through of nullable SELECT fields | NULL storage makes sparseness structural; branches would add a drift surface |

**Key insight:** this phase's difficulty is not writing new code — it is adding exactly 5 columns without creating ANY second source of truth. Every new artifact (labels, status text, date format) must be a thin wrapper over an existing single-source module.

## Common Pitfalls

### Pitfall 1: RU Excel turns the diagonal into a date (the one real data-corruption risk)
**What goes wrong:** `screen_diagonal` is REAL (form step 0.1) — values like 21.5/23.8/27.5. In comma-decimal locales (ru-RU; the very reason the file uses «;»), Excel opening a CSV parses dot-decimal values that match a day.month pattern as DATES: `21.5` → 21 May of the current year [CITED: stackoverflow.com/questions/77532621; cross-checked on Reddit r/excel, Datawrapper Academy, UiPath forum — MEDIUM confidence]. The esc() guard does NOT help (first char `2` is not dangerous). All existing numeric columns are integers, so the file has never hit this.
**Why it happens:** Excel applies OS-locale text-to-value conversion per field on open; `.` is a date separator and `,` the decimal mark in RU.
**How to avoid:** write the diagonal comma-decimal: `String(v).replace('.', ',')` → `21,5` parses as a number in RU Excel (comma is NOT the separator here — «;» — so no column shift). Consistent with the file's RU-first contract (BOM + «;» were chosen for exactly this operator).
**Warning signs:** acceptance testing opens the file and diagonals render as «21.05.2026»; integers (27) are unaffected — only fractional values break, so a 27"-only smoke test will NOT catch it.

### Pitfall 2: HEADER/cells arity or position mismatch
**What goes wrong:** 15 → 20 columns; inserting cells in a different order than HEADER silently mislabels every column (no error — wrong data under headers).
**How to avoid:** build both arrays in one place/order; test asserts `HEADER.length === 20` and, better, parses one seeded row back positionally (split on «;» and index-check the 5 new positions).
**Warning signs:** review diff shows HEADER and the cells array edited in separate commits/orders.

### Pitfall 3: Label drift from the keystone (D-02)
**What goes wrong:** literal «Диагональ, "» with a straight quote instead of U+2033 ″, or a renamed keystone label leaving the file behind.
**How to avoid:** derive labels from `PER_TYPE_FIELDS` (Pattern 2) or pin them with a parity test comparing HEADER labels to keystone labels verbatim.
**Warning signs:** the ″ character pasted as `"` / `ʺ` / `'` in the diff.

### Pitfall 4: Status text re-deriving the boundary
**What goes wrong:** writing `days <= 60 ? 'Истекает' : …` inline duplicates WARRANTY_WARN_DAYS and drifts from site color when the constant changes (the exact D-03 rejection rationale).
**How to avoid:** dictionary over `warrantyState()` output only; parity test composes `warrantyState` + dictionary on the boundary fixtures 0/59/60/61/-1/null (cases already exist in `tests/warranty.test.ts`).
**Warning signs:** the number 60 (or 86_400_000 arithmetic) appearing in route.ts or the labels module.

### Pitfall 5: Local-timezone dates in the new formatter (CR-01 regression class)
**What goes wrong:** a formatter using local getters shifts «Гарантия до» by a day for renders during MSK 00:00–03:00 (host is UTC, office is Moscow).
**How to avoid:** `toISOString().slice(0, 10)` (valid because stored stamps are UTC-midnight) or `Intl` with explicit `timeZone: 'UTC'` — never host-local.
**Warning signs:** any `new Date(y, m, d)` / `getDate()` in the new code; test freezes a date and asserts the exact ISO string.

### Pitfall 6: Accidentally weakening the auth/query contract while editing the route
**What goes wrong:** moving `requireSession()` below the filter parsing «temporarily», or re-parsing filters with a second parser «to get type separately».
**How to avoid:** the diff to route.ts must keep `await requireSession()` as the literal first statement and reuse `parseDevicesSearchParams` → `toDeviceListFilters` exactly as-is; new code is appended (today, cells, HEADER), not interleaved.
**Warning signs:** SC 4/SC 2 language appearing in the diff context lines around the first statements.

### Pitfall 7: Testing the export route via HTTP
**What goes wrong:** trying to spin the route handler in vitest — `route.ts` imports `lib/auth` → `next/headers`; there is no route-level HTTP test harness in this repo (all 24 existing test files test pure modules / queries directly).
**How to avoid:** test the pieces the route composes (pure functions + `exportDevices` against temp SQLite, the established `tests/csv-export.test.ts` harness). Auth-first stays verified by code inspection (SC 4 is existing behavior; the codebase has no route-level auth test precedent).
**Warning signs:** a new test importing `next/server` or mocking `NextRequest`.

## Code Examples

### Verified: current HEADER + cells (the extension base)
```typescript
// Source: app/api/devices/export/route.ts (lines 37–94, verified 2026-09-16)
const HEADER = ['Тип', 'Модель', 'Серийный номер', 'Инвентарный номер', 'Статус',
  'Держатель', 'Отдел', 'RAM, ГБ', 'RAM апгрейдена', 'SSD, ГБ', 'Дата закупки',
  'Стоимость', 'Поставщик', 'Гарантия до', 'Заметки']  // → 20 columns (D-01)
export async function GET(request: NextRequest) {
  await requireSession()               // SC 4 — keep as first statement
  // …parser → toDeviceListFilters → exportDevices({ type, filters: listFilters })
}
```

### Verified: keystone labels (D-02 source of truth)
```typescript
// Source: lib/device-schema.ts PER_TYPE_FIELDS (verified; note U+2033 ″)
{ key: 'screenDiagonal', label: 'Диагональ, ″', type: 'number', step: 0.1 }
{ key: 'panelType',      label: 'Тип матрицы',  type: 'text', maxLength: 40 }
{ key: 'portCount',      label: 'Количество портов', type: 'number', step: 1 }
{ key: 'peripheralKind', label: 'Вид', type: 'select', options: PERIPHERAL_KINDS }
```

### Verified: warrantyState boundaries (the parity source, tests/warranty.test.ts)
```typescript
// wu == today → 'warn'; today+60 → 'warn'; today+61 → 'ok';
// today-1 → 'expired'; null → 'none'. WARRANTY_WARN_DAYS === 60 pinned.
// D-03 dictionary: ok→Действует, warn→Истекает, expired→Истекла, none→Без гарантии
```

### Verified: esc() already neutralizes the only new free-text injection vector
```typescript
// Source: lib/csv.ts esc() — panelType is free text (maxLength 40) and CAN be
// '=1+1' if the operator typed it; esc() tab-prefixes it like every other cell.
esc('=1+1') // '\t=1+1' — no new guard code needed; extend the fixture instead
```

### Verified: UTC-midnight storage guarantee
```typescript
// Source: app/(app)/devices/actions.ts lines 211/214 + zod ^\d{4}-\d{2}-\d{2}$
purchaseDate: purchaseDate ? new Date(purchaseDate) : null   // ISO date-only
//   → parses UTC midnight → isoFileDate round-trips the exact calendar day
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CSV file dates dd.mm.yyyy (`formatWarrantyDate` reuse) | File-level ISO `yyyy-mm-dd` (D-06) | This phase (locked) | Only visible behavior change of existing columns; deliberate — locale-independent sort + SC 3 letter. Site display untouched |
| Excel CSV safety = quoting only | Formula-injection tab-prefix (OWASP) | Already in `lib/csv.ts` (Phase 5) | New columns inherit it automatically; only tests extend |
| Numbers in file = integers only | First fractional column (diagonal) | This phase | Introduces the RU-locale decimal decision (Pitfall 1 / Open Question 1) |

**Deprecated/outdated:** reusing `formatWarrantyDate` for the file — explicitly frozen to dd.mm.yyyy for the site (CONTEXT domain: «formatWarrantyDate остаётся dd.mm.yyyy»).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Operator opens the file in Excel with RU locale (comma decimal, «;» list separator) — the basis for the comma-decimal recommendation | Pitfall 1, Open Questions | Low: dot-decimal fallback degrades gracefully to text in RU Excel only if Excel does NOT date-parse; the corruption scenario is the one to avoid |
| A2 | Excel behavior for ISO `yyyy-mm-dd` on CSV open is version/locale-dependent (may become a real date cell or stay text) — sorting is chronological either way, so D-06 is safe under both outcomes | State of the Art | None for the decision; informational only [LOW confidence, community sources] |
| A3 | `PER_TYPE_FIELDS` label derivation (Pattern 2) is the intended reading of D-02; the alternative (literals + parity test) is equally compliant | Pattern 2 | Low: either mechanism satisfies D-02; doing neither would be the failure |
| A4 | SC 4 requires no new automated test (no route-level HTTP test precedent in repo; behavior is existing, unchanged code) | Pitfall 7, Validation Architecture | Low: verifier can pin by inspection as in prior phases |

## Open Questions

1. **Decimal representation of «Диагональ, ″» in the file** (recommendation: comma-decimal `21,5`)
   - What we know: `screenDiagonal` is REAL with step 0.1; dot-decimal values are date-corrupted by RU-locale Excel on open [MEDIUM: multiple independent sources]; the file already commits to RU-first conventions («;», BOM); CONTEXT.md locks labels (D-02) and dates (D-06) but not decimal format.
   - What's unclear: whether the operator ever opens the file in a non-RU locale (would make comma-decimal text).
   - Recommendation: comma-decimal (`String(v).replace('.', ',')`); integers unaffected. If the planner treats this as user-visible format, add a lightweight `checkpoint:human-verify`; otherwise decide within cell-formatting discretion and pin with a test.

2. **Home of the status dictionary + ISO formatter** (discretion area, CONTEXT: «рядом с роутом экспорта / в lib — но словарь статуса один»)
   - What we know: route.ts is not vitest-importable (next/headers chain); the repo pattern is pure lib modules called directly by vitest.
   - Recommendation: one small pure module (e.g. `lib/device-csv.ts`) holding `isoFileDate`, `WARRANTY_STATE_LABELS`, and the ordered config-key list; route stays a thin composer.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | vitest, drizzle, build | ✓ | v22.23.0 | — |
| vitest | Test matrix | ✓ | 4.1.11 (devDependency) | — |
| better-sqlite3 | temp-SQLite query tests | ✓ | installed (13.x) | — |
| New npm packages | — | N/A | — | forbidden by REQUIREMENTS |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

*(Step 2.6 audit minimal: the phase adds no external tool/service dependencies; everything runs on the existing dev stack.)*

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.11 (node environment) |
| Config file | `vitest.config.ts` (root; `@` alias + server-only stub) |
| Quick run command | `npx vitest run tests/csv-export.test.ts` |
| Full suite command | `npx vitest run` (341 tests green as of Phase 7 close) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXP-01 (SC 1) | 20-column HEADER in D-01 order; config labels === keystone labels verbatim (incl. ″) | unit | `npx vitest run tests/csv-export.test.ts` | ✅ extend existing |
| EXP-01 (SC 1) | Sparse matrix: each of 4 types fills only its own config cells, foreign cells empty (null→empty field) | unit (temp SQLite) | `npx vitest run tests/csv-export.test.ts` | ✅ extend existing |
| EXP-01 (SC 1) | Status text parity: dictionary ∘ warrantyState on boundaries 0/59/60/61/-1/null → Действует/Истекает/Истекла/Без гарантии | unit | `npx vitest run tests/csv-export.test.ts` | ✅ extend (boundary cases from tests/warranty.test.ts) |
| EXP-01 (SC 2) | Unfiltered export row count === `totalDeviceCount()`; filtered parity walk (already exists) stays green | unit (temp SQLite) | `npx vitest run tests/csv-export.test.ts` | ✅ extend existing |
| EXP-01 (SC 3) | ISO dates: seeded purchaseDate/warrantyUntil render `yyyy-mm-dd`; null → empty cell | unit | `npx vitest run tests/csv-export.test.ts` | ✅ extend existing |
| EXP-01 (SC 3) | Injection through NEW columns: panelType `=1+1` tab-prefixed in built file (free-text vector); enum/numeric columns safe | unit | `npx vitest run tests/csv-export.test.ts` | ✅ extend existing |
| EXP-01 (SC 3) | Diagonal decimal representation per Open Question 1 resolution (`21,5` recommended) | unit | `npx vitest run tests/csv-export.test.ts` | ✅ extend existing |
| EXP-01 (SC 4) | requireSession() is the literal first statement; route contract untouched | inspection (no route-level HTTP test harness in repo — A4) | manual/code-review | n/a |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/csv-export.test.ts tests/warranty.test.ts`
- **Per wave merge:** `npx vitest run` (full suite) + `npx next build` + `npx eslint`
- **Phase gate:** full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements (vitest configured, temp-SQLite helpers in `tests/helpers.ts`, fixture/seeding idioms in `tests/csv-export.test.ts` ready to extend).

## Security Domain

### Applicable ASVS Categories (level 1, security_enforcement: true)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | single-account session (Phase 1, unchanged) |
| V3 Session Management | indirect | `requireSession()` = verifySession over signed cookie; FIRST statement of the route (existing — keep position) |
| V4 Access Control | yes | proxy default-deny perimeter over api/* + in-route `requireSession()` defense-in-depth (existing; SC 4) |
| V5 Input Validation | yes | filter params via the one zod-free sentinel-degrading parser (`parseDevicesSearchParams`); response headers hardcoded (never echoed); ALL cells — including new free-text `panelType` — through `esc()` |
| V6 Cryptography | no | no new crypto surface |
| V7 Error Handling | yes | happy-path-only route; unexpected failures → Next generic 500, no internals echoed (existing) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSV formula injection (CWE-1236) via new columns — `panelType` is operator free text and the realistic vector | Tampering/Elevation | `esc()` first-char TAB prefix in `buildCsv`; every cell passes; extend the injection fixture to a new column instead of adding guard code |
| Bulk data exfiltration without session | Information Disclosure | `requireSession()` first + `Cache-Control: no-store` (existing, unchanged) |
| Filter-param crash/echo | Tampering | parser degrades invalid values to inactive sentinels (T-03-04 discipline; existing) |

## Sources

### Primary (HIGH confidence — verified in codebase this session)
- `app/api/devices/export/route.ts` — HEADER/cells structure, requireSession-first, security-shape comments
- `lib/csv.ts` — esc()/buildCsv/csvResponseHeaders, hand-roll rationale (CWE-1236)
- `db/queries/devices.ts` — exportDevices/DeviceExportRow/deviceWhere/warrantyPredicate/totalDeviceCount
- `lib/warranty.ts` — warrantyState/displayTodayUtc/WARRANTY_WARN_DAYS (inclusive 60)
- `lib/device-schema.ts` — PER_TYPE_FIELDS labels (incl. U+2033 ″), typeFields, PERIPHERAL_KINDS
- `db/schema.ts` lines 87–90 — config columns exist: real/text/integer/text
- `tests/csv-export.test.ts`, `tests/warranty.test.ts`, `tests/helpers.ts` — harness, injection matrix, boundary fixtures
- `app/(app)/devices/actions.ts` lines 211/214 — `new Date('yyyy-mm-dd')` → UTC-midnight storage
- `lib/warranty-date.tsx` — formatWarrantyDate (frozen dd.mm.yyyy, site-only)
- `.planning/PROJECT.md`, `.planning/ROADMAP.md` §Phase 8, `05-CONTEXT.md` D-18

### Secondary (MEDIUM confidence)
- Excel dot-decimal → date conversion in comma-decimal locales: [stackoverflow.com/questions/77532621](https://stackoverflow.com/questions/77532621), [Reddit r/excel — regional decimal differences](https://www.reddit.com/r/excel/comments/1m8tv4p/regional_decimal_differences_between_and_are/), [Datawrapper Academy](https://www.datawrapper.de/academy/prevent-excel-from-changing-numbers-into-dates), [UiPath forum](https://forum.uipath.com/t/certain-decimal-values-are-interpreted-as-dates-when-using-write-csv-activity/421112) — four independent community confirmations

### Tertiary (LOW confidence — informational only)
- ISO yyyy-mm-dd recognition in Excel CSV open (version/locale-dependent; decision-safe either way): [Reddit r/ISO8601](https://www.reddit.com/r/ISO8601/comments/i5b9no/it_seems_excel_will_recognise_anything_as_a_date/), [Accusoft FAQ](https://www.accusoft.com/faqs/why-are-the-dates-in-my-csv-file-being-converted-to-a-us-date-format-in-the-viewer-when-the-prizmdoc-server-is-set-to-a-uk-locale/)

## Metadata

**Confidence breakdown:**
- Standard stack / extension points: HIGH — every file read and verified this session; zero new dependencies
- Architecture: HIGH — extension follows established, tested patterns; diagram traces existing code
- Pitfalls: MEDIUM-HIGH — Pitfall 1 backed by 4 independent external sources (behavior itself not executable-tested here); rest verified from codebase history
- External Excel behavior: MEDIUM (decimal/date parsing), LOW (ISO recognition) — neither blocks the locked decisions

**Research date:** 2026-09-16
**Valid until:** 2026-10-16 (stable domain; codebase-anchored)
