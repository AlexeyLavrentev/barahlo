# Phase 5: Search & Filters - Pattern Map

**Mapped:** 2026-09-04
**Files analyzed:** 20 (7 new UI files, 2 new lib files, 1 new API route, 5 extensions, 5 test files)
**Analogs found:** 20 / 20 (17 exact or role-match; 3 partial — core mechanic has no in-repo precedent, see «No Analog Found»)

**Location correction:** `listIssuedByEmployee` lives in `db/queries/movements.ts` (line 389), NOT `db/queries/employees.ts` as one upstream note said. RESEARCH.md has it right.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/(app)/devices/page.tsx` (EXTEND) | component (RSC page) | request-response | itself (current code) | exact (self-extension) |
| `app/(app)/devices/query-params.ts` (NEW) | utility (pure parse/build) | request-response | `lib/device-schema.ts` + `page.tsx` `buildQuery` | role-match |
| `app/(app)/devices/search-box.tsx` (NEW) | component (client island) | event-driven | `type-filter.tsx` (island shell only) | partial — debounce is new |
| `app/(app)/devices/filter-bar.tsx` (NEW) | component (server composition) | request-response | `page.tsx` lines 70–74 (filter wrapper) | role-match |
| `app/(app)/devices/status-filter.tsx` (NEW) | component (client island Select) | request-response | `type-filter.tsx` | exact |
| `app/(app)/devices/department-filter.tsx` (NEW) | component (client island Select) | request-response | `type-filter.tsx` + `employees.ts listDepartments` | exact |
| `app/(app)/devices/warranty-filter.tsx` (NEW) | component (client island Select) | request-response | `type-filter.tsx` | exact |
| `app/(app)/devices/ram-chip.tsx` (NEW) | component (client island chip) | event-driven | `type-filter.tsx` + `components/ui/button.tsx` | role-match |
| `lib/warranty.ts` (NEW) | utility (pure date math) | transform | `lib/movement-schema.ts` (zonedParts/CR-01) + `lib/ru.ts` | role-match |
| `WarrantyDate` (`lib/warranty-date.tsx`) (NEW) | component (server) | transform | employee-card issued line 2 + device-card `Value`/`StatusPill` | role-match |
| `app/api/devices/export/route.ts` (NEW) | route (API handler) | file-I/O (download) | `app/api/attachments/[attachmentId]/route.ts` | role-match — body building is new |
| `db/queries/devices.ts` `listDevices`+`exportDevices` (EXTEND) | service (queries module) | CRUD | itself + `employees.ts` (ruSortKey) | exact (self-extension) |
| `db/queries/movements.ts` `listIssuedByEmployee` (EXTEND) | service (queries module) | CRUD | itself (lines 389–429) | exact |
| `db/index.ts` — register `norm` UDF (EXTEND) | config (connection setup) | CRUD | itself (`openDb`) | exact — UDF call itself is new |
| `app/globals.css` — 2 warranty tokens (EXTEND) | config (design tokens) | — | itself (`@theme` block, lines 54–68) | exact |
| `scripts/seed.mjs` (EXTEND to ~400 devices) | migration/fixture | batch | itself (`DEVICE_COUNTS`, line 147) | exact |
| `tests/devices-queries.test.ts` (EXTEND) | test | CRUD | itself (temp-DB harness) | exact |
| `tests/warranty.test.ts` (NEW) | test (pure lib, frozen clocks) | transform | `tests/movement-schema.test.ts` | role-match |
| `tests/device-search.test.ts` + `tests/homoglyphs-fixture.ts` (NEW) | test | CRUD | `tests/devices-queries.test.ts` harness + `lib/normalize.mjs` HOMOGLYPHS | role-match |
| `tests/devices-perf.test.ts` (NEW) | test (timing smoke) | batch | `tests/devices-queries.test.ts` harness | role-match |

## Pattern Assignments

### `app/(app)/devices/page.tsx` (component, request-response) — EXTEND

**Analog:** itself. The phase-3 page is the direct extension point; every new behavior clones a block already in this file.

**Imports pattern** (lines 1–14) — new islands/`query-params`/`WarrantyDate` join these relative + `@/` imports:
```typescript
import { requireSession } from '@/lib/auth'
import { listDevices } from '@/db/queries/devices'
import { DEVICE_TYPES, deviceStatusLabel, deviceTypeName, isDeviceTypeKey } from '@/lib/device-schema'
import { pluralDevices } from '@/lib/ru'
import { DeviceDialog } from './device-dialog'
import { DeviceTypeFilter } from './type-filter'
```

**searchParams validation pattern** (lines 40–53) — the template `query-params.ts` replaces; note the "validate, never trust" comment discipline:
```typescript
await requireSession() // defense-in-depth: proxy + in-app guard
const sp = await searchParams
// searchParams is untyped user input — validate, never trust (T-03-04)
const type = isDeviceTypeKey(sp.type) ? sp.type : 'all'
const parsedPage = Number(sp.page)
const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
const { rows, total, page: current, pages } = listDevices({ type, page, pageSize: PAGE_SIZE })
```

**buildQuery — full-query-string pattern** (lines 26–33) — moves INTO `query-params.ts` as `buildDevicesQuery`, then pagination links (lines 176, 189) and the CSV `<a>` href all call it:
```typescript
function buildQuery(type: string, page: number): string {
  const params = new URLSearchParams()
  if (type !== 'all') params.set('type', type)
  params.set('page', String(page))
  return `?${params.toString()}`
}
```

**Filter-bar slot** (lines 70–74) — replaced by `<FilterBar …/>` composition:
```tsx
{/* Type filter (D-05): dropdown island, full-query-string push, page reset to 1. */}
<div className="mt-6">
  <DeviceTypeFilter current={type} />
</div>
```

**Subtitle (D-05 site)** (line 62) — conditionally becomes «Найдено: …»:
```tsx
<p className="text-sm text-ink-secondary">{pluralDevices(total)}</p>
```

**Row line 2 (WAR-01 site 1)** (lines 145–155) — the warranty segment appends after the holder, same `' · '` join shape:
```tsx
<span className="mt-0.5 block truncate text-sm text-ink-secondary">
  {deviceTypeName(row.typeKey)}
  {' · '}
  <span className="font-mono">{row.serialNumber}</span>
  {' · '}
  <span className="font-mono">{row.inventoryNumber ?? '—'}</span>
  {' · '}
  {row.holder ?? '—'}
</span>
```

**Empty-state card recipe + precedence** (lines 76–100) — third state («Ничего не найдено» + hint + reset Link) joins this ternary; copy verbatim from UI-SPEC copywriting table; «Сбросить фильтры» is a plain `<Link href="/devices">` (server, no island):
```tsx
<div className="mt-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-hairline">
  {type === 'all' ? (
    <><h2 className="text-xl font-semibold tracking-tight text-ink">Пока нет устройств</h2>
      <p className="mt-1 text-sm text-ink-secondary">Добавьте первое устройство — выберите тип и заполните поля.</p></>
  ) : (
    <><h2 className="text-xl font-semibold tracking-tight text-ink">Нет устройств этого типа</h2>
      <p className="mt-1 text-sm text-ink-secondary">Добавьте устройство этого типа или выберите другой фильтр.</p></>
  )}
</div>
```

---

### `app/(app)/devices/query-params.ts` (utility, request-response) — NEW

**Analog:** `lib/device-schema.ts` for module conventions + `page.tsx buildQuery` for the builder half.

**Pure-module convention** (`lib/device-schema.ts` lines 9–12) — copy the header discipline verbatim (this module is imported by BOTH the RSC page and client islands, so it must stay framework-free and function-only):
```
// Pure and immutable: no framework imports, no module-level mutable state
// (vercel server-no-shared-module-state) — safe to import from RSC, actions
// and vitest alike.
```

**Enum-guard pattern** (`lib/device-schema.ts` lines 91–96) — template for `isDeviceStatusKey` / warranty-preset guards:
```typescript
export function isDeviceTypeKey(value: unknown): value is DeviceTypeKey {
  return (
    typeof value === 'string' &&
    (DEVICE_TYPE_KEYS as readonly string[]).includes(value)
  )
}
```
NOTE (RESEARCH.md): status keys are currently NOT exported as a set — `DEVICE_STATUS_LABELS` is a private const (lines 108–113). This phase must export `DEVICE_STATUS_KEYS` (or an `isDeviceStatusKey`) from `lib/device-schema.ts`; filters read the keystone (D-02), never a parallel list.

**zod-coerce guard pattern** (card pages, e.g. `devices/[id]/page.tsx` lines 34–36) — for `departmentId`/`page` coercion:
```typescript
const IdSchema = z.coerce.number().int().positive()
```

---

### `app/(app)/devices/search-box.tsx` (component island, event-driven) — NEW

**Analog:** `type-filter.tsx` (full file, 55 lines) — the only existing client island driving URL state. Island shell, `useRouter`, and push discipline copy from here; the debounce/replace/useTransition mechanics have NO in-repo precedent (see No Analog Found → RESEARCH.md Pattern 3).

**Island shell + full-query push pattern** (`type-filter.tsx` lines 1–10, 25–38):
```tsx
'use client'

import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function DeviceTypeFilter({ current }: { current: string }) {
  const router = useRouter()
  return (
    <Select
      items={FILTER_ITEMS}
      value={current}
      onValueChange={(value) => {
        if (typeof value !== 'string') return
        // FULL query string rebuild — a bare page param would drop the filter.
        const params = new URLSearchParams()
        if (value !== 'all') params.set('type', value)
        params.set('page', '1')
        router.push(`?${params.toString()}`)
      }}
    >
```
Key properties to preserve in all five new islands: `'use client'` first line; receives only flat serializable props (`current`, a plain `filters` object — never functions); imports `buildDevicesQuery` from `query-params.ts` itself (server-serialization rule); `onValueChange`/click → `router.push` with FULL query string + `page=1` (Pitfall 10). The search box alone uses `router.replace(href, { scroll: false })` inside `startTransition` (typing must not flood history or scroll).

---

### `app/(app)/devices/filter-bar.tsx` (component, server composition) — NEW

**Analog:** `page.tsx` lines 70–74 (the wrapper it replaces) and the employee card's pattern of a server component calling queries and passing flat data to islands (`employees/[id]/page.tsx` lines 39–41, 141–149 — e.g. `departments={listDepartments()}`).

**Server-feeds-island pattern** (`employees/[id]/page.tsx` lines 39–41 + 143):
```tsx
function IssuedSection({ employeeId }: { employeeId: number }) {
  const issued = listIssuedByEmployee(employeeId)
```
```tsx
<EmployeeDialog label="Редактировать" departments={listDepartments()} employee={{ … }} />
```
FilterBar follows this: a server component that calls `listDepartments()` once, receives `filters` from the page, and renders `DeviceSearchBox`, four Selects, `RamChip` and the CSV `<a>` inside `mt-6 flex flex-wrap items-center gap-2`. No client wrapper, no state.

---

### `status-filter.tsx` / `department-filter.tsx` / `warranty-filter.tsx` (component islands) — NEW

**Analog:** `type-filter.tsx` — exact clone per control. Differences only: FILTER_ITEMS source, `aria-label`, trigger width.

**Options-list-as-const pattern** (`type-filter.tsx` lines 17–23):
```tsx
const FILTER_ITEMS = [
  { value: 'all', label: 'Все типы' },
  { value: 'laptop', label: 'Ноутбуки' },
  ...
] as const
```
- Status: build from the NEW `DEVICE_STATUS_KEYS` + `deviceStatusLabel` (keystone, D-02).
- Department: `[{ value: 'all', label: 'Все отделы' }, ...listDepartments().map(d => ({ value: String(d.id), label: d.name }))]` — `listDepartments()` already RU-sorts (`employees.ts` lines 86–97).
- Warranty: `WARRANTY_ITEMS` presets live in `query-params.ts` (single source for island + parser + tests).
- Trigger widths per UI-SPEC: `h-10 w-full px-3 text-sm text-ink-secondary sm:w-40` (гарантия `sm:w-48`); `aria-label` «Фильтр по статусу/отделу/гарантии».

**`listDepartments` analog** (`db/queries/employees.ts` lines 86–97) — exists, reuse as-is:
```typescript
export function listDepartments(): DepartmentRow[] {
  return db.select({ id: departments.id, name: departments.name })
    .from(departments)
    .orderBy(sql`replace(replace(${departments.name}, 'Ё', 'Е'), 'ё', 'е')`, asc(departments.id))
    .all()
}
```

---

### `app/(app)/devices/ram-chip.tsx` (component island, event-driven) — NEW

**Analog:** `type-filter.tsx` (island + query-push mechanics) + `components/ui/button.tsx` (press feedback + variant vocabulary).

**Chip visuals** (`components/ui/button.tsx` lines 10–22): global press rule `active:scale-[0.97] duration-100 ease-out` is in the button base; secondary/neutral styling vocabulary. Per UI-SPEC: pill `h-10 px-3 rounded-full`; inactive `bg-black/5 text-ink-secondary`, hover `text-ink`; active `bg-ink text-white` (neutral-strong — NOT accent); `aria-pressed` carries state. Coupling (D-08): click builds the query via `buildDevicesQuery` — activate writes `type=laptop` + ram param; deactivate drops ram, keeps `type=laptop`; server predicate self-limits to laptops regardless.

---

### `lib/warranty.ts` (utility, transform) — NEW

**Analog:** `lib/movement-schema.ts` — the CR-01 wall-clock recipe (commit `1a31814`) lives at lines 44–66; `lib/ru.ts` for module header + `DISPLAY_TZ`.

**Pure-module header** (`lib/ru.ts` lines 1–3):
```
// Russian UI text helpers (UI-01). Pure named exports over Node built-ins
// only — same convention as lib/normalize.ts: no framework imports, no side
// effects, safe to import from RSC, client components and vitest alike.
```

**TZ constant** (`lib/ru.ts` line 47): `export const DISPLAY_TZ = 'Europe/Moscow'` — import it, never re-declare.

**CR-01 wall-clock parts recipe** (`lib/movement-schema.ts` lines 44–66) — the exact shape `displayTodayUtc()` must follow (extract or replicate; note the injectable-`now` discipline on `isNotFutureDate`, lines 74–81, which makes frozen-clock tests possible):
```typescript
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', // midnight is 0, never 24
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPart['type']): number =>
    Number(parts.find((part) => part.type === type)!.value)
  return { year: get('year'), month: get('month'), day: get('day'), /* … */ }
}

export function isNotFutureDate(iso: string, now: Date = new Date()): boolean {
  const today = zonedParts(now, DISPLAY_TZ)  // DISPLAY_TZ wall clock, not server clock (CR-01)
  ...
}
```

**UTC-midnight date-only convention** (`devices/[id]/page.tsx` lines 38–42) — why day-level UTC comparisons are exact:
```
// Module-level formatters (server-hoist-static-io): one Intl instance per
// process, not per render. Dates are stored as UTC-midnight timestamps —
// formatting in UTC keeps the rendered calendar day equal to the yyyy-mm-dd
// the form wrote, on any host timezone.
```

---

### `WarrantyDate` component (server component, transform) — NEW

**Analog:** the employee card's issued-list line-2 segments (`employees/[id]/page.tsx` lines 69–82) for list-site shape, and the device card's `Value`/`FieldRow` (`devices/[id]/page.tsx` lines 136–153) for the card site + missing-value rule.

**List-site segment shape** (`employees/[id]/page.tsx` lines 74–82) — WarrantyDate appends here after adding `warrantyUntil` to the query:
```tsx
<span className="mt-0.5 block truncate text-sm text-ink-secondary">
  <span className="font-mono">{device.serialNumber}</span>
  {device.issuedAt ? (
    <>{' · выдано '}{occurredDateFormat.format(device.issuedAt)}</>
  ) : null}
</span>
```

**Missing-value rule** (`devices/[id]/page.tsx` lines 147–153) — `warrantyUntil = null` → «—» on card, segment omitted in lists:
```tsx
function Value({ value, mono }: { value: string | null; mono?: boolean }) {
  if (value === null || value === '') {
    return <span className="text-ink-secondary">—</span>
  }
  return <span className={mono ? 'font-mono text-sm' : undefined}>{value}</span>
}
```

**Card site it replaces** (`devices/[id]/page.tsx` lines 298–301) — swap `<Value value={dateValue(...)} />` for the colored WarrantyDate value:
```tsx
{/* No warranty coloring — semantics are WAR-01/Phase 5 (UI-SPEC). */}
<FieldRow label="Гарантия до">
  <Value value={dateValue(device.warrantyUntil)} />
</FieldRow>
```

**Color precedent (text-class swap only):** `StatusPill` (`devices/[id]/page.tsx` lines 160–172) shows the one-tinted-exception discipline (`text-destructive` for disposed). WarrantyDate follows it: `text-warranty-ok` / `text-warranty-warn` / `text-destructive`, text color only — never bold, never a pill. Card site uses `dateFormat` (UTC, line 42) for dd.mm.yyyy.

---

### `app/api/devices/export/route.ts` (route handler, file-I/O) — NEW

**Analog:** `app/api/attachments/[attachmentId]/route.ts` — the repo's only file-serving route; copy its auth ordering, untrusted-param handling, and response-header discipline.

**requireSession-first pattern** (lines 8–13 comment, 44–48 code):
```typescript
// requireSession() is the FIRST statement of both handlers (V3 defense-in-depth
// on top of the proxy perimeter).
export async function GET(request: NextRequest, …) {
  await requireSession()
```

**Untrusted-input gate + typed failure pattern** (lines 16–25, 52–58): zod-coerce every param before use; known codes → statuses; never echo internals:
```typescript
const IdSchema = z.coerce.number().int().positive()
...
if (!id.success || deviceId === null) {
  return jsonError('ATTACHMENT_NOT_FOUND', 404)
}
```

**Response-headers pattern** (lines 80–92) — the CSV response mirrors this shape (hardcoded type, nosniff; swap `inline`→`attachment` + `no-store`):
```typescript
return new Response(new Uint8Array(bytes), {
  headers: {
    'Content-Type': 'image/jpeg',            // hardcoded, never echoed from input (V5)
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  },
})
```
Body building (BOM + `;` + RFC-4180 escaper + formula-injection tab-prefix + RFC 5987 `filename*`) has NO in-repo precedent — use RESEARCH.md Pattern 5 verbatim (project stack patterns in CLAUDE.md pre-adopt BOM + `;` + RFC 5987).

---

### `db/queries/devices.ts` — `listDevices` filters + `exportDevices` (service, CRUD) — EXTEND

**Analog:** itself (lines 104–179) + `employees.ts` (module contract, ruSortKey).

**Module contract** (lines 7–9) — preserved as filters are added:
```
// Device data-access (REG-01/REG-02). Pure sync functions over the module-level
// db — no framework imports at all: Server Actions add session + zod on top,
// vitest imports this module directly against a temp database.
```

**THE extension point — where-once/use-twice** (lines 118–143). The new predicates slot into the existing `where` const; count query AND rows query already share it (Pitfall 5 property to keep). Note `leftJoin(employees, …)` at line 138 already exists — the D-09 department predicate (`eq(employees.departmentId, filters.departmentId)`) rides it; in-stock NULL-holder rows drop out automatically:
```typescript
const where = type === 'all' ? undefined : eq(devices.typeKey, type)
const total = db.select({ value: count() }).from(devices).where(where).get()!.value
const pages = Math.max(1, Math.ceil(total / pageSize))
const current = Math.min(Math.max(1, page), pages) // Clamp — never render a page beyond the last
const rows = db.select({ …, holder: employees.name })
  .from(devices)
  .leftJoin(employees, eq(devices.currentEmployeeId, employees.id))
  .where(where)
  .orderBy(ruSortKey, asc(devices.id))
  .limit(pageSize).offset((current - 1) * pageSize).all()
```
Rows type gains `warrantyUntil: devices.warrantyUntil` (already on `DeviceRow`, line 29 — add to the `listDevices` select, lines 128–136) so `<WarrantyDate>` can render per row.

**RU-sort recipe (keep unchanged, D-03)** (line 71):
```typescript
const ruSortKey = sql`replace(replace(${devices.model}, 'Ё', 'Е'), 'ё', 'е')`
```

**Normalization on write — the twin the search compares against** (lines 216–219, 95–102): serials/inventories are stored normalized; the search predicate compares `serial_normalized`/`inventory_normalized` columns directly (never raw):
```typescript
serialNormalized: normalizeSerial(input.serialNumber),
...inventoryPair(input.inventoryNumber),
```

**Operator precedent for `and()` composition** (line 154): `and(inArray(attachments.deviceId, …), eq(attachments.kind, 'photo'))` — the batched-covers block (lines 144–169) must survive the where-extension untouched.

---

### `db/queries/movements.ts` — `listIssuedByEmployee` + warrantyUntil (service, CRUD) — EXTEND

**Analog:** itself (lines 34–39 type, 389–429 function).

**Current select — add ONE field (Pitfall 9)** (lines 389–404):
```typescript
export function listIssuedByEmployee(employeeId: number): IssuedDeviceView[] {
  const issued = db
    .select({
      id: devices.id,
      model: devices.model,
      serialNumber: devices.serialNumber,
      // ADD: warrantyUntil: devices.warrantyUntil  ← WAR-01 site 3
    })
    .from(devices)
    .where(and(eq(devices.currentEmployeeId, employeeId), eq(devices.status, 'assigned')))
    .orderBy(ruSortKey, asc(devices.id))
    .all()
```
Plus widen `IssuedDeviceView` (lines 34–39) with `warrantyUntil: Date | null`. No migration — the column exists on `devices`.

---

### `db/index.ts` — `norm()` UDF registration (config) — EXTEND

**Analog:** itself (lines 10–19) — the pragmas block is exactly where `sqlite.function('norm', { deterministic: true }, normalizeNumber)` goes, before `return drizzle(sqlite)`:
```typescript
function openDb(): DrizzleDb {
  const file = process.env.DATABASE_PATH ?? './data/app.db'
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')  // SQLite default is OFF — per connection!
  sqlite.pragma('busy_timeout = 5000')
  // ← register UDF here (RESEARCH Pattern 1; probe-verified)
  return drizzle(sqlite)
}
```
The Proxy singleton (lines 29–34) means `db.$client` exposes the UDF to tests automatically (harness comment, `tests/devices-queries.test.ts` lines 8–11). The UDF function itself has no precedent — RESEARCH.md Pattern 1 (live-probed this session).

**Normalizer being registered** (`lib/normalize.mjs` lines 8–25) — byte-identical fold on write and search; HOMOGLYPHS map (lines 8–20) is the fixture source for FIND-04:
```javascript
const HOMOGLYPHS = { 'А':'A', 'В':'B', 'С':'C', 'Е':'E', 'Н':'H', 'К':'K', 'М':'M', 'О':'O', 'Р':'P', 'Т':'T', 'Х':'X' }
export function normalizeNumber(input) {
  const upper = input.trim().replace(/\s+/g, ' ').toUpperCase()
  return [...upper].map((ch) => HOMOGLYPHS[ch] ?? ch).join('')
}
```

---

### `app/globals.css` — warranty tokens (config) — EXTEND

**Analog:** itself, the literal-hex `@theme` block (lines 54–68). Add exactly two tokens there; «истекла» reuses `--color-destructive` (already `#D70015`, line 67):
```css
@theme {
  --color-page: #F5F5F7; /* 60% — page background, row hover fill */
  --color-surface: #FFFFFF; /* 30% — cards, bars, dialogs */
  --color-ink: #1D1D1F; /* text primary */
  --color-ink-secondary: #6E6E73; /* text secondary */
  --color-hairline: #D2D2D7; /* 1px borders */
  --color-accent: #0071E3; /* reserved: primary CTA, focus ring, combobox */
  --color-destructive: #D70015; /* reserved (Phase 4 «Списать») */
  /* ADD per 05-UI-SPEC Color:
     --color-warranty-ok: #248A3D;   (checker D3 rec — AA on white)
     --color-warranty-warn: #FF9500; (locked D-17)                       */
}
```
Comment discipline: each token carries its UI-SPEC rationale inline — follow it.

---

### `scripts/seed.mjs` — expand to hundreds (fixture, batch) — EXTEND

**Analog:** itself. The only edit is the counts line (147); everything else scales mechanically (serial uniqueness via run number, deterministic mulberry32):
```javascript
const DEVICE_COUNTS = { laptop: 40, monitor: 15, dock: 10, peripheral: 15 }  // → e.g. 200/80/50/70
```
Existing guards to respect (lines 8–24): refuses production and refuses a non-empty DB (idempotent-by-refusal — reseeding requires deleting the dev DB; note in plan). Warranty spread already exists (line 106: `warrantyUntil = purchaseDate + pick([1,2,3]) * YEAR`) — with ~400 rows and dates up to 2026-08-31, expired/expiring/ok states occur naturally; verify spread covers all four warranty states and homoglyph-friendly Cyrillic models (`Ugreen 9-в-1`, line 64) for search UAT.

---

### `tests/devices-queries.test.ts` (test, CRUD) — EXTEND

**Analog:** itself (harness, lines 1–25). New filter tests reuse it verbatim — set `DATABASE_PATH` BEFORE importing `@/db`, dynamic imports, `applyMigrations(db.$client)`:
```typescript
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-devices-'))
process.env.DATABASE_PATH = join(tmpDir, 'devices.db')
const { db } = await import('@/db')
applyMigrations(db.$client)
const queries = await import('@/db/queries/devices')
```
`tests/helpers.ts` `insertDevice` (lines 48–65) seeds minimal rows; extend its overrides to cover `warrantyUntil`, `ramUpgraded`, `currentEmployeeId`/`type_key` for filter fixtures. Homoglyph-duplicate precedent (lines 67–76) shows the С↔Х style assertions the FIND-04 fixture generalizes.

### `tests/warranty.test.ts` (NEW), `tests/device-search.test.ts` + `homoglyphs-fixture.ts` (NEW), `tests/devices-perf.test.ts` (NEW)

**Analog:** `tests/movement-schema.test.ts` frozen-clock pattern (lines 17–22, 60) — pinned instants named by their MSK wall time, plus `vi.setSystemTime`:
```typescript
const MSK_0030 = new Date('2026-09-02T21:30:00.000Z')  // UTC instant ≠ MSK calendar day
const MSK_1500 = new Date('2026-09-03T12:00:00.000Z')
it('full schema path with vi.setSystemTime frozen at 01:00 MSK: «today» parses', …)
```
Warranty tests pass `now` explicitly (the `isNotFutureDate` injectable-`now` discipline) around boundaries: day 0, 59, 60, 61, expired, null; MSK 00:30 (UTC previous day). Search tests reuse the queries harness; perf test seeds 300–500 rows in-test and asserts a generous wall-time ceiling (RESEARCH A6: measured 0.9 ms, assert < 200 ms).

---

## Shared Patterns

### URL-driven filter state (full query string, page=1)
**Source:** `app/(app)/devices/page.tsx` lines 26–33 (`buildQuery`), `type-filter.tsx` lines 31–38 (`onValueChange` push)
**Apply to:** every island (search/selects/chip), pagination links, CSV `<a>` href; `buildDevicesQuery` in `query-params.ts` becomes the single builder all of them call. The URL is the only filter state — no client store.

### Server-side param validation, never trust
**Source:** `page.tsx` lines 40–48; `lib/device-schema.ts` `isDeviceTypeKey` (91–96); card pages `IdSchema` (`z.coerce.number().int().positive()`)
**Apply to:** `parseDevicesSearchParams` (q length cap, enums → degrade to «all», dept positive-int) and the CSV route's use of the SAME parser. Invalid values normalize, never 500.

### Auth: requireSession() as first statement
**Source:** `page.tsx` line 40; `app/api/attachments/[attachmentId]/route.ts` lines 44–48
**Apply to:** the CSV route (defense-in-depth on top of the `proxy.ts` default-deny perimeter that already covers `api/*`).

### Pure lib modules: no framework imports, injectable clock
**Source:** `lib/ru.ts` lines 1–3; `lib/device-schema.ts` lines 9–12; `lib/movement-schema.ts` `zonedParts`/`isNotFutureDate` (44–81)
**Apply to:** `lib/warranty.ts`, `query-params.ts` — importable from RSC, islands and vitest alike; islands get flat serializable props only (server-serialization).

### Queries modules: pure sync functions, one where shared by count+rows, ruSortKey
**Source:** `db/queries/devices.ts` lines 7–9, 71, 118–143; `db/queries/employees.ts` lines 5–8, 34, 86–97
**Apply to:** `listDevices` extension + `exportDevices` (same where-builder, no limit/offset) + `listIssuedByEmployee` select widening. Sort stays `ruSortKey, asc(id)` (D-03).

### Write-side normalization = search-side fold
**Source:** `lib/normalize.mjs` `normalizeNumber` (22–25); `db/queries/devices.ts` write sites (216–219); schema UNIQUE indexes (`db/schema.ts` lines 97–98)
**Apply to:** the `norm()` UDF registration and the search predicate — the UDF IS the same function, so folds cannot diverge; never an SQL replace-chain or second TS normalizer.

### Tokens in the literal-hex @theme; one red in the system
**Source:** `app/globals.css` lines 54–68; `StatusPill` (`devices/[id]/page.tsx` 160–172)
**Apply to:** warranty-ok/warn tokens; «истекла» reuses `--color-destructive` (D-17); accent untouched this phase.

## No Analog Found

Files whose core mechanic has no in-repo precedent (planner should use RESEARCH.md patterns — all probe-verified this session):

| File | Role | Data Flow | Missing precedent | Research pattern |
|------|------|-----------|-------------------|------------------|
| `app/(app)/devices/search-box.tsx` | component island | event-driven | No debounced input exists; `type-filter.tsx` supplies only the island shell. Debounce 300 ms + `router.replace(scroll:false)` + `useTransition` + `value === q` guard is new (React 19: NOT a `<form action>`) | Pattern 3 |
| `db/index.ts` UDF call | config | CRUD | No `sqlite.function()` usage anywhere; registration SITE is exact (openDb pragmas block) | Pattern 1 (live probe: Cyrillic «с123»→«C123», 0.9 ms @ 500 rows) |
| `app/api/devices/export/route.ts` body | route | file-I/O | No export/download route; auth+headers copy from attachments route, but RFC-4180 escaper + BOM + `;` + formula-injection guard + RFC 5987 `filename*` are new (stack patterns pre-adopt the shape) | Pattern 5 |

## Metadata

**Analog search scope:** `app/(app)/devices/`, `app/(app)/(card)/`, `app/api/`, `db/queries/`, `db/index.ts`, `lib/`, `components/ui/`, `scripts/`, `tests/`
**Files scanned:** ~25 (20 read in full, 5 grepped/located)
**Pattern extraction date:** 2026-09-04
