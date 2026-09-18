# Phase 11: ⌘K глобальная палитра - Pattern Map

**Mapped:** 2026-09-16
**Files analyzed:** 11 (5 new, 6 modified)
**Analogs found:** 11 / 11 (all classified; 1 composite role-match)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/api/search/route.ts` (NEW) | route handler (controller) | request-response | `app/api/devices/export/route.ts` | exact (role + flow + guards) |
| `components/command-palette.tsx` (NEW) | component (client island) | event-driven + request-response | `app/(app)/devices/search-box.tsx` (island/debounce/input) + `components/ui/dialog.tsx` (modal skin) + `components/ui/combobox.tsx` (item semantics) | role-match (composite — no palette exists; composition recipe lives in RESEARCH.md Patterns 1–4) |
| `lib/search-params-record.ts` (NEW, D-08 #1) | utility (pure transform) | transform | `app/(app)/devices/query-params.ts` (pure-module discipline) + patch verbatim in `08-REVIEW.md:46-54` | role-match |
| `tests/palette-queries.test.ts` (NEW) | test (db-layer) | batch | `tests/device-search.test.ts` | exact (same harness) |
| `tests/search-params-record.test.ts` (NEW) | test (pure module) | transform | `tests/normalize.test.ts` convention (plain describe/it, no db) | role-match |
| `db/queries/devices.ts` (MOD: + `searchPaletteDevices`) | model (db query) | CRUD | itself: `listDevices` (line 372) / `exportDevices` (line 468) | exact |
| `db/queries/employees.ts` (MOD: + `searchPaletteEmployees`) | model (db query) | CRUD | itself: `listEmployees` (line 74) | exact |
| `app/(app)/layout.tsx` (MOD: mount island) | layout (RSC shell) | — | itself (already mounts a client island `AppNav`, line 22) | exact |
| `app/(app)/nav.tsx` (MOD: ⌘K button) | component (client island) | event-driven | itself + `app/(app)/layout.tsx:24-31` («Выйти» quiet-button register) | exact |
| `lib/use-search-param.ts` (MOD: D-08 #2 dedup) | hook | event-driven | patch verbatim in `07-REVIEW.md:49-69` | exact (patch) |
| `app/api/devices/export/route.ts` (MOD: D-08 #1 shaping) | route handler | request-response | patch verbatim in `08-REVIEW.md:44-54` | exact (patch) |

## Pattern Assignments

### `app/api/search/route.ts` (NEW — route handler, request-response)

**Analog:** `app/api/devices/export/route.ts` (primary — D-01 names it a precedent), `app/api/attachments/[attachmentId]/route.ts` (JSON-response variant)

**Imports pattern** (`export/route.ts` lines 1-10):
```typescript
import type { NextRequest } from 'next/server'
import { requireSession } from '@/lib/auth'
import { exportDevices } from '@/db/queries/devices'
import { displayTodayUtc } from '@/lib/warranty'
import { buildDeviceCsv } from '@/lib/device-csv'
import { csvResponseHeaders } from '@/lib/csv'
import {
  parseDevicesSearchParams,
  toDeviceListFilters,
} from '@/app/(app)/devices/query-params'
```
`@/` path alias, type-only NextRequest import, db functions imported at module top. The new route follows the same shape: `@/lib/auth`, `@/db/queries/devices`, `@/db/queries/employees`.

**Auth/guard pattern — requireSession() FIRST statement** (`export/route.ts` lines 41-44; identical at `attachments/route.ts` lines 44-48; guard itself `lib/auth.ts` lines 10-15):
```typescript
export async function GET(request: NextRequest) {
  await requireSession()
  const sp = Object.fromEntries(request.nextUrl.searchParams)
```
```typescript
// lib/auth.ts:10-15 — redirect('/login') = 307 in route handlers
export const requireSession = cache(async () => {
  const cookieStore = await cookies()
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value)
  if (!session) redirect('/login')
  return session
})
```

**No-store headers pattern** (`export/route.ts` lines 22-32 comment + 62; `attachments/route.ts` lines 86-89):
```typescript
// export/route.ts — headers hardcoded, never echoed from input (V5);
// Cache-Control: no-store is part of csvResponseHeaders
return new Response(body, { headers: csvResponseHeaders(isoDate) })
```
```typescript
// attachments/route.ts:80-89 — the JSON/binary route header shape
return new Response(new Uint8Array(bytes), {
  headers: {
    'Content-Type': 'image/jpeg',
    ...
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
```
For `/api/search`: `NextResponse.json({ devices, employees }, { headers: { 'Cache-Control': 'no-store' } })` — the `NextResponse.json` call shape comes from `attachments/route.ts` lines 40-42 (`jsonError` helper).

**Error-handling shape — happy-path-only, no internals echoed** (`export/route.ts` lines 29-32):
```typescript
// No error path echoes internals: filter params cannot crash anything (the
// parser degrades every invalid value to its inactive sentinel — T-03-04
// discipline), so the happy path is the only path; an unexpected failure
// surfaces as Next's generic 500 (V7).
```

**D-08 fix #1 target in this analog** (`export/route.ts` line 43 — the bug):
```typescript
const sp = Object.fromEntries(request.nextUrl.searchParams)  // collapses duplicates — WR-01
```
Patch verbatim from `08-REVIEW.md:46-54`:
```typescript
// route.ts, GET
const sp: Record<string, string | string[]> = {}
for (const [k, v] of request.nextUrl.searchParams) {
  const prev = sp[k]
  sp[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v]
}
const filters = parseDevicesSearchParams(sp)
```
Extract this loop into `lib/search-params-record.ts` so it is vitest-importable (routes are not — phase-8 discipline).

---

### `components/command-palette.tsx` (NEW — client island, event-driven + request-response)

**Analogs:** `app/(app)/devices/search-box.tsx` (island + debounce + input recipe), `components/ui/dialog.tsx` (modal skin + data-slot pattern), `components/ui/combobox.tsx` (Base UI item/group/empty semantics). The Dialog+Autocomplete composition itself has NO codebase analog — use RESEARCH.md Patterns 1–4 and the official command-palette example in `node_modules/@base-ui/react/docs/react/components/autocomplete.md`.

**Client island pattern — 'use client', flat props, module-level builder imports** (`search-box.tsx` lines 1-6, 25-36):
```tsx
'use client'

import { Search } from 'lucide-react'
import { useDebouncedSearchQuery } from '@/lib/use-search-param'
import { buildDevicesQuery } from './query-params'
import type { DeviceFilters } from './query-params'
...
export function DeviceSearchBox({ q, current }: { q: string; current: DeviceFilters }) {
```
Island discipline (comment lines 12-14): islands import query builders themselves — never functions across the RSC boundary. The palette imports `buildDevicesQuery` / `buildEmployeesQuery` the same way for «Показать все».

**Search input recipe** (`search-box.tsx` lines 41-57 — icon placement, maxLength, focus ring; palette scales h-10→h-12, pl-9→pl-11 per UI-SPEC):
```tsx
<Search
  size={16}
  aria-hidden
  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-secondary"
/>
<input
  type="search"
  value={value}
  maxLength={100}
  onChange={(e) => setValue(e.target.value)}
  placeholder="Серийник, инвентарник или модель"
  aria-label="Поиск по устройствам"
  className="h-10 w-full rounded-lg border border-hairline bg-white px-3 pl-9 text-base text-ink outline-none transition-colors placeholder:text-ink-secondary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
/>
```

**Debounce pattern — 300 ms timer, per-keystroke re-arm** (`search-box.tsx` lines 32-36 via hook; timer mechanics `lib/use-search-param.ts` lines 125-135). NOTE (D-03): the palette deliberately does NOT consume the hook — it navigates URLs (list semantics). Copy the debounce shape, not the hook; the fetch runs with AbortController per RESEARCH.md Pattern 3.

**Modal skin — scrim + motion + data-slot** (`dialog.tsx` lines 26-41, 52-61):
```tsx
// DialogOverlay (lines 30-40): scrim rgba(0,0,0,0.3) fade, no blur
"fixed inset-0 isolate z-50 bg-black/30 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
// DialogPrimitive.Popup (lines 54-61): 16px radius, hairline ring, zoom 0.96→1
<DialogPrimitive.Popup
  data-slot="dialog-content"
  className={cn(
    "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-200 ease-out outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-96 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-96",
```
The palette reuses this class vocabulary on its OWN top-aligned popup (`top-[15vh]`, no `-translate-y-1/2`, `p-0` per UI-SPEC) and tags it `data-command-palette`. The `data-slot="dialog-content"` attribute (line 55) is the inertness probe target (SC 4): `document.querySelector('[data-slot="dialog-content"][data-open]:not([data-command-palette])')`.

**sr-only DialogTitle pattern** (`dialog.tsx` lines 125-137) — palette renders `<DialogTitle className="sr-only">Глобальный поиск</DialogTitle>` (Base UI a11y requirement, UI-SPEC default #4).

**Item highlight semantics — data-highlighted accent** (`combobox.tsx` lines 144-147):
```tsx
<ComboboxPrimitive.Item
  data-slot="combobox-item"
  className={cn(
    "relative flex w-full cursor-default items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 ...
```
UI-SPEC color contract: the palette row highlight is byte-for-byte this semantic — `data-highlighted:bg-accent data-highlighted:text-accent-foreground`, secondary text inside a highlighted row flips via `group-data-highlighted:text-accent-foreground/80` (row = `group`).

**Group label + Empty patterns** (`combobox.tsx` lines 164-185, 193-204):
```tsx
<ComboboxPrimitive.Group data-slot="combobox-group" ... />
<ComboboxPrimitive.GroupLabel data-slot="combobox-label" className="px-2 py-1.5 text-xs text-muted-foreground" ... />
<ComboboxPrimitive.Empty data-slot="combobox-empty" className="hidden w-full justify-center py-2 text-center text-sm text-muted-foreground group-data-empty/combobox-content:flex" ... />
```
Palette maps these to `Autocomplete.Group` / `GroupLabel` («Устройства» / «Сотрудники», 14/400 `text-ink-secondary`) / `Autocomplete.Empty` («Ничего не найдено», `data-palette-empty`).

**Result-row composition — copy the list row, not the combobox row** (`app/(app)/devices/page.tsx` lines 192-244 — SC 2 parity extends to appearance):
```tsx
<Link
  href={`/devices/${row.id}`}
  title={[row.model, deviceTypeName(row.typeKey), row.serialNumber ?? '—',
          row.inventoryNumber ?? '—', row.holder ?? '—', ...].filter(...).join(' · ')}
  className="flex min-h-11 flex-1 items-center gap-3 px-4 py-2 transition-colors duration-150 ease-out hover:bg-page"
>
  <span className="min-w-0 flex-1">
    <span className="flex items-center justify-between gap-2">
      <span className="truncate text-base text-ink">{row.model}</span>
      <span className="shrink-0 rounded-full bg-black/5 px-2 py-1 text-sm text-ink-secondary">
        {deviceStatusLabel(row.status)}
      </span>
    </span>
    <span className="mt-0.5 block truncate text-sm text-ink-secondary">
      {deviceTypeName(row.typeKey)}
      {' · '}
      <span className="font-mono">{row.serialNumber ?? '—'}</span>
      {' · '}
      <span className="font-mono">{row.inventoryNumber ?? '—'}</span>
      {' · '}
      {row.holder ?? '—'}
```
Two-line recipe: primary `truncate text-base text-ink`, secondary `truncate text-sm text-ink-secondary` with mono numbers, full text in `title`, `min-h-11` hit area. Type label via `deviceTypeName(typeKey)` from `lib/device-schema.ts:101-103`.

**«В архиве» chip — card recipe byte-exact** (`app/(app)/(card)/employees/[id]/page.tsx` lines 143-147):
```tsx
{employee.isActive === 0 ? (
  <span className="rounded-full bg-black/5 px-2 py-1 text-sm text-ink-secondary">
    В архиве
  </span>
) : null}
```

**Global hotkey listener** — NO codebase analog (first window keydown in the app). Use RESEARCH.md Pattern 1 verbatim: `e.code === 'KeyK'` + `metaKey||ctrlKey`, `!altKey && !shiftKey`, `preventDefault()`, `e.repeat` dropped, toggle branch FIRST, then the other-dialog probe.

**Abortable fetch** — NO codebase analog (lists navigate via `router.replace`, they never fetch). Use RESEARCH.md Pattern 3 verbatim: AbortController per keystroke, 300 ms debounce, instant fetch on open, `content-type` guard before `res.json()` (session-expiry 307→login renders empty, not a crash), swallow only `AbortError`.

**Navigation + close pattern** — `useRouter` from `next/navigation` as in the hook (`lib/use-search-param.ts` line 4, 37); Enter/click handler does `router.push(href)` AND `setOpen(false)` together (Pitfall 9).

---

### `lib/search-params-record.ts` (NEW — utility, transform)

**Analog module discipline:** `app/(app)/devices/query-params.ts` lines 7-17:
```typescript
// The ONE params module of /devices (phase 5): the single source of the URL
// filter vocabulary, of the server-side parse and of the query-string
// builder. ... Pure and immutable: no framework imports, no module-level
// mutable state (vercel server-no-shared-module-state) — safe to import
// from RSC, client islands and vitest alike.
```
Body of the new helper = the 08-REVIEW shaping loop (excerpt above under the export route). Call sites: `parseDevicesSearchParams(searchParamsRecord(request.nextUrl.searchParams))`. The parser's own array-degradation contract it feeds (`query-params.ts` lines 70-74):
```typescript
export function parseDevicesSearchParams(
  sp: Record<string, string | string[] | undefined>,
): DeviceFilters {
  const rawQ = typeof sp.q === 'string' ? sp.q : ''
  const q = rawQ.trim().slice(0, 100)
```

---

### `db/queries/devices.ts` (MOD — add `searchPaletteDevices`)

**Analog:** `listDevices` rows query (lines 403-422) and `exportDevices` (lines 468-506) — same module, same select vocabulary. Key excerpts:

**Join + select + order + limit** (`listDevices` lines 403-422):
```typescript
const rows = db
  .select({
    id: devices.id,
    typeKey: devices.typeKey,
    model: devices.model,
    serialNumber: devices.serialNumber,
    inventoryNumber: devices.inventoryNumber,
    status: devices.status,
    holder: employees.name,
    ...
  })
  .from(devices)
  .leftJoin(employees, eq(devices.currentEmployeeId, employees.id))
  .where(where)
  .orderBy(ruSortKey, asc(devices.id))
  .limit(pageSize)
  .offset((current - 1) * pageSize)
  .all()
```
`searchPaletteDevices` = this minus pagination/cover-batch, `where` = `deviceWhere('all', { q })` (module-private predicate — line 228 — consumed via a new exported function, exactly how `listDevices`/`exportDevices` consume it, never exported itself).

**Private predicate the palette composes** (`searchPredicate` lines 181-190, `deviceWhere` line 228):
```typescript
function searchPredicate(rawQ: string | undefined) {
  const q = normalizeNumber(rawQ ?? '').slice(0, 100)
  if (q === '') return undefined
  const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
  return or(
    sql`${devices.serialNormalized} like ${pattern} escape '\\'`,
    sql`${devices.inventoryNormalized} like ${pattern} escape '\\'`,
    sql`norm(${devices.model}) like ${pattern} escape '\\'`,
  )
}
```

**RU sort recipe** (lines 135-138):
```typescript
// Russian-correct sort key (same recipe as employees): SQLite binary UTF-8
// puts «Ё» before «А» and NOCASE folds ASCII only — replace Ё/ё→Е/е in ORDER
// BY; devices.id is the stable tiebreaker.
const ruSortKey = sql`replace(replace(${devices.model}, 'Ё', 'Е'), 'ё', 'е')`
```

**Export precedent — full scan, canonical order, holder join** (`exportDevices` lines 475-505): `.where(deviceWhere(type, filters)).orderBy(ruSortKey, asc(devices.id)).all()` with `.leftJoin(employees, eq(devices.currentEmployeeId, employees.id))`. The palette function is `exportDevices` minus the second join, plus `.limit(limit)`.

---

### `db/queries/employees.ts` (MOD — add `searchPaletteEmployees`)

**Analog:** `listEmployees` (lines 74-118) — the palette query mirrors its FROM/JOIN/SELECT and DROPS the isActive term (Pitfall 2).

**Required innerJoin + select** (lines 93-98, 103-116):
```typescript
const total = db
  .select({ value: count() })
  .from(employees)
  .innerJoin(departments, eq(employees.departmentId, departments.id))
  .where(where)
  .get()!.value
...
const rows = db
  .select({
    id: employees.id,
    name: employees.name,
    department: departments.name,
    isActive: employees.isActive,
  })
  .from(employees)
  .innerJoin(departments, eq(employees.departmentId, departments.id))
  .where(where)
  .orderBy(ruSortKey, asc(employees.id))
  .limit(pageSize)
  .offset((current - 1) * pageSize)
  .all()
```
The innerJoin is MANDATORY for the palette too: `employeeSearchPredicate` emits `norm(${departments.name}) like …` (lines 67-68) — a query without the join fails the moment q is non-empty (Pitfall 1). `isActive` in the SELECT feeds the «В архиве» badge.

**Segment guard to DROP** (line 85-88):
```typescript
const isActive = filter === 'active' ? 1 : 0
const where = and(eq(employees.isActive, isActive), employeeSearchPredicate(q))
```
Palette composes ONLY `employeeSearchPredicate(q)` — active AND archived both match (SC 2/3).

**The reused predicate** (lines 58-72, exported explicitly for this phase — comment lines 56-57):
```typescript
// Exported because Phase 11's ⌘K palette reuses it whole, fold included (D-01).
export function employeeSearchPredicate(rawQ: string | undefined) {
  const folded = normalizeNumber(rawQ ?? '').replaceAll('Ё', 'E')
  const tokens = folded.split(' ').filter(Boolean).slice(0, 20)
  if (tokens.length === 0) return undefined
  ...
```

**RU sort key** (lines 32-35): same recipe as devices, on `employees.name`.

---

### `app/(app)/layout.tsx` (MOD — mount the island)

**Analog:** itself — already mounts a client island inside the RSC shell (lines 9-23):
```tsx
import { requireSession } from '@/lib/auth'
import { logout } from './actions'
import { AppNav } from './nav'
...
  await requireSession() // defense-in-depth: proxy + in-app guard
...
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-ink">Учёт техники</span>
            <AppNav />
          </div>
```
Add `import { CommandPalette } from '@/components/command-palette'` + `<CommandPalette />` (sibling of `<AppNav />` or before `</div>` — single-island variant per UI-SPEC default #2; the island is a portal-based modal so mount position is inert).

### `app/(app)/nav.tsx` (MOD — ⌘K button)

**Analog:** the quiet text-button register of the app bar (`layout.tsx` lines 24-31):
```tsx
<form action={logout}>
  <button
    type="submit"
    className="text-sm text-ink-secondary transition duration-100 ease-out hover:text-ink active:scale-[0.97]"
  >
    Выйти
  </button>
</form>
```
Nav button mirrors this: quiet `text-ink-secondary hover:text-ink`, `active:scale-[0.97] duration-100 ease-out`, NO accent. Plus the Search 16px icon (`nav.tsx` already uses `usePathname` client island pattern, lines 18-20) and the kbd chip `rounded-md border border-hairline px-2 py-0.5 text-sm text-ink-secondary` (UI-SPEC).

### `lib/use-search-param.ts` (MOD — D-08 fix #2)

**Patch verbatim from `07-REVIEW.md:51-67`** — three push-site guards:
```ts
// 1) In the debounce callback (before line 127) and in commitNow (before
//    line 156): never queue a value that is already being navigated to.
if (inFlight.current.includes(value)) return

// 2) In the echo branch (lines 72-74): absorb ALL matching entries, not
//    just the first, so duplicates cannot survive an echo.
const remaining = inFlight.current.filter((p) => q !== p && q !== p.trim())
if (remaining.length !== inFlight.current.length) {
  inFlight.current = remaining
  lastSynced.current = q
}

// 3) Replace the exact no-op skip (line 110) with a trim-aware one — the
//    server normalizes q, so identical-after-trim content is a no-op:
if (value.trim() === q.trim()) return
```
Existing push sites being patched: debounce callback lines 125-135, echo branch lines 71-79, no-op skip line 109-110, `commitNow` lines 147-164. Land BEFORE the palette consumes anything (Pitfall 7).

### `app/api/devices/export/route.ts` (MOD — D-08 fix #1)

Replace line 43 (`Object.fromEntries(...)`) with the `searchParamsRecord` call — patch excerpt above. Route stays a thin composer; the shaping logic lives in the new pure lib module.

### `tests/palette-queries.test.ts` (NEW — db-layer test)

**Analog:** `tests/device-search.test.ts` lines 12-45 — the exact harness (temp db BEFORE first `@/db` import, dynamic imports, real migrations, base fixture):
```typescript
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-device-search-'))
process.env.DATABASE_PATH = join(tmpDir, 'devices.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const queries = await import('@/db/queries/devices')
const { createDevice, listDevices } = queries

afterAll(() => {
  db.$client.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

// Common input with only the mandatory fields — individual tests override.
const base = { model: 'Тестовая модель', serialNumber: 'SN-001', ... }
```
Style: tracer-oriented `describe`/`it` with behavioral names (lines 47-71). Palette suite asserts: parity with `listDevices` for same q, archived employees present + `isActive` selected, caps (≤6 per group, q cap 100). `tests/helpers.ts` (`createTempDb`, `applyMigrations`, lines 8-46) is the shared harness import.

## Shared Patterns

### requireSession-first HTTP entry
**Source:** `lib/auth.ts:10-15`; applied at `app/api/devices/export/route.ts:42` and `app/api/attachments/[attachmentId]/route.ts:48,99`
**Apply to:** `app/api/search/route.ts` — first statement of GET, no exceptions (V3 defense-in-depth on the proxy default-deny perimeter).

### q normalization discipline: trim + cap 100, then fold ONLY inside predicates
**Source:** `app/(app)/devices/query-params.ts:73-74` (`rawQ.trim().slice(0, 100)`), `db/queries/devices.ts:182`, `db/queries/employees.ts:59`
**Apply to:** the search route trims + caps; it must NOT re-fold — `normalizeNumber`/Ё-фолд live inside the predicates only (RESEARCH anti-pattern #1).

### One-predicate composition (no second search engine)
**Source:** `db/queries/devices.ts:228` (`deviceWhere`, private), `db/queries/employees.ts:58` (`employeeSearchPredicate`, exported for this phase)
**Apply to:** both new db query functions — «палитра находит то, что находит список» is structural (SC 2): compose, never copy predicate bodies.

### RU-correct ordering: Ё/ё→Е/е replace + id tiebreaker
**Source:** `db/queries/devices.ts:135-138`, `db/queries/employees.ts:32-35`
**Apply to:** both palette queries — `.orderBy(ruSortKey, asc(<pk>))`.

### Pure-module rule for shared lib (vitest-importable, no framework imports)
**Source:** `app/(app)/devices/query-params.ts:13-17` (module contract comment), phase-8 discipline (route files are NOT vitest-importable)
**Apply to:** `lib/search-params-record.ts` and any D-08 helper — keeps `tests/search-params-record.test.ts` possible.

### Client island conventions ('use client', flat serializable props, builders imported by the island)
**Source:** `app/(app)/devices/search-box.tsx:1-14`, `lib/use-search-param.ts:16-21`
**Apply to:** `components/command-palette.tsx` — imports `buildDevicesQuery`/`buildEmployeesQuery` at module level; receives no function props.

### data-slot smoke needles for Playwright UAT
**Source:** `components/ui/dialog.tsx:11,31,55` (`data-slot="dialog"`/`"dialog-overlay"`/`"dialog-content"`), `components/ui/combobox.tsx:145`
**Apply to:** palette needles per UI-SPEC: `data-command-palette` (popup — also the inertness self-exclusion), `data-palette-input`, `data-palette-empty`, `data-palette-error`; rows/groups reachable via ARIA roles.

### Quiet neutral button register (no accent on secondary controls)
**Source:** `app/(app)/layout.tsx:27` («Выйти»)
**Apply to:** nav ⌘K button and the CSV row — `text-ink-secondary hover:text-ink`, `active:scale-[0.97] duration-100 ease-out`; accent is reserved for the moving row highlight only.

### «Показать все» URLs — builders only, never hand-built query strings
**Source:** `app/(app)/devices/query-params.ts:107-117` (`buildDevicesQuery`), `app/(app)/employees/query-params.ts:40-46` (`buildEmployeesQuery`)
**Apply to:** palette show-all rows — `buildDevicesQuery({ q, type: 'all', status: 'all', departmentId: null, warranty: 'all', ramNoUpgrade: false })` and `buildEmployeesQuery({ filter: 'active', q })`; builders own sentinel omission (q:'' omitted).

### Error shape: degrade, never 500, never echo internals
**Source:** `app/api/devices/export/route.ts:29-32` (comment), `app/api/attachments/[attachmentId]/route.ts:40-42` (`jsonError` helper)
**Apply to:** the search route (parser degrades q; happy path is the only path) and the island (non-JSON response → empty results; network failure → `role="alert"` line «Не удалось выполнить поиск. Попробуйте ещё раз.»).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `components/command-palette.tsx` — Dialog+Autocomplete composition | component | event-driven | No command palette / global hotkey / modal-autocomplete exists in the codebase. Use the official Base UI command-palette recipe (vendored docs of installed ^1.7.0: `node_modules/@base-ui/react/docs/react/components/autocomplete.md` ~line 3234, `dialog.md` detached-trigger demo) + RESEARCH.md Patterns 1–4. All DRESSING (skin, rows, chip, highlight) comes from the analogs above. |
| Abortable-fetch data layer (inside the island) | hook (inline) | request-response | The app has zero client fetches — lists navigate via `router.replace` inside `startTransition` (`lib/use-search-param.ts`). The G-5-1/G-7-1 race machinery is the conceptual ancestor; the concrete AbortController + content-type-guard body is RESEARCH.md Pattern 3 verbatim. |
| Window keydown hotkey listener | hook (inline) | event-driven | First global keyboard shortcut in the app (`event.code` physical matching). RESEARCH.md Pattern 1 verbatim; MDN-cited layout independence. |

## Metadata

**Analog search scope:** `app/` (routes, pages, islands), `components/ui/`, `db/queries/`, `lib/`, `tests/`, `.planning/phases/07-live/`, `.planning/phases/08-csv/`
**Files read in full or in targeted sections:** 19 (route handlers ×2, db query modules ×2, nav/layout/search-box ×3, ui wrappers ×2, query-params ×2, auth, device list page, employee card page, device-schema, test harness ×2, review patches ×2)
**Early stop:** analog search stopped at the first strong set — every layer (route/db/island/skin/test/patch) had a verified precedent; no further search would change assignments.
**Pattern extraction date:** 2026-09-16

> NOTE: строка `app/(app)/nav.tsx (MOD)` superseded решением planner'а (UI-SPEC Default 2): **один остров** в layout, nav.tsx не модифицируется — паттерн тихой кнопки применён внутри острова.
