# Phase 5: Search & Filters - Research

**Researched:** 2026-09-04
**Domain:** SQLite/Drizzle substring search + combinable filters; React 19 debounced URL-driven search island; warranty date math in DISPLAY_TZ; authenticated CSV export route
**Confidence:** HIGH

## Summary

This phase extends one battle-tested extension point: `listDevices` in `db/queries/devices.ts` (currently type + pagination + covers batch). Everything the phase needs is expressible as a growing `and(...)` where-clause over the existing schema — **zero DB migrations**. The one genuinely non-obvious technical decision is how to search the model column, which has NO normalized twin column: the answer is a better-sqlite3 user-defined function `norm()` wrapping `lib/normalize.mjs`'s `normalizeNumber`, registered once at connection setup and called in the SQL where-clause. This was **proven live against the project's own better-sqlite3 13 + Drizzle 0.45.2**: a Cyrillic-typed query «с123» finds the Latin serial `C123`, and «СЕРЫЙ» finds the lowercase-Cyrillic model «серый laptop» — something SQLite's native ASCII-only `upper()`/`LIKE` folding structurally cannot do. The UDF guarantees the query-side fold is byte-identical to the write-side fold because it IS the same function.

Warranty math must reuse the CR-01 recipe (commit `1a31814`): compute "today" as a calendar date on the Europe/Moscow wall clock via `Intl.DateTimeFormat(...).formatToParts`, build UTC-midnight `Date` boundaries in JS, and pass them into the SQL comparison as ordinary Drizzle `gte/lte` operands (Drizzle timestamp-mode columns accept `Date` and convert to unix seconds — verified in probe). `warrantyUntil = null` means "no warranty": excluded from every warranty filter and never colored (locked discretion). A single pure helper `warrantyState(device, today) → 'ok'|'warn'|'expired'|'none'` in `lib/` serves registry rows, the device card, and the employee card issued list (WAR-01 literally, one calculation, three render sites).

The UI is the established phase-3 pattern generalized: server page validates `searchParams` → passes flat serializable values to client islands → islands push the FULL query string and reset `page=1`. The only new island mechanic is the debounced search box (~300 ms, `router.replace` with `scroll:false`, `useTransition` for pending state). CSV export (D-18) is a plain authenticated GET route under `app/api/devices/export/route.ts` — the default-deny proxy perimeter already covers `api/*`; the route needs `requireSession()` first (established defense-in-depth), string-built RFC-4180 CSV with UTF-8 BOM + `;`, tab-prefix formula-injection defense (OWASP), and an RFC 5987 `filename*` for the Cyrillic filename (MDN-verified shape). Performance is a non-issue and was measured: the FULL combined filter query (3-way LIKE search with UDF fold + type + status + RAM + warranty window over 500 rows) averages **0.9 ms** — two orders of magnitude inside "instant".

**Primary recommendation:** Extend `listDevices` with an optional `filters` object; register `norm()` UDF in `db/index.ts`; put a shared pure `parse/buildQuery` params module in `app/(app)/devices/`; one `warrantyState` helper in `lib/warranty.ts`; one CSV route reusing the exact same param parser; a debounced replace-based search island. No new packages.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Поиск (D-01..D-05)**
- **D-01:** Живой поиск, дебаунс ~300 мс, серверный запрос через URL searchParams, с первого символа.
- **D-02:** Поля поиска строго: серийник, инвентарник, модель. Имя держателя НЕ ищется.
- **D-03:** Сортировка — та же русская сортировка по модели (Ё→Е + id tiebreaker); «релевантность» не строится.
- **D-04:** Пустой результат: заголовок «Ничего не найдено», подсказка про раскладку («С123» находит «C123»), кнопка «Сбросить фильтры».
- **D-05:** При активном поиске/фильтрах подзаголовок «Найдено: N устройств» вместо общего счётчика.

**RAM-фильтр (D-06..D-08)**
- **D-06:** Семантика — явный флаг `ramUpgraded`, НЕ сравнение с номинальной RAM; ноль миграций.
- **D-07:** «Без апгрейда» = `ramUpgraded ≠ 1` внутри типа «ноутбук»: входят и 0, и null.
- **D-08:** Постоянный чип-тумблер над списком рядом с поиском; активация выставляет тип «ноутбук»; смена типа на не-ноутбук сбрасывает чип.

**Фильтры (D-09..D-14)**
- **D-09:** Отдел = устройства, чей текущий держатель состоит в отделе; склад (нет держателя) не попадает; техника у архивного сотрудника входит в его отдел.
- **D-10:** Статус — single select с опцией «Все статусы».
- **D-11:** Списанные видны по умолчанию; поиск по серийнику находит их сразу.
- **D-12:** Все фильтры одной строкой над списком: поиск + тип + статус + отдел + гарантия + RAM-чип; без поповера.
- **D-13:** Выбор отдела — Select, НЕ combobox (Base UI combobox дважды кусался: bb5674e, 7e400c9).
- **D-14:** Отдельных чипов активных фильтров нет; сброс через «Все …» и кнопку в пустом состоянии.

**Гарантия (D-15..D-17)**
- **D-15:** Пресеты: «истекает ≤ 30 дней», «истекает ≤ 60 дней», «истекла». Произвольного N дней нет.
- **D-16:** Цветная дата гарантии (зелёный / жёлтый «< 60 дней» / красный «истекла») в трёх местах: вторая строка row реестра («гар. до 12.03.2027»), карточка устройства, список выданной техники на карточке сотрудника. Один расчёт/компонент на все места.
- **D-17:** Жёлтый #FF9500, красный #D70015 (тот же семантический красный; один красный в системе).

**CSV (D-18)**
- **D-18:** Кнопка над списком; выгружает ПОЛНЫЙ результат текущих фильтров/поиска (все страницы); UTF-8 BOM + разделитель «;».

### Claude's Discretion
- Механика поиска: нормализация запроса через `lib/normalize.mjs` + сравнение по normalized-колонкам; по модели — свёртка на лету при запросе (сотни строк — скан ок)
- URL-синхронизация всех фильтров: полный query string, сброс страницы при смене любого фильтра; живой поиск — дебаунс поверх router.push
- Пороги гарантии: сравнение дат в DISPLAY_TZ=Europe/Moscow (урок CR-01, 1a31814); `warrantyUntil = null` = «без гарантии» — не подсвечивается, в гарантийные фильтры не попадает
- Копи пустых состояний и подсказок — в рамках копи-контракта UI-SPEC
- Состав колонок CSV и имя файла (дата в имени)
- Гомоглиф-фикстура typing-теста (блокер STATE)
- Seed: расширить до сотен устройств для приёмки UI-03 (сейчас 80)
- Представление галки ramUpgraded в форме не меняется

### Deferred Ideas (OUT OF SCOPE)
- Поиск по имени сотрудника в списке сотрудников — v2 (V2-02: глобальный ⌘K)
- Поиск устройств по имени держателя — отклонено в этой фазе
- Сохранённые смарт-фильтры — V2-01
- Произвольное гарантийное окно «N дней» — по первой реальной потребности

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FIND-01 | Мгновенный поиск по фрагменту серийника / инвентарника / модели, без учёта регистра | Pattern 1: `norm()` UDF + LIKE по `serial_normalized`/`inventory_normalized` (already normalized at write) + `norm(model)` — live-verified against project's own drivers |
| FIND-02 | «Ноуты без апгрейда RAM» одним кликом | D-07 predicate `(ram_upgraded IS NULL OR ram_upgraded != 1) AND type_key='laptop'`; chip island per Pattern 6; SQL three-valued-logic pitfall documented (Pitfall 1) |
| FIND-03 | Фильтры тип/статус/отдел/окно гарантии, комбинируемые с поиском | Single `and(...)` where-builder in `listDevices`; department via existing employees join (`employees.departmentId = ?` — in-stock NULL rows excluded automatically, D-09); warranty presets via DISPLAY_TZ UTC-midnight boundaries |
| FIND-04 | Терпимость к вводу: пробелы, регистр, кириллические/латинские гомоглифы | `normalizeNumber` on the query (trim/collapse/upper/homoglyphs); typing-test fixture covering all 11 HOMOGLYPHS pairs — closes STATE.md blocker; validation map FIND-04 |
| WAR-01 | Состояние гарантии в карточке и списках | Pure `warrantyState()` helper + `WarrantyDate` server component; three render sites (registry row line 2, device card «Гарантия до» row, employee card issued list — requires adding `warrantyUntil` to `listIssuedByEmployee` select) |
| UI-03 | Списки быстры на сотнях устройств | Measured: full combined query 0.9 ms @ 500 rows; server-side pagination unchanged; timing smoke + in-test 300-row seed; everything server-rendered, islands are tiny |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Search + filter query construction | Database / Storage (SQLite via queries module) | — | All predicates live in one SQL where-clause; better-sqlite3 sync, indexed columns where possible; UI-03 demands server-side lists |
| Query-string state (URL) | Frontend Server (RSC page) | Browser (islands) | Server page validates `searchParams` (source of truth); islands only push new URLs — no client cache, no client filtering |
| Debounced search input | Browser (client island) | Frontend Server (re-render) | Only the input needs keystroke state; 300 ms debounce then `router.replace` → server re-renders the list |
| Warranty state calculation | API / Backend (pure lib helper at render) | — | Pure function of (date, today-in-MSK); computed per row during server render; same helper in CSV if колонка added |
| CSV export | API / Backend (route handler) | Database | Full filtered scan in one query; auth at route + proxy perimeter |
| «Найдено: N», empty states, pagination | Frontend Server (RSC) | — | Derived from `listDevices` `total` during render; zero client state |

## Standard Stack

**No new packages.** Everything is built from the installed stack. (papaparse is in the project stack doc for *import* — do NOT add it for export; project's own stack patterns say string building is enough at hundreds of rows.)

### Core (already installed, versions verified from package.json)
| Library | Version | Purpose in this phase | Why |
|---------|---------|----------------------|-----|
| better-sqlite3 | 13.0.3 | `.function('norm', {deterministic:true}, normalizeNumber)` UDF; sync queries | UDF API verified in installed source (`lib/methods/function.js`); deterministic flag lets SQLite reuse the fold |
| drizzle-orm | 0.45.2 | `and/or/like/isNull/ne/gte/lte/lt/isNotNull/count` + `sql` template | All operators verified exported in installed 0.45.2; `sql\`norm(${devices.model}) like ${pattern}\`` emits correctly (probe) |
| next (App Router) | 16.3.3 | Route handler (`app/api/devices/export/route.ts`); `searchParams` Promise page prop; `router.replace/push(href, {scroll:false})` | Verified from bundled docs `node_modules/next/dist/docs/` (use-search-params.md, use-router.md, route.md) |
| react | 19.2.8 | `useState/useEffect/useTransition` in the search island | Existing island pattern (type-filter.tsx) |
| vitest | 4.1.11 | Query/filter tests vs temp SQLite; homoglyph fixture; timing test | Existing infra (tests/helpers.ts temp-DB pattern) |
| zod | 4.5.4 | searchParams validation (q length, dept int, warranty enum) | Existing convention (IdSchema pattern on every card page) |

### Supporting (existing project modules — reuse, don't parallel)
| Module | Purpose | When |
|--------|---------|------|
| `lib/normalize.mjs` (`normalizeNumber`) | THE query normalizer — same fold on write and search | Every search request + UDF registration |
| `lib/device-schema.ts` | `DEVICE_TYPES`, `deviceStatusLabel`, `isDeviceTypeKey` | Type/status filter validation; NOTE: status keys are NOT exported as an enum — export `DEVICE_STATUS_KEYS` from the label map in this phase |
| `lib/ru.ts` | `pluralDevices` («Найдено: …»), `DISPLAY_TZ` | Subtitle D-05; TZ constant |
| `components/ui/select.tsx` + `type-filter.tsx` | Select control + full-query-string push pattern | Department/status/warranty selects (D-13) |
| `components/ui/input.tsx` / `input-group.tsx` | Search input styling | Search island |
| `lib/movement-schema.ts` `zonedParts` pattern (CR-01 fix) | Wall-clock date parts in DISPLAY_TZ | Warranty boundary helper (extract or replicate — see Pattern 4) |
| `scripts/seed.mjs` | Fixture expansion to hundreds (UI-03/UAT) | Discretion item |

**Installation:** nothing to install.

**Version verification:** no new packages; versions above were read from `package.json` and the installed `node_modules` sources this session.

## Package Legitimacy Audit

> Protocol triggered only when the phase installs external packages. **This phase installs zero new packages** — CSV is string-built (D-18 says «;»+BOM, string building is the project-documented approach), search uses the already-installed better-sqlite3 UDF API, dates use `Intl` built-ins.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none — no new installs) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
**Explicitly rejected for this phase:** `papaparse` (CSV *export* needs a writer, not a parser; hand-rolled escaping is ~10 lines and project-documented), `json2csv`/`csv-stringify` (same reason; one more dep for zero gain at hundreds of rows).

## Architecture Patterns

### System Architecture Diagram

```
                       Browser (client islands — tiny)
   ┌──────────────────────────────────────────────────────────┐
   │  SearchBox  ──300ms debounce──▶ router.replace(?q=…)     │
   │  TypeSelect / StatusSelect / DeptSelect / WarrantySelect │
   │  RamChip ──▶ router.push(full query string, page=1)      │
   └───────────────────────────────┬──────────────────────────┘
                                   │ URL change (full query string)
                                   ▼
   ┌──────────────────────────────────────────────────────────┐
   │  proxy.ts (default-deny, session gate — api/* included)  │
   └───────────────────────────────┬──────────────────────────┘
                                   ▼
   ┌──────────────────────────────────────────────────────────┐
   │  RSC /devices/page.tsx                                    │
   │   requireSession() → parseDevicesSearchParams(sp) [zod]  │
   │   → listDevices({type,page,pageSize, filters})            │
   │   → <WarrantyDate> per row · «Найдено: N» · empty state  │
   └───────┬──────────────────────────────────┬───────────────┘
           │                                  │
           ▼                                  ▼
   ┌──────────────────┐            ┌──────────────────────────┐
   │ SQLite (drizzle) │            │ app/api/devices/export/  │
   │  serial_normalized│           │ route.ts (GET, same      │
   │  inventory_norm UQ│           │ parser + requireSession) │
   │  norm(model) UDF  │           │ → full filtered scan →   │
   │  warranty_until   │           │   CSV (BOM + «;») →      │
   │  employees join   │           │   Content-Disposition    │
   └──────────────────┘            └──────────────────────────┘
```

Primary use case: keystroke → debounce → URL → server validates → SQL → 20 rows + count → rendered list. CSV: click → GET with current query string → full scan → file download.

### Recommended Project Structure

```
app/(app)/devices/
├── page.tsx                  # EXTEND: parse all params, pass filters to listDevices, subtitle/empty states
├── query-params.ts           # NEW: parseDevicesSearchParams(sp) + buildDevicesQuery(filters) — pure, shared RSC+islands
├── search-box.tsx            # NEW: debounced island (router.replace, useTransition)
├── filter-bar.tsx            # NEW: one-row composition (D-12) — may stay server + compose islands
├── status-filter.tsx         # NEW: Select island (clone of type-filter.tsx)
├── department-filter.tsx     # NEW: Select island fed by listDepartments()
├── warranty-filter.tsx       # NEW: Select island (w30/w60/expired presets)
├── ram-chip.tsx              # NEW: chip toggle island (sets type=laptop, D-08)
└── type-filter.tsx           # EXTEND: build full query string via query-params (preserve other filters)
app/api/devices/export/
└── route.ts                  # NEW: authenticated CSV GET (same parser, full scan)
db/
├── index.ts                  # EXTEND: register `norm` UDF in openDb()
└── queries/devices.ts        # EXTEND: filters param on listDevices; exportDevices(filters); export DEVICE_LIST_WARRANTY
db/queries/movements.ts       # EXTEND: listIssuedByEmployee select += warrantyUntil (WAR-01 site 3)
lib/
├── warranty.ts               # NEW: displayToday(), warrantyState(), WARRANTY_WARN_DAYS=60 — pure
└── warranty-date.tsx         # NEW (or in components): <WarrantyDate value today /> server component, colors D-17
tests/
├── devices-queries.test.ts   # EXTEND: search/filters/RAM/dept/warranty/combo cases
├── warranty.test.ts          # NEW: state boundaries + TZ cases (frozen clocks)
├── homoglyphs-fixture.ts     # NEW: the typing-test fixture (STATE blocker)
└── device-search.test.ts     # NEW or merged: homoglyph/normalization search matrix
scripts/
└── seed.mjs                  # EXTEND: DEVICE_COUNTS to hundreds (e.g. 400)
```

### Pattern 1: Search query — normalize the query in JS, fold the model column via UDF

**What:** `q` runs through the same `normalizeNumber` used on write (trim → collapse spaces → `toUpperCase` → 11 homoglyph maps). Serial/inventory compare against their normalized twin columns directly. Model has no normalized column — call a registered UDF `norm(model)` inside the LIKE.

**When to use:** every search request; the exact same predicate rides both the rows query and the `count()` query.

**Example (verified live against installed drivers — probe emitted and returned expected rows):**
```ts
// db/index.ts — register once at connection setup
import { normalizeNumber } from '@/lib/normalize'
function openDb(): DrizzleDb {
  // ...existing pragmas...
  sqlite.function('norm', { deterministic: true }, normalizeNumber)
  return drizzle(sqlite)
}

// db/queries/devices.ts — search predicate
import { sql, or, like } from 'drizzle-orm'
import { normalizeNumber } from '@/lib/normalize'

function searchPredicate(rawQ: string | undefined) {
  const q = normalizeNumber(rawQ ?? '')
  if (q === '') return undefined
  const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` // escape LIKE wildcards
  return or(
    sql`${devices.serialNormalized} like ${pattern} escape '\\'`,
    sql`${devices.inventoryNormalized} like ${pattern} escape '\\'`,
    sql`norm(${devices.model}) like ${pattern} escape '\\'`,
  )
}
```
**Why UDF instead of an SQL replace-chain:** SQLite's `upper()` and `LIKE` fold **ASCII only** — a Cyrillic model («серый») would never match «СЕРЫЙ» through SQL folding. The UDF reuses `lib/normalize.mjs` byte-for-byte, so query-side and write-side folds cannot diverge. A hand-maintained chain of ~44 nested `replace()` calls (33 lowercase Cyrillic letters + 11 homoglyphs) is the fallback alternative if UDFs are ever unwanted; it was measured unnecessary here.

Probe results (project's own better-sqlite3 13 + Drizzle 0.45.2):
- `normalizeNumber('  с123  ')` → `C123`; finds row with serial `C123`
- «9-В-1» (Cyrillic В) finds model «Ugreen 9-в-1»; «СЕРЫЙ» finds «серый laptop»
- Drizzle emits: `where ("devices"."serial_normalized" like ? or norm("devices"."model") like ?)` with both params bound
- `inventory_normalized` LIKE on NULL rows is NULL → row excluded — no special case needed

### Pattern 2: One where-builder, one params module, filters compose for free

**What:** `listDevices` gains an optional `filters` object; a single `and(...)` assembles only the active predicates. The URL round-trip is owned by one pure module used by BOTH the server page and the client islands (islands cannot receive functions — pass flat data, import the builder).

```ts
// app/(app)/devices/query-params.ts — pure, no framework imports
export type DeviceFilters = {
  q?: string
  type: DeviceListType            // existing
  status?: DeviceStatusKey        // export the keys from device-schema
  departmentId?: number
  warranty?: 'w30' | 'w60' | 'expired'
  ramNoUpgrade?: boolean
}
export const WARRANTY_ITEMS = [
  { value: 'all', label: 'Вся гарантия' },
  { value: 'w60', label: 'Истекает ≤ 60 дней' },
  { value: 'w30', label: 'Истекает ≤ 30 дней' },
  { value: 'expired', label: 'Истекла' },
] as const
export function parseDevicesSearchParams(sp): DeviceFilters { /* zod/enum guards, never trust */ }
export function buildDevicesQuery(f: DeviceFilters, page = 1): string { /* full URLSearchParams, page omitted when 1 */ }
```
```ts
// db/queries/devices.ts — extension point (existing signature stays valid for old callers/tests)
export function listDevices({ type, page, pageSize, filters }: {
  type: DeviceListType; page: number; pageSize: number
  filters?: DeviceListFilters      // { q?, status?, departmentId?, warranty?, ramNoUpgrade? }
}) {
  const where = and(
    type === 'all' ? undefined : eq(devices.typeKey, type),
    filters?.q && searchPredicate(filters.q),
    filters?.status && eq(devices.status, filters.status),
    filters?.departmentId && eq(employees.departmentId, filters.departmentId), // D-09: LEFT JOIN null-holder rows auto-excluded
    filters?.ramNoUpgrade && and(
      eq(devices.typeKey, 'laptop'),
      or(isNull(devices.ramUpgraded), ne(devices.ramUpgraded, 1)),  // D-07 — see Pitfall 1
    ),
    warrantyPredicate(filters?.warranty),                            // Pattern 4
  )
  // ...existing count + rows + covers-batch flow, where: undefined-or-and(...)
}
```
- Department filter rides the **already-present** `leftJoin(employees, …)` — in-stock devices (NULL holder) and the D-09 semantics fall out of the join for free. Archived employees join normally (isActive is not filtered).
- Count query and rows query share the identical where object — build once, use twice.
- Sort stays `ruSortKey, asc(devices.id)` (D-03 — no relevance ranking).

### Pattern 3: Debounced search island — replace, not push; useTransition for pending

**What:** local `useState` holds the keystrokes; a 300 ms timer pushes `router.replace(href, { scroll: false })` inside `startTransition`; the server re-render flows the new `q` back down as a prop.

```tsx
'use client'
// app/(app)/devices/search-box.tsx
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function DeviceSearchBox({ q, current }: { q: string; current: DeviceFilters }) {
  const router = useRouter()
  const [value, setValue] = useState(q)
  const [, startTransition] = useTransition()
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    if (value === q) return // our own navigation came back, or nothing changed
    const t = setTimeout(() => {
      startTransition(() =>
        router.replace(buildDevicesQuery({ ...current, q: value }), { scroll: false }))
    }, 300)
    return () => clearTimeout(t) // retyping cancels; a prop change (Сбросить) also cancels
  }, [value, q]) // eslint-disable-line react-hooks/exhaustive-deps
  return <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Серийник, инвентарник или модель" className="h-10 min-w-48 flex-1 ..." />
}
```
Mechanics that matter:
- **`replace` for typing, `push` for discrete controls.** Typing floods history; replace keeps «назад» meaning "previous page of filters", matching D-01 latitude. Selects/chip keep the existing `push` behavior (type-filter.tsx pattern).
- **`scroll: false`** — verified available on `router.replace/push` in Next 16.3.3 (bundled use-router.md); without it every keystroke scrolls to top.
- **Input is NOT a `<form action>`** — the React 19 uncontrolled-reset landmine (`4886f6a`) applies to form actions only; a controlled input outside any form is safe. Never wire the search box to a server action.
- **Islands receive flat validated values** (server-serialization — no functions across the RSC boundary); the island imports `buildDevicesQuery` itself.
- **«Сбросить фильтры» is a plain server `<Link href="/devices">`** in the empty state — no island needed; when navigation lands, `q=''` arrives as a prop and the `value === q` guard clears the input naturally.
- `useSearchParams` exists in this Next (bundled docs) but requires a Suspense boundary on prerendered routes; passing `q`/params down as props from the already-dynamic page avoids the question entirely. If `next build` ever complains, wrap the island in `<Suspense>` — cheap insurance.

### Pattern 4: Warranty boundaries in DISPLAY_TZ + one pure state helper

**What:** "today" is a calendar date on the Moscow wall clock (CR-01 recipe, commit `1a31814`: `Intl.DateTimeFormat(..., { timeZone: 'Europe/Moscow', hourCycle: 'h23' }).formatToParts` → yyyy-mm-dd → `Date.UTC(...)`). All stored `warrantyUntil` values are UTC-midnight dates (written from `yyyy-mm-dd` form input), so day-level comparisons in UTC are exact.

```ts
// lib/warranty.ts — pure, injectable now, vitest-friendly
import { DISPLAY_TZ } from '@/lib/ru'
export const WARRANTY_WARN_DAYS = 60

/** UTC-midnight Date of "today" on the DISPLAY_TZ wall clock (CR-01). */
export function displayTodayUtc(now: Date = new Date()): Date {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now) // yyyy-mm-dd
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
export function addDaysUtc(day: Date, days: number): Date {
  return new Date(day.getTime() + days * 86_400_000)
}
export type WarrantyState = 'ok' | 'warn' | 'expired' | 'none'
export function warrantyState(warrantyUntil: Date | null, today: Date): WarrantyState {
  if (!warrantyUntil) return 'none'      // «без гарантии» — no color, no filter match
  if (warrantyUntil.getTime() < today.getTime()) return 'expired'
  const days = Math.round((warrantyUntil.getTime() - today.getTime()) / 86_400_000)
  return days <= WARRANTY_WARN_DAYS ? 'warn' : 'ok'
}
```
```ts
// SQL side — the same boundaries as Drizzle operands (timestamp-mode columns take Date, probe-verified)
function warrantyPredicate(w: 'w30' | 'w60' | 'expired' | undefined) {
  if (!w) return undefined
  const today = displayTodayUtc()
  if (w === 'expired') {
    return and(isNotNull(devices.warrantyUntil), lt(devices.warrantyUntil, today))
  }
  const days = w === 'w30' ? 30 : WARRANTY_WARN_DAYS
  return and(
    isNotNull(devices.warrantyUntil),
    gte(devices.warrantyUntil, today),            // active-only: «истекает», distinct from «истекла» (D-15)
    lte(devices.warrantyUntil, addDaysUtc(today, days)),
  )
}
```
Probe-verified semantics (today = 2026-09-04): a device expiring exactly today is **warn/active** (in ≤30 and ≤60 windows, not «истекла»); exactly +60 days IS in the ≤60 window. Render sites pass `displayTodayUtc()` once per render (`server-hoist-static-io`-adjacent: compute per page render, not per row).

**⚠ Boundary discrepancy to resolve in planning:** D-15/D-15 preset wording is «≤ 60 дней» (includes day 60), while D-16/WAR-01 wording is жёлтый «**< 60 дней**» (excludes day 60). Research recommends one constant (`WARRANTY_WARN_DAYS = 60`, `days <= 60` for both filter and color) so a device found by the filter never renders green. Planner should confirm or keep the literal «< 60».

### Pattern 5: CSV export route — same parser, full scan, BOM + «;», formula-injection guard

```ts
// app/api/devices/export/route.ts — GET only
import { requireSession } from '@/lib/auth'
import { exportDevices } from '@/db/queries/devices'
import { parseDevicesSearchParams } from '@/app/(app)/devices/query-params'

export async function GET(request: NextRequest) {
  await requireSession() // FIRST statement (established V3 defense-in-depth); proxy already default-denies api/*
  const filters = parseDevicesSearchParams(request.nextUrl.searchParams) // EXACT same parser as the page — no drift
  const rows = exportDevices(filters) // queries module: same where-builder, NO limit/offset, joins holder+department
  const esc = (v: string | number | null) => {
    let s = v === null ? '' : String(v)
    if (/^[=+\-@\t\r]/.test(s)) s = '\t' + s            // OWASP CSV injection: tab-prefix (CWE-1236 alt: apostrophe)
    if (/[";\n\r]/.test(s)) s = '"' + s.replaceAll('"', '""') + '"'
    return s
  }
  const header = ['Тип', 'Модель', 'Серийный номер', 'Инвентарный номер', 'Статус', 'Держатель', 'Отдел',
    'RAM, ГБ', 'RAM апгрейдена', 'SSD, ГБ', 'Дата закупки', 'Стоимость', 'Поставщик', 'Гарантия до', 'Заметки']
  const lines = [header.join(';'), ...rows.map((r) => [/* cells */].map(esc).join(';'))]
  const body = '\uFEFF' + lines.join('\r\n')             // UTF-8 BOM (Excel/Numbers detection) + RFC-4180 CRLF
  const iso = new Date().toISOString().slice(0, 10)
  const name = `устройства-${iso}.csv`
  return new Response(body, { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="devices-${iso}.csv"; filename*=UTF-8''${encodeURIComponent(name)}`, // MDN-verified dual form
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  }})
}
```
- The button above the list is a plain server-rendered `<a href={`/api/devices/export${queryString}`}>` — a GET link needs no island and no JS.
- Filename: ASCII fallback `filename` + RFC 5987 `filename*` for the Cyrillic name (both MDN-recommended for compatibility). Date in the name is a discretion item — this shape satisfies «дата в имени».
- CSV columns are Claude's discretion; the list above mirrors the registry's six columns + card fields. Keep it a superset of what the list shows so the file never becomes a richer parallel table (that is D-18's own rationale).

### Pattern 6: Filter bar composition (D-12) — one wrapping row

```tsx
// app/(app)/devices/filter-bar.tsx (server component composing islands — no client wrapper)
<div className="mt-6 flex flex-wrap items-center gap-2">
  <DeviceSearchBox q={q} current={filters} />                       {/* flex-1 min-w-48 — absorbs slack */}
  <DeviceTypeFilter current={type} filters={filters} />             {/* w-full sm:w-40, existing h-10 trigger */}
  <DeviceStatusFilter current={status} filters={filters} />
  <DeviceDepartmentFilter current={departmentId} filters={filters} items={listDepartments()} />
  <DeviceWarrantyFilter current={warranty} filters={filters} />
  <RamChip active={ramNoUpgrade} filters={filters} />               {/* pressed style when active */}
  <a href={`/api/devices/export${queryString}`} className="ml-auto ...">CSV</a>
</div>
```
- `flex-wrap` degrades gracefully on narrow screens: search takes the first line, selects wrap below (Apple-consistent, no breakpoints gymnastics). All controls `h-10` to match the existing type-filter trigger override.
- Chip coupling (D-08) is enforced in the island's `buildDevicesQuery` call: activating the chip writes `type=laptop`; setting type to a non-laptop omits `ram`. Server double-guard: `ramNoUpgrade` predicate already includes `type_key='laptop'`, so a hand-crafted `?type=monitor&ram=1` is inert (never amplify client coupling server-side).
- Subtitle (D-05): `anyActive = q || status || departmentId || warranty || ramNoUpgrade || type !== 'all'` → `Найдено: ${pluralDevices(total)}` else existing `pluralDevices(total)`.
- Empty states: keep «Пока нет устройств» (zero overall); everything else becomes «Ничего не найдено» + раскладка hint («набранное кириллицей „С123“ найдёт „C123“») + `<Link href="/devices">Сбросить фильтры</Link>` (D-04).

### Anti-Patterns to Avoid
- **SQL-side Cyrillic folding** (`upper()`/`replace()` chains, `LIKE` case-insensitivity assumptions): SQLite folds ASCII only — silently misses Cyrillic. Use the `norm()` UDF (single source of the fold).
- **`ram_upgraded != 1` alone** for D-07: SQL three-valued logic drops NULL rows (probe-verified). Must be `(IS NULL OR != 1)`.
- **Comparing warranty dates with `date('now')`/`sqlite CURRENT_DATE`**: those read the SERVER clock (UTC container) — the exact CR-01 bug class. Boundaries are computed in JS in DISPLAY_TZ and passed as bound values.
- **`router.push` per keystroke without debounce/replace**: history spam + scroll jumps; also never `scroll: true` (default) on filter navigations mid-page.
- **A client-side filter state store** (context/zustand): the URL is the state; a parallel store drifts from links/pagination/back button (the phase-3 lesson behind full-query-string links).
- **Separate CSV query/parser from the page's**: any second parse path WILL drift (wrong filter, wrong rows). One `parseDevicesSearchParams`, two callers.
- **Model search via a new normalized column**: violates the frozen no-migration constraint; the UDF makes it unnecessary at this scale.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Case/homoglyph folding at query time | SQL `replace()` chain (~44 nested calls) or a second TS normalizer | better-sqlite3 UDF over `lib/normalize.mjs` `normalizeNumber` | One source of truth; divergence = silently missing rows; chain is unmaintainable |
| CSV serialization | Generic CSV library or naive `join(',')` | ~15-line RFC-4180 escaper + BOM + `;` (Pattern 5) | Libraries add a dep for nothing at this scale; the escaper must exist anyway for formula injection |
| "Today" in a named timezone | `new Date()` arithmetic, `date('now')` | `Intl.DateTimeFormat.formatToParts` wall-clock recipe (CR-01, proven in `lib/movement-schema.ts`) | Host-tz date bugs only manifest at night — the worst time to learn |
| Debounce | Custom rAF/observable machinery | `setTimeout` + cleanup in `useEffect` (Pattern 3) | 6 lines, no dep, cancel-on-rerender semantics are exactly right |
| RU pluralization / sort | Custom plural/sort code | `pluralDevices` (lib/ru.ts), `ruSortKey` recipe | Already exist and are tested |
| Select controls | New control types (combobox!) | `components/ui/select.tsx` clones of type-filter.tsx | D-13 — combobox burned the project twice (bb5674e, 7e400c9) |

**Key insight:** everything hard in this phase (folding, timezones, auth perimeter, RU text) already has a proven in-repo solution — the phase is assembly, not invention. The only new mechanism (UDF) replaces what would otherwise be the riskiest hand-roll on the list.

## Common Pitfalls

### Pitfall 1: NULL is not ≠ 1 (SQL three-valued logic)
**What goes wrong:** `WHERE ram_upgraded != 1` silently excludes every laptop whose checkbox was never touched — exactly the devices D-07 says must be included.
**Why:** `NULL != 1` evaluates to NULL (not true) in SQL.
**How to avoid:** `or(isNull(devices.ramUpgraded), ne(devices.ramUpgraded, 1))`. Probe-verified both directions.
**Warning signs:** «без апгрейда» list shorter than expected; new seed devices missing.

### Pitfall 2: SQLite `LIKE`/`upper()` are ASCII-only
**What goes wrong:** Cyrillic model search returns nothing (or half the rows) despite "case-insensitive" LIKE.
**Why:** SQLite case-folds only a-z/A-Z by default.
**How to avoid:** `norm()` UDF (Pattern 1); never rely on LIKE case-insensitivity for anything non-ASCII.
**Warning signs:** Latin serials search fine, Cyrillic models don't.

### Pitfall 3: LIKE wildcard characters in user input
**What goes wrong:** a query of `%` or `_` matches everything / acts as a wildcard — surprising results, not an injection (drizzle binds params) but wrong semantics.
**How to avoid:** escape `\`, `%`, `_` and add `escape '\'` to each LIKE (Pattern 1). Trivial and permanent.
**Warning signs:** «%» typed in search returns the full registry.

### Pitfall 4: Warranty window computed on the server clock
**What goes wrong:** 00:00–03:00 MSK the UTC container's "today" is yesterday — «истекает в 60 дней» includes/excludes the wrong rows (CR-01 verbatim, in list form).
**How to avoid:** `displayTodayUtc()` in JS (Pattern 4); frozen-clock tests around the boundary.
**Warning signs:** any use of `new Date()` without DISPLAY_TZ parts extraction near a date-level comparison.

### Pitfall 5: The count query and rows query drift
**What goes wrong:** pagination says «Страница 1 из 1» while rows exist on page 2 (count forgot a filter).
**How to avoid:** build the `where` once, pass to both `count()` and the rows select (the current code already shares it for type — keep that property as the where grows).
**Warning signs:** total jumps when paging; «Найдено: N» disagrees with visible pages.

### Pitfall 6: Debounce races with «Сбросить фильтры»
**What goes wrong:** user types, immediately hits reset; the pending timer fires after navigation and re-applies the stale query.
**How to avoid:** the effect's cleanup clears the timer on every `value`/`q` change; the `value === q` guard skips no-op pushes (Pattern 3).
**Warning signs:** list re-filters a beat after reset was clicked.

### Pitfall 7: CSV opened in Excel shows mojibake or one giant column
**What goes wrong:** without UTF-8 BOM Excel reads UTF-8 as Windows-1251 (кириллица → кракозябры); without `;` RU Excel splits nothing (its list separator is `;`, comma is the decimal mark).
**How to avoid:** `\uFEFF` prefix + `;` separator are locked (D-18) and are exactly the correct choices; use CRLF line endings.
**Warning signs:** manual open in Excel — do it once during verify-work.

### Pitfall 8: CSV formula injection (CWE-1236)
**What goes wrong:** a model/notes/supplier cell starting with `=`, `+`, `-`, `@` executes as a formula when the file opens in Excel.
**Why:** data is operator-entered (trusted-ish) but the export is a classic injection sink; ASVS L1 + security_enforcement expect the mitigation.
**How to avoid:** tab-prefix guard in the escaper (Pattern 5) — one regex.
**Warning signs:** security review greps the export path for it.

### Pitfall 9: Employee-card issued list loses warranty colors silently
**What goes wrong:** `listIssuedByEmployee` selects only `id, model, serialNumber` — the component can't color what it doesn't have.
**How to avoid:** add `warrantyUntil: devices.warrantyUntil` to that select (queries change, no migration); WAR-01 site 3 then uses the same `<WarrantyDate>`.
**Warning signs:** TypeScript error at the component — do not widen with `any`.

### Pitfall 10: Stale `page` beyond the last page after narrowing filters
**What goes wrong:** user on page 5 narrows to a 1-page result → blank list despite matches.
**How to avoid:** every filter change builds the query with `page=1` (locked pattern, phase 3); `listDevices` clamp stays as backstop for hand-edited URLs.
**Warning signs:** URL with `page=6` after changing a select.

## Code Examples

Consolidated verified patterns (sources: live probes this session against the project's installed drivers; bundled Next 16.3.3 docs; existing code files):

### Search predicate emitting correct SQL (probe output)
```sql
-- emitted by drizzle from Pattern 1
select "id", "model", "serial_normalized", "status", "ram_upgraded", "warranty_until"
from "devices"
where ("devices"."serial_normalized" like ? or norm("devices"."model") like ?)
-- params: ['%C123%', '%C123%']
```

### Full combined filter at scale (probe: 500 rows, avg 0.889 ms over 200 runs)
```sql
WHERE (serial_normalized LIKE ? OR inventory_normalized LIKE ? OR norm(model) LIKE ?)
  AND type_key = 'laptop' AND status = 'assigned'
  AND (ram_upgraded IS NULL OR ram_upgraded != 1)
  AND warranty_until IS NOT NULL AND warranty_until >= ? AND warranty_until <= ?
```

### Drizzle Date operands on timestamp-mode columns (probe)
```ts
gte(devices.warrantyUntil, new Date(Date.UTC(2026, 8, 4)))   // binds unix seconds correctly
lte(devices.warrantyUntil, addDaysUtc(today, 60))
```

### URL-driven island (existing in-repo precedent: type-filter.tsx lines 25–38)
```tsx
onValueChange={(value) => {
  if (typeof value !== 'string') return
  const params = new URLSearchParams()   // FULL query string, page reset — copy this shape
  if (value !== 'all') params.set('type', value)
  params.set('page', '1')
  router.push(`?${params.toString()}`)
}}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` (edge) | `proxy.ts` (Node runtime) — already in repo | Next 16 | CSV route auth mental model: proxy covers `api/*`; do not reintroduce middleware |
| Drizzle CTE/`sql` gymnastics for folds | better-sqlite3 UDFs (`db.function`) | better-sqlite3 9+ | Deterministic UDF is the idiomatic fold point for SQLite |
| `useSearchParams` in islands | Server-validated params passed as props | This repo's phase-3 pattern | Avoids Suspense/prerender caveats entirely |
| CSV via library | String building + BOM (project-documented) | Phase 0 research | No dep; escaper + injection guard is ~15 lines |

**Deprecated/outdated (in this repo):** none removed by this phase; `middleware.ts` must not appear.

## Runtime State Inventory

> Omitted — this is a feature phase (search/filters/export), not a rename/refactor/migration. No stored strings, service configs, OS registrations, secret names, or build artifacts are renamed. Verified: no schema changes (frozen-migration constraint holds — Phase 1 already created `serial_normalized`/`inventory_normalized` UNIQUE indexes as the FIND-01 hook).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Green color for warranty "ok" = Apple system green `#34C759` (text color); D-17 locks only yellow/red | Pattern 4 / UI | Cosmetic; swap to a darker green (#248A3D) if contrast displeases — one token |
| A2 | Warn boundary unified at `days <= 60` for BOTH filter (D-15 «≤ 60») and color (D-16/WAR-01 «< 60») | Pattern 4 | Day-60 devices would show green while the ≤60 filter lists them (or vice versa); planner/user confirms — one constant |
| A3 | CSV column list (header row in Pattern 5) — locked only «полный результат фильтров» + BOM + «;» | Pattern 5 | Columns are discretion; wrong selection = re-run of one task |
| A4 | `q` capped at ~100 chars server-side (mirrors serial max 100) and stripped wildcards escaped | Pattern 1 | None functional; a longer cap is equally safe (LIKE is bound-param) |
| A5 | «Сбросить фильтры» navigates to bare `/devices` (clears everything incl. type) | Pattern 6 | UX nuance only; could preserve type if user prefers |
| A6 | Timing smoke thresholds (e.g. full-filter query < 200 ms @ 500 rows) — generous to avoid flaky fails | Validation | Too-tight thresholds make CI-style runs flaky; measured headroom is ~200x |
| A7 | CSV filename pattern `устройства-YYYY-MM-DD.csv` (+ASCII fallback) | Pattern 5 | Discretion item; cosmetic |

## Open Questions — ALL RESOLVED during planning (2026-09-04)

1. **Warn-boundary wording (A2) — the one real decision** — **(RESOLVED: inclusive 60)**
   - What we know: D-15 preset «истекает ≤ 60 дней»; D-16/WAR-01 «жёлтый < 60 дней»; they diverge only at exactly day 60.
   - What's unclear: which rule the color should use.
   - Recommendation: single `WARRANTY_WARN_DAYS = 60`, inclusive (`days <= 60`) for both so filter results always match highlight colors; flag in plan for user confirmation at review.
   - **RESOLVED:** unified inclusive boundary confirmed (orchestrator resolution 1) — one `WARRANTY_WARN_DAYS = 60`, `days <= 60` for filter AND color; implemented in plan 02 Task 1 (`lib/warranty.ts` + `warrantyPredicate`), consumed by plan 03; pinned by plan-02 must-have edge 8 («a filter hit can never render green»).

2. **Green tone for "ok" warranty (A1)**
   - What we know: apple-design skill mandates palette discipline; D-17 says «один красный», says nothing about green.
   - What's unclear: `#34C759` vs darker text-safe green.
   - Recommendation: `#34C759` for consistency with Apple palette already used (#FF9500/#D70015); revisit only if contrast reads poorly on white.
   - **RESOLVED:** darker contrast-safe green `#248A3D` chosen as `--color-warranty-ok` (checker D3 contrast rec — NOT #34C759); locked as resolution 2, implemented in plan 03 Task 1 (`app/globals.css` @theme), recorded in 05-UI-SPEC.md Default 2.

3. **Does the ≤30 preset include already-expired devices?** — **(RESOLVED: active-only)**
   - What we know: D-15 separates «истекла» from «истекает ≤ N» presets, implying active-only windows.
   - What's unclear: nothing material — but the plan should state the semantics explicitly.
   - Recommendation: active-only (`today ≤ wu ≤ today+N`), per Pattern 4 probe; «истекла» covers the past.
   - **RESOLVED:** active-only semantics confirmed — implemented in plan 02 Task 1 step 2 (`warrantyPredicate`: `isNotNull(warrantyUntil)` + `gte(today)` + `lte(today+N)`); pinned by plan-02 truth edge 9.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | everything | ✓ | v22.23.0 (local dev; Docker image ships node:24) | — |
| better-sqlite3 (UDF API) | Pattern 1 | ✓ | 13.0.3 | SQL replace-chain (verified unnecessary) |
| Drizzle operators (`and/or/like/isNull/ne/gte/lte/lt/isNotNull`) | queries | ✓ | 0.45.2 (all verified exported) | raw `sql` fragments |
| vitest | tests | ✓ | 4.1.11 | — |
| Docker | isolated repro/live verify (port 3001 pattern) | ✓ | 29.6.1 (client running) | `next start` on ephemeral port with temp DB (smoke pattern) |
| playwright | (optional e2e) | ✓ | 1.62.1 (devDep) | existing fetch-based smoke scripts suffice |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.11 (node env) + repo smoke-script pattern (`scripts/smoke-*.mjs`, temp DB + `next start` + minted cookie) |
| Config file | `vitest.config.ts` (exists; `@` alias + server-only stub) |
| Quick run command | `npx vitest run tests/devices-queries.test.ts` |
| Full suite command | `npx vitest run` (STATE.md: live-measure counts, baselines rot) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FIND-01 | substring search across serial/inventory/model, case-insensitive | unit (queries, temp SQLite) | `npx vitest run tests/devices-queries.test.ts -t search` | ❌ extend existing file |
| FIND-02 | chip = laptops with ramUpgraded 0 or NULL | unit | `npx vitest run tests/devices-queries.test.ts -t ram` | ❌ extend |
| FIND-03 | type+status+dept+warranty compose; dept = holder's dept, in-stock excluded, archived holders included | unit | `npx vitest run tests/devices-queries.test.ts` | ❌ extend |
| FIND-04 | homoglyph/whitespace/case tolerance on ALL THREE fields | unit (table-driven fixture) | `npx vitest run tests/device-search.test.ts` | ❌ Wave 0 |
| WAR-01 | warrantyState boundaries + TZ (frozen clocks: MSK 00:30 vs UTC 21:30 prior day; day 0/59/60/61; null) | unit (pure lib) | `npx vitest run tests/warranty.test.ts` | ❌ Wave 0 |
| UI-03 | full combined query stays instant at hundreds | perf unit (timing, generous threshold) + in-test 300–500-row seed | `npx vitest run tests/devices-perf.test.ts` | ❌ Wave 0 |
| CSV (D-18) | BOM + «;» + full filtered result + formula-injection guard + 401-less-redirect behind perimeter | unit (csv escaper) + smoke (route on `next start`, assert first bytes EF BB BF, header row, count) | `npx vitest run` + `node scripts/smoke-csv.mjs` (optional new smoke, port 3118 pattern) | ❌ new |

**FIND-04 fixture (closes the STATE.md blocker):** a table of the 11 documented pairs from `lib/normalize.mjs` (А↔A, В↔B, С↔C, Е↔E, Н↔H, К↔K, М↔M, О↔O, Р↔P, Т↔T, Х↔X). For each pair: insert a device whose serial contains the Latin letter, search with the Cyrillic-typed twin (and the reverse direction once for С/О/Е). Fixture lives in `tests/homoglyphs-fixture.ts`; the test asserts BOTH the per-pair hits and that the fixture covers every key of `HOMOGLYPHS` (guards future additions to the map — if the map grows and the fixture doesn't, the test fails).

**UI-03 measurement approach:** (1) perf unit — seed 300–500 devices in a temp DB inside the test (deterministic, no dev-DB dependence), run `listDevices` with the FULL filter combination, assert wall time < a generous 200 ms (measured headroom: ~0.9 ms — the assertion exists to catch accidental N+1s/unindexed regressions, not to benchmark); (2) expand `scripts/seed.mjs` DEVICE_COUNTS to ~400 total for human/UAT feel (guard 2 keeps it idempotent-by-refusal — reseeding requires deleting the dev DB; note this in the plan); (3) optional HTTP smoke timing via the existing `smoke-devices.mjs` pattern if end-to-end latency proof is wanted.

### Sampling Rate
- **Per task commit:** `npx vitest run tests/devices-queries.test.ts tests/warranty.test.ts` (fast, focused)
- **Per wave merge:** `npx vitest run`
- **Phase gate:** full suite green + build + smoke script(s) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/homoglyphs-fixture.ts` + `tests/device-search.test.ts` — FIND-04 (STATE blocker — do first)
- [ ] `tests/warranty.test.ts` — WAR-01 boundaries + frozen-clock TZ cases
- [ ] `tests/devices-perf.test.ts` — UI-03 timing + in-test bulk seed
- [ ] Extend `tests/devices-queries.test.ts` — FIND-01/02/03 filter matrix (existing temp-DB harness is reused as-is; `db.$client` exposes the UDF since registration happens in `openDb`)
- [ ] Framework install: none needed

## Security Domain

> security_enforcement: true, ASVS Level 1 (config.json). Applicable surface this phase: one new authenticated GET route + untrusted URL params reaching SQL + a downloadable file.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (existing session only) | requireSession pattern unchanged |
| V3 Session Management | no (reused) | jose HttpOnly cookie; proxy verifies |
| V4 Access Control | **yes** | proxy default-deny already covers `api/devices/export` (matcher excludes only `_next/static`, `_next/image`, favicon); route ALSO calls `requireSession()` first (established defense-in-depth) |
| V5 Input Validation | **yes** | `parseDevicesSearchParams`: q via zod max-length + normalize; enums via keystone validators (`isDeviceTypeKey`, exported status keys, WARRANTY_ITEMS); dept via positive-int coerce; LIKE wildcards escaped + params always bound (drizzle) — no string concatenation of user input into SQL anywhere |
| V6 Cryptography | no | none introduced |
| V7 Errors/Logging | yes (light) | CSV route: no internals in responses; unknown params ignored (never 500) — matches existing invalid-type→all behavior |
| CSV Injection (CWE-1236, file-output class) | **yes** | tab-prefix guard on cells starting with `= + - @ TAB CR` (OWASP-recommended); verified against OWASP CSV Injection page |

### Known Threat Patterns for this stack/phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated CSV bulk exfiltration | Information Disclosure | proxy perimeter + requireSession-first in route (both layers already exist — just don't skip them) |
| SQL injection via search `q` | Tampering | drizzle bound params only; `sql` template interpolations are column refs, never user strings |
| LIKE wildcard abuse (`%`) | DoS (marginal) / correctness | escape `\ % _` + `ESCAPE '\'`; q length cap |
| Formula injection in exported file | Tampering/Elevation (on analyst's machine) | tab-prefix escaper (Pattern 5) |
| MIME confusion / downloaded-file sniffing | Tampering | `Content-Type: text/csv; charset=utf-8` + `X-Content-Type-Options: nosniff` + `attachment` disposition |
| Reflected XSS via `q` echoed in empty-state copy | Tampering | React auto-escapes; hint copy is static text, `q` is never rendered raw as HTML |

## Sources

### Primary (HIGH confidence)
- Live probes this session against the project's installed better-sqlite3 13.0.3 + drizzle-orm 0.45.2 (temp DBs): UDF fold+LIKE semantics, Cyrillic folding, NULL≠1, warranty boundaries, Drizzle `sql` emission, Date operands, 0.9 ms @ 500 rows
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`, `use-router.md` (push/replace `scroll:false`), `03-file-conventions/route.md` (Response/streams) — bundled authoritative docs for the EXACT installed Next 16.3.3 (per AGENTS.md directive)
- Project code (read in full this session): `db/queries/devices.ts`, `db/schema.ts`, `db/index.ts`, `db/queries/movements.ts`, `lib/normalize.mjs`, `lib/device-schema.ts`, `lib/ru.ts`, `lib/movement-schema.ts` (CR-01 fix), `app/(app)/devices/page.tsx`, `type-filter.tsx`, device/employee card pages, `app/api/attachments/[attachmentId]/route.ts`, `proxy.ts`, `scripts/seed.mjs`, `scripts/smoke-devices.mjs`, `tests/devices-queries.test.ts`, `tests/helpers.ts`
- Project decisions: `.claude/CLAUDE.md` stack patterns (CSV BOM + «;» + RFC 5987 — pre-adopted by this project), 05-CONTEXT.md D-01..D-18, PROJECT.md (CR-01 lesson)

### Secondary (MEDIUM confidence)
- [OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection) + [OWASP WSTG §4.7.21](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/21-Testing_for_CSV_Injection) + [CWE-1236](https://cwe.mitre.org/data/definitions/1236.html) — formula-injection mitigations (tab-prefix vs apostrophe)
- [MDN Content-Disposition](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Disposition) — `filename*` RFC 5987 shape, dual-parameter compatibility guidance

### Tertiary (LOW confidence)
- None — all load-bearing claims were verified or cited; UX-shape recommendations (replace-vs-push, debounce ergonomics) are judgment within locked D-01 latitude, tagged A2/A5/A7 where they harden into claims.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; every operator/API verified against installed versions
- Architecture: HIGH — extends an in-repo pattern (type-filter/page/listDevices) rather than introducing one; UDF + where-builder probe-verified end-to-end
- Pitfalls: HIGH — each pitfall either reproduced in a probe (NULL≠1, ASCII-only folding, tz), read from project history (CR-01, combobox, React 19 resets), or sourced from OWASP/MDN

**Research date:** 2026-09-04
**Valid until:** 2026-10-04 (stable installed stack; no fast-moving surface)
