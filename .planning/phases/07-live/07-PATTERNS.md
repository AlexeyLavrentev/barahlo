# Phase 7: Live-поиск по сотрудникам - Pattern Map

**Mapped:** 2026-09-15
**Files analyzed:** 7 (4 new, 3 modified)
**Analogs found:** 7 / 7 — every file has an exact in-repo analog (phase 5 shipped the same mechanism for devices)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/use-search-param.ts` (hook, name/path = discretion) | hook | request-response (client push → URL → RSC swap) | `app/(app)/devices/search-box.tsx` (lines 33–140: body moves verbatim) | exact |
| `app/(app)/employees/search-box.tsx` | component (client island) | request-response | `app/(app)/devices/search-box.tsx` (island conventions) + `devices/filter-bar.tsx` (mounting) | exact |
| `app/(app)/employees/query-params.ts` | utility (URL parse/build) | request-response | `app/(app)/devices/query-params.ts` | exact |
| `db/queries/employees.ts` | model (data access) | CRUD (filtered list + count) | `db/queries/devices.ts` (`searchPredicate` + `deviceWhere` + `listDevices`) | exact |
| `app/(app)/employees/page.tsx` | route (RSC page) | request-response | own current code + `app/(app)/devices/page.tsx` (parse, empty states) | exact |
| `app/(app)/devices/search-box.tsx` | component (client island, REFACTOR) | request-response | itself — body moves to the hook verbatim (D-07: no rewrite) | exact |
| `tests/employee-search.test.ts` | test | batch (temp-SQLite fixtures) | `tests/device-search.test.ts` | exact |

**No Analog Found:** none.

## Pattern Assignments

### `lib/use-search-param.ts` — hook `useDebouncedSearchQuery` (hook, request-response)

**Analog:** `app/(app)/devices/search-box.tsx` — the hook owns everything except the `<input>` render.

**D-07 hard rule:** the reconciliation logic is moved **verbatim** — its correctness was bought with two UAT-caught race bugs (G-5-1 keystroke loss: commit 74eb0d9; G-5-2 eaten space: 42ebf57). Do not "improve" it.

**Hook state block to move** (lines 33–49):
```typescript
const router = useRouter()
const [value, setValue] = useState(q)
const [, startTransition] = useTransition()
const mounted = useRef(false)
// The last q the server actually holds (CR-01 reconciliation anchor).
// Stamped when a push LEAVES (inside the debounce callback / commitNow),
// not when the debounce arms — ... (the G-5-1 keystroke loss).
const lastSynced = useRef(q)
// Values we pushed whose echo has not returned yet (G-5-1): ... shift-capped to bound stuck entries.
const inFlight = useRef<string[]>([])
const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
```

**Reconciliation effect to move verbatim** (lines 51–120). Critical invariants preserved in source comments:
- line 67: own-echo detection `inFlight.current.findIndex((p) => q === p || q === p.trim())` — absorbs the server's trim echo (G-5-2)
- lines 76–93: clean-input adoption of externally-changed q («Сбросить поиск», Back/Forward); dirty input never adopts (G-5-1)
- lines 101–111: push-time stamping — `inFlight.push(value)` → cap 4 → `lastSynced.current = value` **inside** the 300 ms callback, then `startTransition(() => router.replace(..., { scroll: false }))`
- line 120: effect deps — `}, [value, q, current, router])` — the hook's deps must keep this shape: `[value, q, target, buildQuery]`

**commitNow to move verbatim** (lines 122–140): clears the timer, same push-time stamping, same `router.replace`.

**Recommended API shape (RESEARCH Pattern 2 — planner decides final signature, but the dependency semantics are fixed):**
```typescript
// buildQuery MUST be a stable module-level reference imported by the island
// itself — never a prop (functions are not serializable across the RSC
// boundary, see devices/query-params.ts header comment lines 13–17).
export function useDebouncedSearchQuery<Q extends { q: string }>(args: {
  q: string                    // validated echo from the server (page prop)
  target: Omit<Q, 'q'>         // builder inputs minus q (devices: current filters; employees: { filter })
  buildQuery: (f: Q) => string // stable module import
}): { value: string; setValue: (v: string) => void; commitNow: () => void }
// The push inside the hook: buildQuery({ ...target, q: value }) — the same
// spread-override shape as devices today (line 107/136). Anti-pattern
// (Pitfall 4 / D-07): a push-callback closure created in render — its changing
// identity would reset the 300 ms window every render.
```
300 ms delay, `maxLength={100}` on the input, Enter → `commitNow` stay as they are in the source.

---

### `app/(app)/employees/search-box.tsx` — `EmployeeSearchBox` (component, request-response)

**Analog:** `app/(app)/devices/search-box.tsx` (render half) + `app/(app)/devices/filter-bar.tsx` (mounting pattern).

**Island conventions to copy** (devices/search-box.tsx lines 1–19):
```typescript
'use client'

import { Search } from 'lucide-react'
// Hook import here (new); the island imports the query builder ITSELF —
// it receives flat serializable props only (vercel server-serialization):
// export function DeviceSearchBox({ q, current }: { q: string; current: DeviceFilters })
```
Lines 17–19 (keep the comment's substance): NOT a `<form action>` — React 19 resets uncontrolled forms after every action (4886f6a); controlled input outside any form survives the server swap.

**Input render to copy** (lines 142–164), with employee copy (discretion: placeholder «Имя или отдел», aria-label «Поиск по сотрудникам»):
```typescript
<div className="relative min-w-48 flex-1">
  <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-secondary" />
  <input
    type="search"
    value={value}                    // from the hook
    maxLength={100}
    onChange={(e) => setValue(e.target.value)}
    onKeyDown={(e) => { if (e.key === 'Enter') commitNow() }}
    className="h-10 w-full rounded-lg border border-hairline bg-white px-3 pl-9 text-base text-ink outline-none transition-colors placeholder:text-ink-secondary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
  />
</div>
```

**Placement (D-09):** mounted by `employees/page.tsx` under the segment nav, above the list, full column width — same server-composed pattern as `FilterBar` (filter-bar.tsx lines 22–26): a server component renders `<EmployeeSearchBox q={filters.q} current={filters} />`; no client wrapper, no state on the server side.

---

### `app/(app)/employees/query-params.ts` (utility, request-response)

**Analog:** `app/(app)/devices/query-params.ts` — mini version with only `filter`, `q`, `page`.

**Module header discipline to copy** (lines 7–17): "The ONE params module… Pure and immutable: no framework imports, no module-level mutable state — safe to import from RSC, client islands and vitest alike. Islands receive flat validated values as props… and import this module's builder themselves."

**Parser pattern** (lines 70–85; the q lines are 73–74):
```typescript
export function parseDevicesSearchParams(
  sp: Record<string, string | string[] | undefined>,
): DeviceFilters {
  const rawQ = typeof sp.q === 'string' ? sp.q : ''
  const q = rawQ.trim().slice(0, 100)          // trim + cap 100 — employee parser copies this exactly
  // ... every param degrades to its inactive sentinel, never a 500 (T-03-04)
}
```
Employee shape: `{ filter: 'active' | 'archive', q: string }` (filter already parsed in employees/page.tsx:39 — move that logic into the module).

**Builder pattern** (lines 107–117):
```typescript
// The ONE builder pagination links, islands and the CSV link all call: FULL
// query string, inactive sentinels omitted, page omitted when 1.
export function buildDevicesQuery(f: DeviceFilters, page = 1): string {
  const params = new URLSearchParams()
  if (f.q !== '') params.set('q', f.q)
  // ...
  if (page !== 1) params.set('page', String(page))
  return `?${params.toString()}`
}
```
Employee builder: `filter` is ALWAYS set (it has no inactive sentinel — current inline builder, employees/page.tsx:21–26, already does `params.set('filter', filter)`); `q` omitted when `''`; `page` omitted when 1. **D-05**: segments carry q (one builder for segments, pagination, island push, and the «Сбросить поиск» link).

---

### `db/queries/employees.ts` — `listEmployees` + `employeeSearchPredicate` (model, CRUD)

**Analog:** `db/queries/devices.ts`.

**Predicate analog — `searchPredicate`** (devices.ts lines 161–180). Copy the structure, extend per D-01/D-03/D-04:
```typescript
function searchPredicate(rawQ: string | undefined) {
  const q = normalizeNumber(rawQ ?? '').slice(0, 100)
  if (q === '') return undefined
  const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
  return or(
    sql`${devices.serialNormalized} like ${pattern} escape '\\'`,
    // ...
  )
}
```

**Employee variant (composite sketch — planner formalizes):**
```typescript
// JS side: fold = norm (upper+trim+whitespace-collapse+homoglyphs) + local Ё/ё→Е/е
// (D-01: the fold lives HERE, never in lib/normalize.mjs / the UDF).
// norm collapses \s+ to ' ' — split AFTER the fold (RESEARCH Anti-Pattern).
function employeeSearchPredicate(rawQ: string | undefined) {
  const folded = normalizeNumber(rawQ ?? '').replaceAll('Ё', 'Е') // norm uppercases: 'ё' cannot survive, replace is harmless
  const tokens = folded.split(' ').filter(Boolean).slice(0, 20)   // sanitize ceiling (A2)
  if (tokens.length === 0) return undefined                        // empty/whitespace q → no predicate
  const escapeLike = (tok: string) => `%${tok.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
  // D-03 × D-04 (A1): per token, match name OR department; tokens AND together.
  return and(...tokens.map((t) => or(
    sql`replace(replace(norm(${employees.name}),'Ё','Е'),'ё','е') like ${escapeLike(t)} escape '\\'`,
    sql`replace(replace(norm(${departments.name}),'Ё','Е'),'ё','е') like ${escapeLike(t)} escape '\\'`,
  )))
}
```
Properties inherited from the device analog: drizzle binds the pattern (no injection, T-05-01); `escape '\\'` makes `%`/`_` literal (Pitfall 2); Ё/ё replace on BOTH sides (Pitfall 3). Export the predicate for Phase 11 (CONTEXT D-01).

**Factored-where analog — `deviceWhere`** (devices.ts lines 218–249): single `and(...)` where every term is presence-guarded:
```typescript
function deviceWhere(type, filters) {
  return and(
    type === 'all' ? undefined : eq(devices.typeKey, type),
    filters?.q ? searchPredicate(filters.q) : undefined,
    // ...
  )
}
```
Employee `listEmployees` gains an optional `q?: string` (same undefined-means-inactive contract as `DeviceListFilters`, devices.ts lines 30–42) and composes `and(eq(employees.isActive, isActive), employeeSearchPredicate(q))`.

**Count/rows parity — `listDevices`** (devices.ts lines 378–392) — mandatory refactor of current listEmployees (lines 46–50), whose count query has NO join today:
```typescript
// One where shared by the count and the rows query (Pitfall 5 property).
const where = deviceWhere(type, filters)
// The SAME where spans employees (...), so the count query carries the same leftJoin.
const total = db.select({ value: count() }).from(devices)
  .leftJoin(employees, eq(devices.currentEmployeeId, employees.id))
  .where(where).get()!.value
const pages = Math.max(1, Math.ceil(total / pageSize))
const current = Math.min(Math.max(1, page), pages)
```
Employee version: **both** count and rows carry the existing `innerJoin(departments, ...)` (already on the rows query, employees.ts:63) — searching by `departments.name` without the join on count would drift total from the list (RESEARCH Pitfall 1). Clamp stays (employees.ts:51–54). Sort untouched: `orderBy(ruSortKey, asc(employees.id))` — ruSortKey already exists at employees.ts:31–34; no relevance ranking (D-04).

**Imports to add** (current file, lines 1–3, has only `asc, count, eq, sql`): `and`, `or` from drizzle-orm + `normalizeNumber` from `@/lib/normalize` (same import shape as devices.ts lines 1–18).

---

### `app/(app)/employees/page.tsx` (route, request-response)

**Analog:** `app/(app)/devices/page.tsx` for parsing/empty states; own current code for segments/pagination.

**Parse pattern to copy** (devices/page.tsx lines 38–57): `await searchParams` → ONE parser → separate `Number` + integer guard for page (lines 45–46, identical to employees/page.tsx:40–41 — keep) → pass filters to the query.

**Header counter pattern** (devices/page.tsx lines 88–94):
```typescript
{anyFilterActive
  ? `Найдено: ${pluralDevices(total)}`
  : pluralDevices(total)}
```
Employee: «Найдено: {pluralEmployees(total)}» only when `q !== ''` (D-08); `pluralEmployees` already exists (lib/ru.ts:19–22) and is already imported (employees/page.tsx:6,55).

**Empty-state precedence pattern** (devices/page.tsx lines 108–151) — third variant added above the two existing ones (employees/page.tsx:93–117 stay verbatim for the no-q cases):
```typescript
{anySearchFilter ? (
  <>
    <h2 ...>Ничего не найдено</h2>
    <p ...>Проверьте раскладку: ...</p>
    {/* Plain server Link — no island. On arrival q='' differs from
        the island's lastSynced ref, so its effect adopts the
        external q and clears the input (search-box.tsx, CR-01). */}
    <Link href="/devices" ...>Сбросить фильтры</Link>
  </>
) : ...}
```
Employee version (D-08): precedence `q !== ''` → «Ничего не найдено» + hint «Проверьте раскладку и Ё/ё: „елкин“ найдёт „Ёлкин“» + «Сбросить поиск» Link built with `buildEmployeesQuery({ filter, q: '' })` (clears ONLY q — segment survives; copy is ui-phase's contract). The clean-input adoption note applies byte-for-byte.

**Segments + pagination** (employees/page.tsx:69–90 and 148–170): swap the local `buildQuery(filter, page)` (lines 21–26) for `buildEmployeesQuery` from the new query-params module — every Link automatically carries q (D-05, Pitfall 6). Mount `<EmployeeSearchBox q={filters.q} current={filters} />` between the segment nav and the list (D-09).

---

### `app/(app)/devices/search-box.tsx` — REFACTOR (component, request-response)

**Analog:** itself. Lines 33–140 (router, value state, refs, the whole effect, commitNow) move into the hook **verbatim**; the file keeps `'use client'`, the imports (now importing the hook + `buildDevicesQuery`), and the render (lines 142–164) with `value`/`setValue`/`commitNow` destructured from the hook. Push call inside the hook is parameterized as `buildQuery({ ...target, q: value })` — for devices, `target = current` (which already includes `q`; the spread override preserves today's exact semantics, devices/search-box.tsx:107,136). **Acceptance: behavior identical (SC 5); `tests/device-search.test.ts` and `tests/devices-queries.test.ts` stay green untouched (db layer is not reached by this refactor).**

---

### `tests/employee-search.test.ts` (test, batch)

**Analog:** `tests/device-search.test.ts` — same harness, same matrix style.

**Harness to copy** (device-search.test.ts lines 18–29; identical to employees-queries.test.ts:11–29):
```typescript
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-employee-search-'))
process.env.DATABASE_PATH = join(tmpDir, 'employees.db')
const { db } = await import('@/db')   // DATABASE_PATH BEFORE first @/db import
applyMigrations(db.$client)           // openDb registers norm() UDF on THIS connection
const queries = await import('@/db/queries/employees')
const { createEmployee, listEmployees } = queries
afterAll(() => { db.$client.close(); rmSync(tmpDir, { recursive: true, force: true }) })
```
Fixture building uses `createEmployee({ name, departmentName })` (employees-queries.test.ts:31–60 shows the pattern — one call creates name + department). Matrix per D-10/fixtures-discretion: «Ёлкин Пётр» (Ё-fold), homoglyph names (С↔C, Н↔H…), same name in different departments (names are NOT unique, D-04 of phase 2), double surnames.

**Test shapes to mirror:**
- Wildcard safety (device-search.test.ts:154–180): `_` literal (line 154–165), `a%b` → 0 rows (167–173), bare `%` ≠ full registry (175–180)
- Ё ordering (lines 205–213): «Анна … / Ежов … / Ёлка …» — mirror with employee names through ruSortKey
- Homoglyph matrix loop (lines 77–110): iterate `HOMOGLYPH_PAIRS` (tests/homoglyphs-fixture.ts:11–23); include `assertFixtureCompleteness()` guard (lines 34–54, D-02 — fixture NOT extended, guard referenced)
- URL tests: dynamic-import the pure module, no db — precedent in devices-queries.test.ts:555–573:
```typescript
it('parseDevicesSearchParams maps unknown status/warranty/dept/ram to inactive', async () => {
  const { parseDevicesSearchParams } = await import('@/app/(app)/devices/query-params')
  const junk = parseDevicesSearchParams({ ... })
  expect(junk).toEqual({ ...inactive sentinels })
})
```
  Employee cases (SC 3): q trim/cap 100; `buildEmployeesQuery('archive', 1, 'елкин')` carries q; new-query push drops page (builder omits page=1); `?q=елкин&page=999` clamps via listEmployees; page-parity probe (sum of pages == total, precedent devices-queries.test.ts:545–550).

## Shared Patterns

### Live-search reconciliation (G-5-1/G-5-2) — VERBATIM
**Source:** `app/(app)/devices/search-box.tsx` lines 33–140
**Apply to:** `lib/use-search-param.ts` (whole body), both islands via the hook
Key invariants (source comments are load-bearing — keep them in the move): push-time `lastSynced` stamp (line 105); inFlight echo absorption incl. trim (`q === p || q === p.trim()`, line 67); input never rewritten to trimmed form (lines 57–66); clean-input-only adoption (lines 76–93); cap 4 on inFlight (line 104); Enter commitNow same stamping (lines 123–140).

### URL validation + ONE builder
**Source:** `app/(app)/devices/query-params.ts` lines 70–117
**Apply to:** `employees/query-params.ts`, `employees/page.tsx`, `employees/search-box.tsx`
Every param degrades to its inactive sentinel, never 500 (T-03-04); builder emits the FULL query string, omits inactive sentinels and page=1; islands import the builder themselves (never receive it as a prop).

### SQL LIKE predicate: norm()-UDF fold + escape + bind
**Source:** `db/queries/devices.ts` lines 171–180 (`searchPredicate`), `db/index.ts` lines 19–26 (deterministic norm UDF), `lib/normalize.mjs` lines 23–26
**Apply to:** `employeeSearchPredicate` in `db/queries/employees.ts`
Fold = `normalizeNumber` + local Ё/ё→Е/е (D-01: NOT in normalize.mjs); escape `%_\` + `escape '\\'`; drizzle bind only; empty fold → `undefined` (no predicate).

### Count and rows share ONE where (+ join) + clamp
**Source:** `db/queries/devices.ts` lines 378–392
**Apply to:** refactored `listEmployees` — count query gains the innerJoin departments so total cannot drift from rows (RESEARCH Pitfall 1).

### Empty state + server-Link reset with clean-input adoption
**Source:** `app/(app)/devices/page.tsx` lines 108–151 (esp. comment 122–124)
**Apply to:** `employees/page.tsx` third empty state — plain server `<Link>` whose q='' gets adopted by the hook, clearing the input without focus jump (D-08).

### Temp-SQLite test harness
**Source:** `tests/device-search.test.ts` lines 18–29 (+ `tests/helpers.ts` `applyMigrations`)
**Apply to:** `tests/employee-search.test.ts` — DATABASE_PATH env BEFORE dynamic `@/db` import so the norm UDF lands on the test connection.

## Anti-Patterns (verified in-repo, carry into plans)

- Do NOT rewrite the reconciliation "smarter" — D-07 forbids; the verbatim move is the acceptance criterion
- Do NOT touch `lib/normalize.mjs` / the norm UDF (D-01) — `tests/device-search.test.ts` must stay byte-green
- Do NOT wrap the search in `<form action>` — React 19 resets uncontrolled forms (commit 4886f6a; controlled input outside any form)
- Do NOT include `page` in a new-query push — builder omits page=1; server clamp handles stale page (Pitfall 5)
- Do NOT add `loading.tsx` — transition keeps the list mounted (D-06); app-level loading broke the 404 matrix in phase 2
- Do NOT tokenize before `normalizeNumber` — norm trims/collapses whitespace; split after the fold
- Do NOT pass `buildQuery` as a prop across the RSC boundary — the island imports it (server-serialization rule)
- Do NOT count without the departments join when q searches departments (Pitfall 1)

## Metadata

**Analog search scope:** `app/(app)/devices/`, `app/(app)/employees/`, `db/queries/`, `lib/`, `tests/`
**Files read in full:** devices/search-box.tsx, devices/query-params.ts, devices/filter-bar.tsx, devices/page.tsx, employees/page.tsx, db/queries/devices.ts, db/queries/employees.ts, tests/device-search.test.ts, tests/employees-queries.test.ts (partial), tests/homoglyphs-fixture.ts, tests/helpers.ts, lib/normalize.mjs, lib/ru.ts, db/index.ts, tests/devices-queries.test.ts (targeted read, lines 545–589)
**Pattern extraction date:** 2026-09-15
