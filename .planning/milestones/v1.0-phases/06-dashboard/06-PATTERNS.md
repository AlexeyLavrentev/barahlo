# Phase 6: Dashboard - Pattern Map

**Mapped:** 2026-09-13
**Files analyzed:** 9 (5 to create/modify per CONTEXT + 1 verify-only + 3 Wave-0 test/support from RESEARCH)
**Analogs found:** 9 / 9 — 7 are self-extensions (the repo's keystone modules carry their own patterns); 2 new files have role-match analogs

This phase is assembly over patterns that already exist in-repo. The three genuinely new shapes (aggregate count functions, the feed query with selected ids, segmented-link feed rows) have their operator/join/composition analogs read and excerpted below.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/(app)/page.tsx` (rewrite — redirect stub deleted) | controller (RSC page) | request-response | `app/(app)/devices/page.tsx` | exact |
| `app/(app)/nav.tsx` (extend) | component (client island) | request-response (pathname-driven) | self — `NAV_ITEMS` (nav.tsx:10-13) | exact (self) |
| `db/queries/devices.ts` (extend — 4 aggregates) | model (data-access) | read aggregate (GROUP BY / count) | self — `warrantyPredicate` (:191-203), `deviceWhere` (:213-244), `listDevices` count (:268-273) | exact (self; co-location IS the D-04 invariant) |
| `db/queries/movements.ts` (extend — `listRecentMovements`) | model (data-access) | read feed (3-way join) | self — `listTimeline` alias double-join (:369-387) | exact (self) |
| `app/globals.css` (verify only) | config/theme | — | n/a | verified — all needed tokens exist (:61-69); zero changes |
| `scripts/smoke-devices.mjs` (update step 8) | test (smoke script) | request-response | self — step 5 perimeter (:115-123), step 8 redirect block (:159-167) | exact (self) |
| `tests/dashboard-queries.test.ts` (NEW, Wave 0) | test (vitest unit) | batch | `tests/devices-queries.test.ts:1-26` (temp-DB bootstrap) | role-match |
| `scripts/smoke-dashboard.mjs` (NEW, optional Wave 0) | test (smoke script) | request-response | `scripts/smoke-devices.mjs` steps 1-7 | role-match |
| `lib/ru.ts` (OPTIONAL extend — `pluralMovements`) | utility | transform | self — `pluralDevices` recipe (ru.ts:24-37) | exact (self) |

**Deliberately NOT built — flag for the planner:** `app/(app)/loading.tsx`. An analog exists (`app/(app)/devices/loading.tsx`, skeleton recipe) but MUST NOT be copied to the `(app)` group level: a boundary there sits above the `(card)` routes and re-introduces the phase-2 streamed-200-before-`notFound()` bug (UI-SPEC Defaults #14; RESEARCH Pattern 6 / Pitfall 6). Skip entirely (recommended) or use `(dashboard)` route-group scoping.

## Pattern Assignments

### `app/(app)/page.tsx` (controller, request-response)

**Analog:** `app/(app)/devices/page.tsx` — the only full RSC-page composition in the app; the dashboard copies its skeleton line-for-line and swaps the body.

**The stub being deleted** (`app/(app)/page.tsx:1-8`, entire file):
```tsx
import { redirect } from 'next/navigation'

// The protected zone root lands on the devices list — ...
export default function AppPage() {
  redirect('/devices')
}
```

**Imports + metadata pattern** (`app/(app)/devices/page.tsx:1-24`) — note `type { Metadata }`, the keystone imports (`DEVICE_TYPES`, `deviceStatusLabel`, `deviceTypeName`), `pluralDevices`, `displayTodayUtc`, `WarrantyDate`, and the relative import of the route-local `query-params` module:
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { listDevices } from '@/db/queries/devices'
import {
  DEVICE_TYPES,
  deviceStatusLabel,
  deviceTypeName,
} from '@/lib/device-schema'
import { pluralDevices } from '@/lib/ru'
import { displayTodayUtc } from '@/lib/warranty'
import { WarrantyDate, formatWarrantyDate } from '@/lib/warranty-date'
// ... route-local imports:
import { buildDevicesQuery, parseDevicesSearchParams, toDeviceListFilters } from './query-params'

export const metadata: Metadata = {
  title: 'Устройства',
}
```
Dashboard: `title: 'Дашборд'` (Pitfall 9 — tab must not keep the root default «Учёт техники»).

**Guard → queries → render discipline** (`app/(app)/devices/page.tsx:37-57`): `await requireSession()` is the FIRST statement of every `(app)` page (also `app/(app)/layout.tsx:14`), then sync query calls, then render:
```tsx
await requireSession() // defense-in-depth: proxy + in-app guard
// ...parse/derive...
const { rows, total, page: current, pages } = listDevices({ ... })
```
Dashboard: no `searchParams` at all — guard, then ~8 sync aggregate calls.

**`today` computed ONCE per render** (`app/(app)/devices/page.tsx:77-80`) — the WarrantyDate contract the dashboard must honor (counts + colored dates share one `today`):
```tsx
// WAR-01 (D-16): ONE calculation for every render site — «today» is
// computed ONCE per page render (not per row) and passed down to each
// row's WarrantyDate; boundaries are identical to the filter's.
const today = displayTodayUtc()
```

**Headline + plural subtitle** (`app/(app)/devices/page.tsx:84-93`) — the «Всего: …» shape (dashboard copy per UI-SPEC: «Всего: {pluralDevices(total)}», 14/400 secondary, NOT a link):
```tsx
<div>
  <h1 className="text-xl font-semibold tracking-tight text-ink">
    Устройства
  </h1>
  <p className="text-sm text-ink-secondary">
    {anyFilterActive ? `Найдено: ${pluralDevices(total)}` : pluralDevices(total)}
  </p>
</div>
```

**Two-line Link row with title attribute** (`app/(app)/devices/page.tsx:166-229`) — the row anatomy the top-5 rows and (structurally) feed rows copy: `min-h-11 px-4 py-2 ... hover:bg-page`, `truncate` + full `title`, line-1/line-2 split, `shrink-0` right element:
```tsx
<Link
  href={`/devices/${row.id}`}
  title={[ row.model, deviceTypeName(row.typeKey), row.serialNumber, ... ]
    .filter((part): part is string => part !== null)
    .join(' · ')}
  className="flex min-h-11 items-center gap-3 px-4 py-2 transition-colors duration-150 ease-out hover:bg-page"
>
  <span className="min-w-0 flex-1">
    <span className="flex items-center justify-between gap-2">
      <span className="truncate text-base text-ink">{row.model}</span>
      <span className="shrink-0 rounded-full bg-black/5 px-2 py-1 text-sm text-ink-secondary">
        {deviceStatusLabel(row.status)}
      </span>
    </span>
    <span className="mt-0.5 block truncate text-sm text-ink-secondary">
      ...
    </span>
  </span>
  <ChevronRight size={16} className="shrink-0 text-[#C7C7CC]" aria-hidden />
</Link>
```
The event-pill recipe to reuse in feed rows is exactly line 200-202 (`rounded-full bg-black/5 px-2 py-1 text-sm text-ink-secondary`); «Списание» alone swaps in `bg-destructive/10 text-destructive` (UI-SPEC Defaults #5).

**Empty-state card pattern** (`app/(app)/devices/page.tsx:108-151`) — quiet copy inside a white card, ternary branches, no icon/CTA unless meaningful:
```tsx
<div className="mt-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-hairline">
  {anySearchFilter ? ( ... ) : filters.type === 'all' ? (
    <>
      <h2 className="text-xl font-semibold tracking-tight text-ink">Пока нет устройств</h2>
      <p className="mt-1 text-sm text-ink-secondary">...</p>
    </>
  ) : ( ... )}
</div>
```

**Builder-built hrefs — NEVER hand-concatenated** (`app/(app)/devices/page.tsx:242-264`): every filter-bearing href goes through `buildDevicesQuery(filters, page)`. Dashboard tiles pass a FULL `DeviceFilters` object (see Shared Patterns).

---

### `app/(app)/nav.tsx` (component / client island, pathname-driven)

**Analog:** the file itself — one array entry is added, zero rule changes.

**NAV_ITEMS** (`app/(app)/nav.tsx:10-13`) — insert `{ href: '/', label: 'Дашборд' }` FIRST (D-01):
```tsx
const NAV_ITEMS = [
  { href: '/devices', label: 'Устройства' },
  { href: '/employees', label: 'Сотрудники' },
] as const
```

**Active rule** (`app/(app)/nav.tsx:20-21`) — verified to already match `/` exactly (`pathname === '/'`) and to never fire `startsWith('//')`; no change:
```tsx
const active =
  pathname === item.href || pathname.startsWith(`${item.href}/`)
```
Styling (lines 26-31): active = `text-sm text-ink`, inactive = `text-sm text-ink-secondary transition-colors hover:text-ink`; `aria-current={active ? 'page' : undefined}`. Island stays untouched otherwise (D-06: no new client JS).

---

### `db/queries/devices.ts` (model, read aggregates) — extend

**Analog:** the file itself. The aggregates are new shapes but MUST live here, co-located with the predicates (RESEARCH Pattern 1 — a separate `dashboard.ts` module would force exporting/re-implementing predicates = the D-04 drift vector).

**Module contract** (`db/queries/devices.ts:22-24`) — pure sync functions, no framework imports:
```ts
// Device data-access (REG-01/REG-02). Pure sync functions over the module-level
// db — no framework imports at all: Server Actions add session + zod on top,
// vitest imports this module directly against a temp database.
```

**Imports (:1-20) — already sufficient for the warranty preset counts.** `count` (:4), `gte` (:6), `isNotNull` (:8), `lt` (:10), `lte` (:11) are imported, and line 19 brings the entire warranty boundary vocabulary:
```ts
import { addDaysUtc, displayTodayUtc, WARRANTY_WARN_DAYS } from '@/lib/warranty'
```
(`asc` is at :3; `groupBy` is a builder method, not an import.) The aggregates need ZERO new import lines.

**THE predicate the preset counters must mirror** — `warrantyPredicate` (`db/queries/devices.ts:191-203`), the D-04 invariant made concrete:
```ts
function warrantyPredicate(w: DeviceListFilters['warranty']) {
  if (!w) return undefined
  const today = displayTodayUtc()
  if (w === 'expired') {
    return and(isNotNull(devices.warrantyUntil), lt(devices.warrantyUntil, today))
  }
  const days = w === 'w30' ? 30 : WARRANTY_WARN_DAYS
  return and(
    isNotNull(devices.warrantyUntil),
    gte(devices.warrantyUntil, today),
    lte(devices.warrantyUntil, addDaysUtc(today, days)),
  )
}
```
Count functions compose the SAME operators (typed operators only — raw `sql` templates cannot bind `Date`, RESEARCH Pitfall 2). Note `warrantyPredicate` takes `today` implicitly via `displayTodayUtc()`; the counts follow the same module-internal convention.

**The ONE where-assembly the tile counts parallel** — `deviceWhere` (`db/queries/devices.ts:213-244`); the tile GROUP BYs count over the same `type` term (:218) and `status` term (:220):
```ts
return and(
  type === 'all' ? undefined : eq(devices.typeKey, type),
  filters?.q ? searchPredicate(filters.q) : undefined,
  filters?.status ? eq(devices.status, filters.status) : undefined,
  ...
  warrantyPredicate(filters?.warranty),
)
```

**Count-query pattern** (`db/queries/devices.ts:268-273`) — the `.get()!.value` total shape `totalDeviceCount()` copies:
```ts
const total = db
  .select({ value: count() })
  .from(devices)
  .leftJoin(employees, eq(devices.currentEmployeeId, employees.id))
  .where(where)
  .get()!.value
```
(The dashboard aggregates need NO join — type/status/warranty terms never reference `employees`.)

**Ordering precedents:** registry rows use `orderBy(ruSortKey, asc(devices.id))` (:293) — the top-5 instead uses the probe-verified `asc(devices.warrantyUntil), asc(devices.id)` (soonest first, id tiebreaker for same-day expiries; RESEARCH Pattern 3).

**Zero-tiles rule (probe-verified):** GROUP BY emits NO row for an absent type/status — render tiles by iterating `DEVICE_TYPES` (`lib/device-schema.ts:82-87`) / `DEVICE_STATUS_KEYS` (`:124-126`) with a `Map.get(key) ?? 0` lookup; the keystone, not SQL, guarantees all 8 tiles exist.

---

### `db/queries/movements.ts` (model, read feed) — extend

**Analog:** the file itself — `listTimeline` is the join pattern; `MovementEventView` is the view-type precedent minus the ids the feed must add.

**alias import** (`db/queries/movements.ts:2`):
```ts
import { alias } from 'drizzle-orm/sqlite-core'
```

**THE join pattern** — `listTimeline` (`db/queries/movements.ts:365-387`); `listRecentMovements` copies this and (a) drops the `where`, (b) adds `innerJoin(devices, ...)` + model/serial/id selects, (c) ADDS `fromId`/`toId` to the select (D-05 links need ids, not just labels):
```ts
// Timeline of one device (MOVE-04): alias double-join resolves both holder
// names — archived employees render as text exactly like active ones (history
// is history). Order is occurredAt DESC with id as the tiebreaker — backdated
// events (D-01) sort by their own dates, never by insertion order.
export function listTimeline(deviceId: number): MovementEventView[] {
  const fromEmp = alias(employees, 'from_emp')
  const toEmp = alias(employees, 'to_emp')
  return db
    .select({
      id: movements.id,
      eventType: movements.eventType,
      comment: movements.comment,
      occurredAt: movements.occurredAt,
      fromName: fromEmp.name,
      toName: toEmp.name,
    })
    .from(movements)
    .leftJoin(fromEmp, eq(movements.fromEmployeeId, fromEmp.id))
    .leftJoin(toEmp, eq(movements.toEmployeeId, toEmp.id))
    .where(eq(movements.deviceId, deviceId))
    .orderBy(desc(movements.occurredAt), desc(movements.id))
    .all()
}
```
The `desc(occurredAt), desc(id)` tiebreaker is mandatory (Pitfall 5 — probe showed real ties order nondeterministically without it).

**View-type precedent** (`db/queries/movements.ts:23-30`) — the feed's `RecentMovementView` is this PLUS `deviceId`/`model`/`serialNumber`/`fromId`/`toId` (timeline renders names as plain text, hence no ids there; the feed differs by design):
```ts
export type MovementEventView = {
  id: number
  eventType: string
  comment: string | null
  occurredAt: Date
  fromName: string | null
  toName: string | null
}
```

**Why `innerJoin(devices)` is safe** (`db/queries/movements.ts:10-16`): the FK is NOT NULL + restrict and disposal never deletes devices, so inner == left and no feed row can drop; the movements table is append-only (INSERT only — DB triggers abort UPDATE/DELETE), so SELECT-only access is the established discipline.

---

### `app/globals.css` (config — verify only)

**Verified:** every token the dashboard needs already exists (`app/globals.css:61-69`) — do not re-touch the file (UI-SPEC Design System: «Zero new tokens»):
```css
--color-page: #F5F5F7;      /* 60% — page background, row hover fill */
--color-surface: #FFFFFF;   /* 30% — cards, bars, dialogs */
--color-ink: #1D1D1F;       /* text primary */
--color-ink-secondary: #6E6E73; /* text secondary */
--color-hairline: #D2D2D7;  /* 1px borders */
--color-accent: #0071E3;    /* reserved: primary CTA, focus ring, combobox */
--color-destructive: #D70015;
--color-warranty-ok: #248A3D;
--color-warranty-warn: #FF9500;
```

---

### `scripts/smoke-devices.mjs` (test/smoke — update step 8)

**Analog:** the file itself. The old redirect is asserted in **THREE places** — all three must change in the same commit as the `page.tsx` rewrite (Pitfall 7) or the phase gate goes red:

1. Header doc comment (`scripts/smoke-devices.mjs:9`):
```
//   6. GET / WITH cookie                  → 307, Location /devices (shell redirect)
```
2. The assertion block (`scripts/smoke-devices.mjs:159-167`):
```js
// 8. Shell redirect: / → 307 with Location /devices.
const root = await fetch(`${BASE}/`, { redirect: 'manual', headers: cookieHeaders })
if (root.status !== 307 && root.status !== 302) {
  throw new Error(`GET / с cookie: ожидался редирект, получен ${root.status}`)
}
const rootLocation = root.headers.get('location') || ''
if (!rootLocation.includes('/devices')) {
  throw new Error(`GET / с cookie: Location «${rootLocation}» не ведёт на /devices`)
}
```
3. The final SMOKE OK summary (`scripts/smoke-devices.mjs:275`) contains `; / → 307 на /devices;`.

**Replacement pattern to copy** — the 200 + content-probe shape of step 5 (`scripts/smoke-devices.mjs:115-123`), now pointed at `/` and asserting dashboard markers («Дашборд», `?type=`/`?warranty=` href presence). Perimeter (307 → `/login` without cookie) stays.

---

### `tests/dashboard-queries.test.ts` (NEW — vitest unit, role-match)

**Analog:** `tests/devices-queries.test.ts:1-26` — the temp-DB bootstrap every queries test shares (DATABASE_PATH BEFORE the first `@/db` import, dynamic imports, real migrations):
```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { applyMigrations } from './helpers'

const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-devices-'))
process.env.DATABASE_PATH = join(tmpDir, 'devices.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const queries = await import('@/db/queries/devices')
// ...

afterAll(() => {
  db.$client.close()
  rmSync(tmpDir, { recursive: true, force: true })
})
```
Fixtures: seed via real `createDevice` + custody actions (`tests/movements-queries.test.ts` helper pattern) or raw inserts (`tests/devices-perf.test.ts` pattern). The strongest assertion is the D-04 parity pin (RESEARCH Validation Architecture): `expect(warrantyPresetCounts().w60).toBe(listDevices({ type:'all', page:1, pageSize:1, filters:{ warranty:'w60' } }).total)` — the counter is asserted against the filter's own `total` through the public API (`listDevices` signature: `db/queries/devices.ts:246-262`). Also pin: GROUP BY silence on empty DB → all 8 tiles default 0; frozen MSK 00:30 clock boundary (`tests/warranty.test.ts` pattern); feed tie-order and limit-10.

---

### `scripts/smoke-dashboard.mjs` (NEW, optional — role-match)

**Analog:** `scripts/smoke-devices.mjs` steps 1-7 — clone the spawn-temp-DB-`next start`-mint-cookie perimeter harness (cookie minting at `:125-130`, perimeter fetch at `:115-123`), assert: `/` without cookie → 307 `/login`; `/` with cookie → 200 with «Дашборд» + deep-link hrefs (`?type=`, `?status=`, `?warranty=`) + nav item. On a fresh temp DB the feed MUST be expected empty («Перемещений пока нет» — Pitfall 8: `createDevice` writes no movement event, so empty feed is the fresh-install norm, not a bug).

---

### `lib/ru.ts` (utility — optional extend)

**Analog:** the file itself. If UI copy needs «N событий», add `pluralMovements` beside `pluralDevices` — same 8-line recipe (`lib/ru.ts:24-37`):
```ts
const DEVICE_FORMS: Record<Intl.LDMLPluralRule, string> = {
  zero: 'устройств',
  one: 'устройство',
  two: 'устройства',
  few: 'устройства',
  many: 'устройств',
  other: 'устройств',
}

export function pluralDevices(n: number): string {
  const word = DEVICE_FORMS[pluralRules.select(n)]
  return `${n} ${word}`
}
```
«Всего: {pluralDevices(total)}» needs no new helper. The feed date uses the existing module-level formatter (`lib/ru.ts:52-59`):
```ts
export const occurredAtFormat = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
  timeZone: DISPLAY_TZ,
})
```

---

## Shared Patterns

### 1. Server-side session guard
**Source:** `app/(app)/devices/page.tsx:37`, `app/(app)/layout.tsx:14`
**Apply to:** `app/(app)/page.tsx` (first statement).
```tsx
await requireSession() // defense-in-depth: proxy + in-app guard
```
proxy.ts default-deny already covers `/`; the in-app guard is never skipped.

### 2. Warranty single-source (the D-04 invariant)
**Source:** `db/queries/devices.ts:191-203` (`warrantyPredicate`), `lib/warranty.ts:16,24-39` (`WARRANTY_WARN_DAYS=60`, `displayTodayUtc`, `addDaysUtc`), `lib/warranty-date.tsx:40-69` (`WarrantyDate`).
**Apply to:** preset counts (same operators, same module), top-5 window, and every rendered date.
```tsx
<WarrantyDate value={row.warrantyUntil} today={today} variant="card" />
```
`variant="card"` renders the bare colored date (warn orange inside the w60 window); the `variant="list"` prefix ` · гар. до …` belongs to registry rows, not this block. Top-5 line 2 renders the «гар. до » prefix itself as plain secondary text. NEVER hand-write warranty math or a second color switch.

### 3. Keystone reuse — no parallel maps, ever
**Sources (all existing, all tested):**
- Event pills: `movementEventLabel` — `lib/movement-schema.ts:33-35` (7-label map at :18-26, raw-value fallback). NO new event map.
- Status tiles: `deviceStatusLabel` + `DEVICE_STATUS_KEYS` — `lib/device-schema.ts:108-126`.
- Type tiles: iterate `DEVICE_TYPES` — `lib/device-schema.ts:82-87`; but tile LABELS are the filter's PLURAL options byte-exact («Ноутбуки», not `deviceTypeName`'s «Ноутбук») — the canonical list lives in the type-filter island (`app/(app)/devices/type-filter.tsx:24-30`):
```ts
const FILTER_ITEMS = [
  { value: 'all', label: 'Все типы' },
  { value: 'laptop', label: 'Ноутбуки' },
  { value: 'monitor', label: 'Мониторы' },
  { value: 'dock', label: 'Док-станции' },
  { value: 'peripheral', label: 'Периферия' },
] as const
```
(The dashboard's RSC page cannot import this client island's constant directly — replicate the four plural labels in the page as UI-SPEC copy, or lift them to `lib/device-schema.ts`; planner's call. Status tiles use `deviceStatusLabel` as-is, ordered per D-02: assigned, in_stock, repair, disposed.)
- Feed date: `occurredAtFormat` — `lib/ru.ts:52-59`.

### 4. THE ONE URL builder for every tile/counter link
**Source:** `app/(app)/devices/query-params.ts:94-104`, with the `DeviceFilters` full-object shape (`:23-30`):
```ts
buildDevicesQuery({ q:'', type:'laptop', status:'all', departmentId:null, warranty:'all', ramNoUpgrade:false })
// → "?type=laptop"    (sentinels omitted, page omitted at 1)
buildDevicesQuery({ q:'', type:'all', status:'all', departmentId:null, warranty:'w60', ramNoUpgrade:false })
// → "?warranty=w60"
```
**Apply to:** all 8 tile hrefs + 3 warranty counter hrefs. Hand-concatenated filter URLs are forbidden (sentinel-omission and the D-08 ram/type coupling are the builder's job).

### 5. Ordering with the id tiebreaker (append-only tables)
**Source:** `db/queries/movements.ts:385` — `orderBy(desc(movements.occurredAt), desc(movements.id))` (comment at :366-368 explains why: backdated events make insertion order ≠ date order). Top-5 analog: `asc(devices.warrantyUntil), asc(devices.id)`.

### 6. Feed rows: segmented links — the app's FIRST multi-link row
**Closest component is an ANTI-analog:** `app/(app)/(card)/devices/[id]/timeline.tsx:12-13` deliberately renders names as plain text («history is history — nothing is a link»). Do NOT copy that discipline to the feed: D-05 requires device AND employee links. **Do copy** the route-vocabulary switch (`timeline.tsx:17-33`) — same event cases, with «склад» substituting null person slots in custody moves and employee names becoming `<Link>`s:
```tsx
function routeLine(event: MovementEventView): string | null {
  const from = event.fromName ?? '—'
  const to = event.toName ?? '—'
  switch (event.eventType) {
    case 'assigned': return `→ ${to}`
    case 'transferred': return `${from} → ${to}`
    case 'returned': return `← ${from}`
    case 'to_repair': return event.fromName ? `от ${from}` : null
    default: return null // received / from_repair / disposed — no route
  }
}
```
Structural rule (Pitfall 4): the row container has NO href of its own — pill, device `<Link>`, employee `<Link>`s, and date are siblings; nested anchors are invalid HTML and break hydration.

### 7. Pure query modules
**Source:** `db/queries/devices.ts:22-24`, `db/queries/movements.ts:6-8` — no framework imports; sync functions over the module-level `db`; vitest imports them directly. New aggregates follow verbatim (this is why the page, not the module, owns orchestration).

### 8. Empty states — honest quiet copy inside cards
**Source:** `app/(app)/devices/page.tsx:108-151`, `app/(app)/(card)/devices/[id]/timeline.tsx:36-44`:
```tsx
return (
  <p className="px-4 py-2 text-sm text-ink-secondary">
    История появится после первого действия с устройством.
  </p>
)
```
Copy contract fixed by UI-SPEC: warranty «Нет техники с истекающей гарантией»; feed «Перемещений пока нет» + «Здесь появятся выдачи, возвраты и передачи техники.» Counters always render even at «: 0»; all 8 tiles always render (keystone zero-default).

## No Analog Found

| File / Shape | Role | Data Flow | Reason |
|--------------|------|-----------|--------|
| Dashboard tile (28/600 count over 14/400 label) | component | request-response | No summary-tile exists anywhere; styling fully specified by 06-UI-SPEC (Visual Details → Tile) — copy the spec, not code |
| Segmented-link feed row | component | request-response | First multi-link row in the app (timeline = names-as-text by design; list rows = single Link). Shape defined by 06-UI-SPEC Visual Details + RESEARCH Pattern 5 / Pitfall 4 |
| `loading.tsx` for `/` | — | — | Deliberately NOT built (404-matrix hazard at `(app)` level; UI-SPEC Defaults #14). If ever mandated: `(dashboard)` route-group scoping per RESEARCH Pattern 6 option 2 |
| Aggregate count functions (`deviceCountByType/Status`, `warrantyPresetCounts`, `totalDeviceCount`) | model | read aggregate | No GROUP BY aggregate exists yet — but every operator (`count/groupBy/and/gte/lte/lt/isNotNull`) is already imported in `db/queries/devices.ts` and probe-verified (RESEARCH Patterns 1-2); write them beside `warrantyPredicate` |

## Metadata

**Analog search scope:** `app/(app)/` (+ `devices/`, `(card)/devices/[id]/`), `db/queries/`, `lib/`, `scripts/`, `tests/`
**Files scanned:** 15 (9 read in full, 6 grepped/listed)
**Key cross-references honored:** 06-CONTEXT.md D-01..D-06; 06-RESEARCH.md Patterns 1-6, Pitfalls 1-9, Validation Architecture; 06-UI-SPEC.md copy/visual contract
**Pattern extraction date:** 2026-09-13
