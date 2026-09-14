# Phase 6: Dashboard - Research

**Researched:** 2026-09-13/14
**Domain:** Read-model aggregates over SQLite (Drizzle 0.45.2/better-sqlite3 13); pure-RSC dashboard page at `/`; deep links into phase-5 URL filters; movements feed join
**Confidence:** HIGH

## Summary

This phase is assembly, not invention — the dashboard is a pure read-model over machinery that phases 3–5 already probe-verified and the phase-5 review hardened. Everything DASH-01/02/03 needs is expressible with the **existing** predicate machinery: `deviceWhere`/`warrantyPredicate` in `db/queries/devices.ts` (type/status/warranty presets, `WARRANTY_WARN_DAYS=60`, `displayTodayUtc` DISPLAY_TZ boundaries) and the `listTimeline` alias-double-join pattern in `db/queries/movements.ts`. **Zero migrations, zero new packages, zero client islands** (D-06). Every query shape this phase needs was **probed live this session** against the project's installed drizzle + better-sqlite3 + real schema (7/7 probe assertions passed, then the probe file deleted): GROUP BY counts, per-preset warranty counts, top-5 nearest, and the 3-way-joined feed with null person slots and an `occurredAt`+`id` ordering tiebreaker.

Two findings materially constrain the plan. **(1) Date operands cannot ride raw `sql` templates**: `sql\`... >= ${someDate}\`` throws `TypeError: SQLite3 can only bind numbers, strings, bigints, buffers, and null` (probed) — only typed drizzle operators (`gte/lte/lt`) on the `mode:'timestamp'` column convert `Date` → unix seconds. This **kills the single-pass CASE-bucket aggregation** as a safe shape (it would force hand-converting boundaries to unix seconds, re-implementing the timestamp-mode conversion — a drift vector) and settles the aggregate question in favor of **N small counts composed from the same predicate functions** — the D-04 «фильтр-хит не может разойтись» invariant is then structural, not a code-review hope. At hundreds of rows the sync cost is irrelevant (the phase-5 FULL combined filter measured 0.9 ms @ 500 rows; each probe query here ran in ~1 ms). **(2) `loading.tsx` at the `(app)` group level is a 404-matrix hazard**: per the bundled Next 16.3.3 docs, `loading.js` "wraps the page.js file and any children below in a Suspense boundary" — a boundary at `(app)` would sit above the `(card)` device/employee routes and re-introduce exactly the streamed-200-before-`notFound()` bug phase 2 fixed by creating the `(card)` group. Recommend skipping `/`-loading entirely (total query time is single-digit ms) or, if a skeleton is mandated, moving `page.tsx` into a dedicated `(dashboard)` route group carrying its own `loading.tsx`.

Also flagged: `scripts/smoke-devices.mjs` step 8 asserts `GET / → 307 Location /devices` — D-01 removes that redirect, so the smoke **must be updated in the same change** or the phase gate goes red.

**Primary recommendation:** Extend `db/queries/devices.ts` with four exported read-model aggregates co-located with the private predicates (`deviceCountByType/Status` via GROUP BY, `warrantyPresetCounts`, `nearestExpiringWarranties(limit)`) plus `totalDeviceCount`; add one `listRecentMovements(limit=10)` to `db/queries/movements.ts` reusing the alias double-join **with employee ids selected** (unlike `MovementEventView` — the feed deep-links people per D-05). Compose all of it in a pure server component at `app/(app)/page.tsx` (redirect stub deleted), tiles as `<Link>`s built by the ONE `buildDevicesQuery`, nav gains «Дашборд» first, `movementEventLabel` + `occurredAtFormat` + `WarrantyDate` reused for display. No `loading.tsx`, no islands, no new tests harness — extend the temp-SQLite pattern.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Адрес и навигация (D-01):** Дашборд живёт на `/` (текущий `app/(app)/page.tsx`-redirect на /devices убирается). Nav становится: Дашборд · Устройства · Сотрудники (клиентский остров nav.tsx пополняется первым пунктом; active-правило уже умеет подытоживать). `/devices` остаётся как есть.

**Иерархия экрана (D-02):** Сверху — строка сводных тайлов по типам (Ноутбуки N · Мониторы N · Док-станции N · Периферия N) и вторым рядом по статусам (Используется · На складе · В ремонте · Списано); ниже — зона из двух блоков: «Гарантия» и «Последние перемещения». Точная сетка (2 колонки на десктопе со стеком на мобильном) — UI-SPEC.

**Кликабельность тайлов (D-03):** Каждый тайл — ссылка на /devices с готовым фильтром фазы 5 (`?type=laptop`, `?status=repair` и т.д.): deep-link в существующие URL-фильтры, ноль новой выборки. Сумма «Всего: N» над тайлами — некликабельный заголовок.

**Гарантийный блок (D-04):** Три счётчика-строки: «Истекает ≤ 30 дней: N», «Истекает ≤ 60 дней: M», «Истекла: K» — каждая ссылка на готовый гарантийный пресет фазы 5 (`/devices?warranty=w30` / `w60` / `expired`). Под счётчиками — список 5 устройств с ближайшей датой гарантии (только из пресетов ≤60: ещё живые; истёкшие видны кликом на свой счётчик): модель + цветная дата (переиспользуется WarrantyDate) + ссылка в карточку. Гарантийная математика — уже готовый `warrantyState`/`WARRANTY_WARN_DAYS` из фазы 5, фильтр-хит и цвет не могут разойтись.

**Лента перемещений (D-05):** 10 последних событий из append-only `movements`: строка = событие-пилюля (словарь событий фазы 4: выдано/принято/передано/в ремонт/из ремонта/списано/поступление) · модель (серийник mono) · от → кому (или склад) · дата в DISPLAY_TZ ru-форматом. Строка кликабельна → карточка устройства; имена сотрудников — ссылки в карточки сотрудников. Дата не может быть в будущем — тривиально по append-only.

**Данные и свежесть (D-06):** Дашборд — server component без клиентского стейта: каждый заход показывает живые данные (серверные queries-агрегаты GROUP BY по типу/статусу; count'ы пресетов гарантии; последние 10 движений). Ни клиентских островов, ни кэша, ни автообновления.

### Claude's Discretion
- Форма queries-агрегатов (GROUP BY в devices-queries vs отдельный dashboard-queries модуль) — researcher/planner по образцу существующих queries-модулей → **resolved below, Pattern 1**
- Состав полей ленты в SQL (join devices/employees раз vs N+1) — по PATTERNS/RESEARCH → **resolved below, Pattern 4 (one join query)**
- Пустые состояния блоков («Нет техники с истекающей гарантией» — приятный случай)
- Точная копия тайлов/строк — копи-контракт UI-SPEC
- loading.tsx для `/` (скелетон по образцу списков) → **research flags a hazard; see Pitfall 6**

### Deferred Ideas (OUT OF SCOPE)
- Поиск по имени сотрудника / глобальный ⌘K — V2-02 (v1.x)
- Сохранённые смарт-фильтры — V2-01
- Автообновление дашборда (polling/SSE) — не нужно одному оператору на LAN
- Графики/история закупок по месяцам — вне v1

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | Dashboard with device counts by type and status | Pattern 1: GROUP BY probes (`{typeKey, n}` / `{status, n}`) verified; zero-tiles default from `DEVICE_TYPES`/`DEVICE_STATUS_KEYS` keys (absent types produce NO SQL row — probed); total via `count()` |
| DASH-02 | List of devices with expiring/expired warranty | Pattern 2/3: preset counts reuse the exact `warrantyPredicate` operator shape (probed boundaries: w30=1, w60=3, expired=1, NULL excluded); top-5 = w60 window + `asc(warrantyUntil), asc(id)` + `limit 5` (probed); colors via existing `WarrantyDate` |
| DASH-03 | Recent movements feed | Pattern 4: `innerJoin devices` + aliased `from_emp`/`to_emp` leftJoins, `desc(occurredAt), desc(id)` tiebreaker (probed with tied instants), null slots survive as null names, employee ids selected for D-05 links, `limit 10` |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Type/status/warranty/total aggregates | Database / Storage (queries module, SQLite) | — | Counts MUST be composed from the same predicates as the filters (D-04 invariant); better-sqlite3 sync, ~1 ms each at this scale |
| Movements feed (latest 10, 3-way join) | Database / Storage (`db/queries/movements.ts`) | — | One join query in the listTimeline pattern; append-only table is read-only here |
| Warranty colors in top-5 | API/Backend (pure lib: `warrantyState` + `WarrantyDate`) | — | Already THE single calculation shared with the filter — dashboard is just render site #4 |
| Dashboard page composition | Frontend Server (RSC at `/`) | — | D-06: pure server component, live data per navigation, zero client state/cache/polling |
| Tile deep links | Frontend Server (RSC) via `query-params.ts` builder | Browser (plain `<Link>`) | ONE URL vocabulary (`buildDevicesQuery`) — the /devices page revalidates every param server-side anyway |
| Nav «Дашборд» active state | Browser (existing client island `nav.tsx`) | — | Only pathname awareness needs client JS — existing island, add one array entry |

## Standard Stack

**No new packages.** Everything is built from the installed stack (versions read from `package.json`/`node_modules` this session).

### Core (already installed)
| Library | Version | Purpose in this phase | Why |
|---------|---------|----------------------|-----|
| better-sqlite3 | 13.0.3 | Sync aggregate queries over temp/prod SQLite | Verified: GROUP BY/COUNT/joins run in ~1 ms at hundreds of rows (probe + phase-5 measurement) |
| drizzle-orm | 0.45.2 | `count/groupBy/and/gte/lte/lt/isNotNull/asc/desc/eq` + `alias` | All verified exported and working in 0.45.2 by this session's probe; typed operators are the ONLY safe way to pass `Date` operands (Pitfall 2) |
| next (App Router) | 16.3.3 | RSC page at `/`; `<Link>`; metadata title; loading.js convention (understood, deliberately not used) | loading.js behavior verified from bundled docs `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md` (authoritative for the installed version per AGENTS.md) |
| react | 19.2.8 | Server component render only — no hooks on this page | D-06 |

### Supporting (existing project modules — reuse, don't parallel)
| Module | Purpose | When |
|--------|---------|------|
| `db/queries/devices.ts` (`deviceWhere`, `warrantyPredicate`, `ruSortKey`) | THE predicate source the aggregates must compose | Every count and the top-5 (Pattern 1/2/3) |
| `db/queries/movements.ts` (`listTimeline` alias double-join, `desc/desc` order) | Join pattern for the feed | Pattern 4 |
| `lib/warranty.ts` (`warrantyState`, `displayTodayUtc`, `WARRANTY_WARN_DAYS=60`, `addDaysUtc`) | Warranty math + MSK "today" | Warranty counters and top-5 boundaries (D-04) |
| `lib/warranty-date.tsx` (`WarrantyDate`, `formatWarrantyDate`) | Colored date, variant `card` fits the compact list | Top-5 rows (D-04 «переиспользуется WarrantyDate») |
| `lib/device-schema.ts` (`DEVICE_TYPES`, `DEVICE_STATUS_KEYS`, `deviceTypeName`, `deviceStatusLabel`) | Tile labels + the zero-default key lists | Type/status tiles (DASH-01) |
| `lib/movement-schema.ts` (`movementEventLabel`) | Event pill labels — the dictionary ALREADY exists («Поступление/Выдача/Передача/Возврат/В ремонт/Из ремонта/Списание»), falls back to the raw value | Feed rows (D-05) — no new map |
| `lib/ru.ts` (`pluralDevices`, `DISPLAY_TZ`, `occurredAtFormat`) | «Всего: N устройств»; feed date «дд.мм.гггг, чч:мм» in MSK | Headline + feed rows |
| `app/(app)/devices/query-params.ts` (`buildDevicesQuery`) | THE URL builder for every tile/counter link | D-03 deep links |
| `components/ui/*` + apple-design tokens | Tile/block styling per 05-UI-SPEC tokens | UI-SPEC (planner) |

**Installation:** nothing to install.

## Package Legitimacy Audit

> Protocol triggered only when the phase installs external packages. **This phase installs zero new packages** — verified: aggregates use installed drizzle/better-sqlite3; dates use Intl built-ins; no charts (D-02 tiles are text counts; графики explicitly deferred).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none — no new installs) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
**Explicitly rejected for this phase:** any chart/date library (recharts, date-fns) — the locked decisions specify text tiles and reuse of existing Intl recipes; adding a visualization dep contradicts the deferred-ideas list.

## Architecture Patterns

### System Architecture Diagram

```
        Browser (no new client JS — D-06)
   ┌───────────────────────────────────────────────────────┐
   │  nav.tsx island (existing) gains: Дашборд │ Устройства │ Сотрудники
   │  clicks = plain Link navigations → server always rerenders
   └──────────────────────────┬────────────────────────────┘
                              │ GET /
                              ▼
   ┌───────────────────────────────────────────────────────┐
   │ proxy.ts (default-deny; matcher covers / — verified)  │
   └──────────────────────────┬────────────────────────────┘
                              ▼
   ┌───────────────────────────────────────────────────────┐
   │ RSC app/(app)/page.tsx   (redirect stub DELETED)      │
   │  requireSession() → in parallel-by-nature sync calls: │
   │   devices.ts aggregates:                              │
   │     countByType ── GROUP BY type_key                  │
   │     countByStatus ── GROUP BY status                  │
   │     total ── count()                                  │
   │     warrantyPresetCounts ── 3× the phase-5 predicate  │
   │     nearestExpiring(5) ── w60 window, asc, limit      │
   │   movements.ts: listRecentMovements(10)               │
   │     innerJoin devices ← leftJoin from_emp/to_emp      │
   └───────────────┬───────────────────────┬───────────────┘
                   ▼                       ▼
   ┌────────────────────────┐   ┌───────────────────────────┐
   │ SQLite (better-sqlite3)│   │ Render: tiles → <Link> to │
   │ devices / movements /  │   │ /devices?type=… status=…  │
   │ employees (read only)  │   │ warranty=w30|w60|expired  │
   └────────────────────────┘   │ feed rows → /devices/[id] │
                                │ names → /employees/[id]   │
                                └───────────────────────────┘
```

Primary use case: open `/` → session verified → 7–8 tiny sync queries → tiles + warranty block + feed render → every tile/counter is a deep link into an already-validated `/devices` filter URL. No mutations anywhere; the movements table is touched by SELECT only.

### Recommended Project Structure

```
app/(app)/
├── page.tsx                  # REWRITE: dashboard RSC (redirect stub removed, D-01)
├── nav.tsx                   # EXTEND: NAV_ITEMS gains { href: '/', label: 'Дашборд' } FIRST
└── devices/query-params.ts   # (unchanged) — buildDevicesQuery consumed by tile links
db/queries/
├── devices.ts                # EXTEND: 4 exported aggregates co-located with deviceWhere/warrantyPredicate
└── movements.ts              # EXTEND: listRecentMovements(limit = 10)
lib/
├── ru.ts                     # OPTIONAL extend: pluralMovements (copy may need «N событий») — same recipe as pluralDevices
└── (warranty.ts / warranty-date.tsx / device-schema.ts / movement-schema.ts — unchanged, reused as-is)
scripts/
└── smoke-devices.mjs         # UPDATE step 8: / no longer redirects (asserts 200 + dashboard probes instead)
scripts/
└── smoke-dashboard.mjs       # NEW optional: perimeter + render + deep-link probes on the :31xx pattern
tests/
└── dashboard-queries.test.ts # NEW: counts/list parity, warranty boundaries + TZ, feed ordering/joins (temp-SQLite harness)
```

### Pattern 1: Aggregates co-located with the predicates (resolves a CONTEXT discretion item)

**What:** the counts live in `db/queries/devices.ts`, right next to the private `deviceWhere`/`warrantyPredicate`, as small exported functions. NOT a new `db/queries/dashboard.ts`: exporting `deviceWhere` (or re-implementing its terms in a second module) widens the predicate surface and creates a drift path — the whole point of D-04 is that the dashboard counts ARE the filter predicates. The page composes modules; the predicates stay module-private.

**When to use:** DASH-01 tiles, the «Всего» headline, DASH-02 counters.

```ts
// db/queries/devices.ts — probed shapes (drizzle 0.45.2, 7/7 assertions passed)
export type TypeCount = { typeKey: DeviceTypeKey; n: number }
export function deviceCountByType(): TypeCount[] {
  return db.select({ typeKey: devices.typeKey, n: count() })
    .from(devices).groupBy(devices.typeKey).all()
}
export function deviceCountByStatus(): Array<{ status: DeviceStatusKey; n: number }> { /* same shape on devices.status */ }
export function totalDeviceCount(): number {
  return db.select({ value: count() }).from(devices).get()!.value
}
```

**Zero-tiles rule (probe-verified):** GROUP BY returns **no row for an absent type/status** (a fresh DB yields `[]`). Tiles are rendered by iterating `DEVICE_TYPES` / `DEVICE_STATUS_KEYS` from the keystone and looking up `Map.get(key) ?? 0` — the keystone, not SQL, guarantees all four tiles always exist. An unknown status in the data cannot produce a phantom tile.

**Why N small counts, not one pass:** see Pitfall 2 — the single-pass CASE shape cannot bind `Date` operands and would have to hand-convert boundaries to unix seconds. Four preset counts + two GROUP BYs + total ≈ 7 queries × ~1 ms, all sharing the module's existing predicate code. Simplest correct composition wins (D-06 latitude: «простейшая корректная композиция»).

### Pattern 2: Warranty preset counts — literally the phase-5 predicate, re-composed from the same functions

**What:** each counter runs the exact operator composition of `warrantyPredicate` (same `displayTodayUtc()` today, same inclusive `WARRANTY_WARN_DAYS=60` window, same `isNotNull` guard for expired, NULL excluded everywhere). Where `warrantyPredicate` is not directly reusable (it returns a where-clause, not a count), the count functions live in the SAME module and are pinned to it by tests (Validation Architecture: counter == filter-list parity).

```ts
// probed — boundaries identical to warrantyPredicate (db/queries/devices.ts)
const today = displayTodayUtc()                 // once per page render, passed to counts + WarrantyDate
// w30 / w60 (active-only, inclusive):
and(isNotNull(devices.warrantyUntil), gte(devices.warrantyUntil, today),
    lte(devices.warrantyUntil, addDaysUtc(today, days)))          // days = 30 | WARRANTY_WARN_DAYS
// expired:
and(isNotNull(devices.warrantyUntil), lt(devices.warrantyUntil, today))
```

Probe results (6 devices, 4 with warranties): w30=1, w60=3 (superset incl. the +59 dock), expired=1, NULL-warranty device matched nothing. A device expiring exactly today is active (in w30 AND w60, not expired) — matches the unified inclusive boundary locked in phase 5.

### Pattern 3: Top-5 nearest still-alive warranties

**What:** the w60 window (same predicate as Pattern 2 / the `w60` filter) ordered by soonest expiry, limited to 5 — «ещё живые», exactly the CONTEXT wording; expired devices are reachable through their own counter link.

```ts
// probed — returns ['Ноут Альфа' (+10), 'Ноут Бета' (+45), 'Док Зета' (+59)]
export function nearestExpiringWarranties(limit = 5) {
  const today = displayTodayUtc()
  return db
    .select({ id: devices.id, model: devices.model, warrantyUntil: devices.warrantyUntil })
    .from(devices)
    .where(and(
      isNotNull(devices.warrantyUntil),
      gte(devices.warrantyUntil, today),
      lte(devices.warrantyUntil, addDaysUtc(today, WARRANTY_WARN_DAYS)),
    ))
    .orderBy(asc(devices.warrantyUntil), asc(devices.id))   // id tiebreaker for same-day expiries
    .limit(limit)
    .all()
}
```

`warrantyUntil` materializes as a `Date` (timestamp mode, probe-verified) — feed it straight to `<WarrantyDate value today variant="card" />` (card variant renders just the colored date; the list variant's ` · гар. до …` prefix fits registry rows, not this block).

### Pattern 4: Movements feed — one join query, ids included, timeline ordering precedent

**What:** a single query (NOT N+1 — resolves the second CONTEXT discretion item): `movements` inner-joins `devices` (FK is `NOT NULL` + `onDelete: restrict`, and disposal never deletes devices, so inner == left and no row can drop), double-left-joins aliased `employees` for names. Unlike `MovementEventView` (timeline renders names as plain text), the feed must **also select `fromEmp.id` / `toEmp.id`** — D-05 turns names into `/employees/[id]` links, and a link needs the id, not just the label.

```ts
// db/queries/movements.ts — probed end-to-end (ordering, nulls, ties, types)
export type RecentMovementView = {
  id: number
  eventType: string
  occurredAt: Date
  deviceId: number
  model: string
  serialNumber: string
  fromId: number | null
  fromName: string | null
  toId: number | null
  toName: string | null
}
export function listRecentMovements(limit = 10): RecentMovementView[] {
  const fromEmp = alias(employees, 'from_emp')
  const toEmp = alias(employees, 'to_emp')
  return db.select({ /* fields above */ })
    .from(movements)
    .innerJoin(devices, eq(movements.deviceId, devices.id))
    .leftJoin(fromEmp, eq(movements.fromEmployeeId, fromEmp.id))
    .leftJoin(toEmp, eq(movements.toEmployeeId, toEmp.id))
    .orderBy(desc(movements.occurredAt), desc(movements.id))   // listTimeline precedent
    .limit(limit)
    .all()
}
```

Probe-verified behaviors: a tied `occurredAt` pair orders by higher `id` first (backdated events sort by their own dates, insertion order never leaks — same rationale as `listTimeline`'s comment); `received`/`to_repair` null slots survive as `null` names («склад» case); `occurredAt` is a `Date` for `occurredAtFormat`. Event labels: reuse `movementEventLabel` — the dictionary («Поступление…Списание») already lives in `lib/movement-schema.ts` with a raw-value fallback; **no new display map**. No index exists on bare `occurred_at` (frozen migration) and none is needed: a 670-row scan ordering DESC is sub-millisecond, and the table is append-only (grows slowly, single operator).

### Pattern 5: Page composition — pure RSC, builder-built deep links, segmented-link feed rows

```tsx
// app/(app)/page.tsx — shape (copy/styling per UI-SPEC, planner)
export const metadata: Metadata = { title: 'Дашборд' }
export default async function DashboardPage() {
  await requireSession()                       // defense-in-depth, same as every (app) page
  const today = displayTodayUtc()              // ONCE per render → counts + WarrantyDate (phase-5 contract)
  const byType = new Map(deviceCountByType().map(r => [r.typeKey, r.n]))
  const byStatus = new Map(deviceCountByStatus().map(r => [r.status, r.n]))
  // …warranty counts, nearest, feed…
  // Tiles: DEVICE_TYPES.map + <Link href={buildDevicesQuery({ q:'', type:t.key, status:'all',
  //   departmentId:null, warranty:'all', ramNoUpgrade:false })}> — the ONE builder emits
  //   "?type=laptop" (sentinels omitted, page omitted at 1). NEVER hand-concat filter URLs.
  // «Всего: {pluralDevices(total)}» — plain text, NOT a link (D-03).
}
```

- **Feed rows cannot be one big `<Link>`** (Pitfall 4): the row links to `/devices/[id]` AND contains employee links. Compose segmented links in one hover-styled row: pill (`movementEventLabel`) · `<Link href={`/devices/${deviceId}`}>модель <span mono>серийник</span></Link>` · from → to (`<Link href={`/employees/${id}`}>` or «склад» for null) · `occurredAtFormat.format(occurredAt)`.
- **Nav:** `NAV_ITEMS` in `nav.tsx` gains `{ href: '/', label: 'Дашборд' }` first. The existing active rule (`pathname === item.href || startsWith(item.href + '/')`) matches `/` exactly; `startsWith('//')` is never true — no rule change needed (D-01's «active-правило уже умеет» verified by reading the code).
- **Login flow consistency:** `app/login/actions.ts:59` redirects to `/` — after this phase a fresh login lands directly on the dashboard (previously `/` → `/devices`, so behavior is preserved, one hop shorter). `proxy.ts:17` sends an already-authenticated `/login` visit to `/` — now meaningful, no change required.
- **vercel-react-best-practices applicability:** `server-serialization` — nothing new crosses the RSC boundary (no islands on this page; nav island keeps its static constants). `server-hoist-static-io` — Intl formatters already module-level in `lib/ru.ts`/`lib/warranty-date.tsx`; `displayTodayUtc()` computed once per render, passed down (the established WarrantyDate contract). `async-parallel` N/A — better-sqlite3 is sync; queries execute sequentially at ~1 ms total. `rendering-conditional-render` — use ternaries for empty-state branches. `server-no-shared-module-state` — queries modules already comply (pure functions over the module-level db).

### Pattern 6: `loading.tsx` for `/` — the safe options (resolves a CONTEXT discretion item with a hazard)

**Hazard (verified from the bundled Next 16.3.3 loading.md + repo history):** `loading.js` "wraps the page.js file **and any children below** in a Suspense boundary." The only place a `/`-loading can live is `app/(app)/loading.tsx` — which would sit ABOVE the `(card)` group containing `/devices/[id]` and `/employees/[id]`, re-introducing the phase-2 bug («сегментный loading.tsx стримит поддерево с дочерними сегментами и флешит 200 до notFound()», STATE.md; the smoke asserts hard 404s on `/devices/99999|abc`).

**Options, in recommendation order:**
1. **Skip it (recommended).** The page runs ~8 sync SQLite queries (single-digit ms total, measured class) behind a cookie verify — there is no perceivable loading state on LAN; `devices/loading.tsx` exists for 600-row list + cover batches, a different profile.
2. **Route-group scoping:** move `page.tsx` → `app/(app)/(dashboard)/page.tsx` (route groups don't affect the URL) with `(dashboard)/loading.tsx` beside it. The boundary then wraps only the leaf dashboard page, never the `(card)` routes. Requires deleting the old `page.tsx` (two files resolving to `/` is a build conflict).

### Anti-Patterns to Avoid
- **Hand-written SQL strings for the counters** (`WHERE warranty_until < strftime(...)` etc.): drifts from `warrantyPredicate` (D-04 violation), and raw templates cannot bind `Date` anyway (Pitfall 2). Compose the same drizzle operators in the same module.
- **`date('now')` / server-clock boundaries in SQL:** the CR-01 bug class verbatim — the UTC container's "today" is wrong during MSK 00:00–03:00. Boundaries come from `displayTodayUtc()` in JS, bound as operands.
- **Single-pass CASE aggregation:** forces unix-second hand-conversion (Pitfall 2); N counts are trivially fast and share predicate code.
- **Zero-tiles from SQL rows alone:** absent types produce no GROUP BY row — iterate the keystone lists, default 0.
- **One `<Link>` wrapping an entire feed row that contains employee `<Link>`s:** nested anchors are invalid HTML and break hydration.
- **Copying `timeline.tsx`'s names-as-plain-text discipline to the feed:** that rule is timeline-specific («history is history»); D-05 explicitly requires employee links on the dashboard, hence ids in the SELECT.
- **A new event-label map or a new date formatter:** `movementEventLabel` and `occurredAtFormat` already exist and are tested; a parallel map WILL drift (the keystone rule of this repo).
- **Adding `(app)/loading.tsx` naively:** re-breaks the `[id]` 404 matrix (Pattern 6).
- **Hand-concatenated tile URLs (`/devices?type=laptop&…` strings):** bypasses `buildDevicesQuery`; the builder owns sentinel-omission and the D-08 ram/type coupling.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Warranty state/color | A dashboard-specific date-diff or color switch | `warrantyState` + `<WarrantyDate variant="card">` | THE one calculation shared by filter + 3 render sites (D-04 pins it); a 4th divergent copy is the exact drift D-04 forbids |
| "Today" in MSK | `new Date()` math, `date('now')` | `displayTodayUtc()` | CR-01 recipe, frozen-clock tested in `tests/warranty.test.ts` |
| Event pill labels | A new eventType→ru map in the page | `movementEventLabel` (lib/movement-schema.ts) | Keystone dictionary with raw-value fallback; already exercised by timeline tests |
| Feed date formatting | A new formatter | `occurredAtFormat` (lib/ru.ts) | DISPLAY_TZ ru «дд.мм.гггг, чч:мм», module-level Intl instance |
| Tile URLs | String concatenation | `buildDevicesQuery` (query-params.ts) | One URL vocabulary; sentinels/coupling already correct |
| Russian plural for counters | Ad-hoc «N устройств(а)» | `pluralDevices` (and add `pluralMovements` beside it if copy needs «N событий» — 8-line recipe, tested class) | `Intl.PluralRules('ru')` forms already encoded |
| Latest-N ordering | `occurredAt` sort without tiebreaker | `desc(occurredAt), desc(id)` | Backdated events make insertion order ≠ date order; probe showed tied instants are real (probed with an actual tie) |

**Key insight:** the dashboard is the fourth consumer of machinery built for exactly this — its only genuinely new code is four small count functions, one join query, and the page itself.

## Runtime State Inventory

> Omitted — this is a feature phase (read-only dashboard), not a rename/refactor/migration. No stored strings, service configs, OS registrations, secret names, or build artifacts are renamed. Verified: zero schema changes (aggregates read existing columns/indexes); the only "runtime" behavior change is `/` no longer redirecting, covered by the smoke update in Pitfall 7.

## Common Pitfalls

### Pitfall 1: Counters drift from the filter lists (the D-04 invariant)
**What goes wrong:** the dashboard says «Истекает ≤ 60 дней: 3» but `/devices?warranty=w60` lists 4 — a second, hand-written where-composition diverges from `warrantyPredicate` (different boundary, forgotten `isNotNull`, NULL semantics).
**Why it happens:** copying the predicate "by eye" into a new module/function instead of composing it.
**How to avoid:** the count functions live in `db/queries/devices.ts` beside the predicate and reuse the same operator composition; tests pin counter == filter-list parity (Validation Architecture).
**Warning signs:** any `warranty_until` comparison outside `lib/warranty` boundary functions; a dashboard module importing only `db` and `devices` but not the warranty boundary helpers.

### Pitfall 2: `Date` operands in raw `sql` templates throw
**What goes wrong:** `sql\`${devices.warrantyUntil} >= ${today}\`` → `TypeError: SQLite3 can only bind numbers, strings, bigints, buffers, and null` (probed this session).
**Why:** inside a raw `sql` fragment the value binds as-is; only typed operators on a `mode:'timestamp'` column run `mapToDriverValue` (Date → unix seconds).
**How to avoid:** `gte/lte/lt/isNotNull(devices.warrantyUntil, …)` operators only; if raw SQL is ever unavoidable, convert with `Math.floor(d.getTime()/1000)` explicitly (and write a comment naming this pitfall).
**Warning signs:** the error above at first request; "works in tests, crashes in prod" is not possible here — it fails everywhere, immediately.

### Pitfall 3: GROUP BY silence on empty/absent buckets
**What goes wrong:** fresh install → `deviceCountByType()` returns `[]` → tiles vanish instead of showing «0».
**Why:** SQL groups only over existing rows.
**How to avoid:** render tiles from `DEVICE_TYPES`/`DEVICE_STATUS_KEYS` keys with `?? 0` (Pattern 1).
**Warning signs:** a dashboard screenshot from the seeded dev DB looks fine but the smoke's fresh temp DB shows no tile row.

### Pitfall 4: Nested anchors in feed rows
**What goes wrong:** `<Link href="/devices/1"><Link href="/employees/2">Анна</Link></Link>` — invalid HTML; the browser and React hydration both misbehave (the inner link is hoisted/broken).
**How to avoid:** segmented links in one row (Pattern 5): device link, person links, date as siblings inside a hover-styled row container.
**Warning signs:** hydration error «<a> cannot appear as a descendant of <a>»; clicking a name navigates to the device instead.

### Pitfall 5: Feed ordering ambiguous without the id tiebreaker
**What goes wrong:** two events at the same instant (backdated entries, or seed bursts) interleave nondeterministically between requests.
**Why:** SQLite makes no ordering promise among equal keys.
**How to avoid:** `desc(movements.occurredAt), desc(movements.id)` — the `listTimeline` precedent, probe-verified with a real tie.
**Warning signs:** feed rows swap positions across reloads; flaky ordering assertions.

### Pitfall 6: `(app)/loading.tsx` re-breaks the 404 matrix
**What goes wrong:** a loading boundary above the `(card)` group streams a 200 shell before `notFound()` resolves on `/devices/99999` — the phase-2 bug (STATE.md: «сегментный loading.tsx … флешит 200 до notFound()») returns, and `smoke-devices.mjs` step 11 fails.
**How to avoid:** skip `/`-loading (recommended — queries are single-digit ms) or use the `(dashboard)` route-group scoping (Pattern 6).
**Warning signs:** smoke 404 assertions receiving 200; any new `loading.tsx` above `(card)`.

### Pitfall 7: `smoke-devices.mjs` step 8 asserts the old redirect
**What goes wrong:** D-01 removes `redirect('/devices')` — the smoke's `GET / → 307 Location /devices` assertion fails and the phase gate goes red even though the feature is correct.
**How to avoid:** update step 8 in the same task that rewrites `page.tsx` (assert 200 + dashboard probes), and extend the smoke with deep-link presence checks (`?type=`, `?warranty=` hrefs, «Дашборд» nav).
**Warning signs:** red smoke right after the page rewrite — expected, not a regression signal.

### Pitfall 8: Feed empty state is the NORMAL fresh-install case
**What goes wrong:** assuming an empty feed means a bug — `createDevice` writes **no** movement event (verified: no `received` insert exists in app code; `received` rows come only from the seed), so a fresh DB has zero feed rows indefinitely until the first custody action.
**How to avoid:** honest empty copy per the copy table («Перемещений пока нет» class); smoke on a fresh temp DB must expect the empty feed, not seeded rows.
**Warning signs:** a smoke/probe expecting feed content on an unseeded database.

### Pitfall 9: Titles/meta drift
**What goes wrong:** the tab still reads «Учёт техники» on `/` because no page-level metadata is exported.
**How to avoid:** `export const metadata = { title: 'Дашборд' }` (employees/devices pages set theirs; root default is «Учёт техники»).
**Warning signs:** cosmetic only — catch it in verify-work.

## Code Examples

All probe-verified this session against the project's installed drizzle 0.45.2 + better-sqlite3 13.0.3 + the real `db/schema.ts` (7/7 assertions; probe file deleted after).

### GROUP BY counts (probe output)
```ts
db.select({ typeKey: devices.typeKey, n: count() }).from(devices).groupBy(devices.typeKey).all()
// → [{typeKey:'dock',n:1},{typeKey:'laptop',n:3},{typeKey:'monitor',n:2}]  — no 'peripheral' row
```

### Warranty preset count == filter predicate (probe: w30=1, w60=3, expired=1, NULL excluded)
```ts
// w30/w60: and(isNotNull(warrantyUntil), gte(wu, today), lte(wu, addDaysUtc(today, days)))
// expired: and(isNotNull(warrantyUntil), lt(wu, today))
// today = displayTodayUtc() — one call per page render
```

### Top-5 nearest (probe order preserved)
```ts
.orderBy(asc(devices.warrantyUntil), asc(devices.id)).limit(5)
// → [+10 days, +45, +59] — soonest first; each warrantyUntil is a Date (UTC midnight)
```

### Feed row (probe: 6 events, tie pair ordered by id DESC, null slots survived)
```ts
.innerJoin(devices, eq(movements.deviceId, devices.id))
.leftJoin(alias(employees,'from_emp'), eq(movements.fromEmployeeId, fromEmp.id))
.leftJoin(alias(employees,'to_emp'), eq(movements.toEmployeeId, toEmp.id))
.orderBy(desc(movements.occurredAt), desc(movements.id)).limit(10)
// feed[2] = { eventType:'transferred', fromName:'Анна А', toName:'Борис Б', toId:2, … }
// feed[4] = { eventType:'received', fromName:null, toName:null }  ← «склад» case
```

### Tile link via the ONE builder (existing code, `query-params.ts:94`)
```ts
buildDevicesQuery({ q:'', type:'laptop', status:'all', departmentId:null, warranty:'all', ramNoUpgrade:false })
// → "?type=laptop"    (sentinels omitted, page omitted at 1)
buildDevicesQuery({ q:'', type:'all', status:'all', departmentId:null, warranty:'w60', ramNoUpgrade:false })
// → "?warranty=w60"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `/` = redirect stub to /devices | `/` = dashboard RSC | This phase (D-01) | nav gains first item; smoke step 8 updated; login lands on the summary |
| Warranty knowledge in 3 render sites | 4th consumer (dashboard block) of the same `warrantyState` | This phase | Zero new warranty math — the D-04 invariant holds by construction |
| Timeline = only movements surface (names as text) | Feed = second surface (names as links, ids selected) | This phase | `MovementEventView` stays as-is; the feed gets its own view type |
| N/A | Raw-`sql`-with-Date ban (probe-learned) | This session | Future phases: typed operators only on timestamp columns |

**Deprecated/outdated (in this repo):** none removed by this phase; the `redirect('/devices')` stub is the deliberate removal (D-01).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Aggregates live in `db/queries/devices.ts` + `db/queries/movements.ts` rather than a new `db/queries/dashboard.ts` (CONTEXT explicitly delegated this to researcher/planner) | Pattern 1 | Low — a `dashboard.ts` re-exporting these functions is a mechanical refactor if preferred; the invariant (shared predicates) is what matters |
| A2 | Feed rows use segmented links (not a full-row anchor) since D-05 requires both row→device and name→employee targets | Pattern 5 / Pitfall 4 | Cosmetic/UX — if the user insists on a full-row click, names must degrade to plain text (contradicts D-05) or a client island appears (contradicts D-06); segmented links are the only shape satisfying both |
| A3 | `loading.tsx` for `/` is skipped (or route-group scoped) — CONTEXT listed it as discretion | Pattern 6 | Low — page renders in single-digit ms; if the user wants a skeleton, use option 2 |
| A4 | Dashboard copy («Всего», block titles, empty states, plural «событий» if used) finalized by the planner's UI-SPEC per the copy contract | Discretion | Cosmetic |
| A5 | Tile grid (2-col desktop / stack mobile) is a UI-SPEC concern; research only pins the block order (D-02) | Pattern 5 | Cosmetic |
| A6 | The one-off test flake observed once this session (1 failed / 278 on first run, then 2× clean 278/278) is timing noise, not a baseline change | Validation | Low — baselines re-measured live at execution time per STATE discipline |

## Open Questions

1. **Feed row click target granularity** — the only UX-shape decision research couldn't settle alone.
   - What we know: D-05 locks both «строка кликабельна → карточка устройства» and «имена сотрудников — ссылки». HTML forbids nested anchors; a pure-RSC page has no row-level onClick.
   - Recommendation: segmented links (A2) — model link is the row's primary affordance, hover styling spans the whole row.
   - Handling: flag in the plan; UI-SPEC fixes the visual.

2. **`pluralMovements` / block copy details** — deferred to the UI-SPEC copy contract (A4); the `lib/ru.ts` recipe exists if needed. No research gap.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | everything | ✓ | v22.23.0 (live-verified) | — |
| better-sqlite3 | aggregates, tests | ✓ | 13.0.3 (package.json) | — |
| drizzle-orm operators (`count/groupBy/and/gte/lte/lt/isNotNull/asc/desc/eq`, `alias`) | queries | ✓ | 0.45.2 (all probe-exercised) | — |
| next | RSC page, Link, metadata | ✓ | 16.3.3 | — |
| vitest | tests | ✓ | 4.1.11 (live-verified) | — |
| `next start` ephemeral-port pattern | optional new smoke | ✓ | existing scripts/smoke-*.mjs pattern (3 scripts in repo) | skip — vitest covers the queries; perimeter unchanged |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.11 (node env) + repo smoke-script pattern (`scripts/smoke-*.mjs`: temp DB + `next start` + minted jose cookie) |
| Config file | `vitest.config.ts` (exists; `@` alias + server-only stub) |
| Quick run command | `npx vitest run tests/dashboard-queries.test.ts` |
| Full suite command | `npx vitest run` — baseline live-measured this session: **18 files / 278 tests, ~1.5 s** (matches STATE; one one-off flake on first run, 2× clean after — A6) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Type/status counts equal raw SQL counts AND `listDevices` totals; all 4 tiles exist (zero-default) on an empty DB; «Всего» = sum | unit (queries, temp SQLite) | `npx vitest run tests/dashboard-queries.test.ts` | ❌ Wave 0 |
| DASH-02 | Counter == its filter list: `warrantyPresetCounts().w60 === listDevices({warranty:'w60'}).total` (and w30/expired); top-5 = first 5 of the w60 list by `(warrantyUntil, id)`; frozen MSK_0030 clock: device expiring "today" (MSK) counts w30/w60, not expired; NULL-warranty matches nothing | unit (queries + frozen clocks — extend the `tests/warranty.test.ts` MSK_0030 pattern) | `npx vitest run tests/dashboard-queries.test.ts` | ❌ Wave 0 |
| DASH-03 | Feed ordering stable under an `occurredAt` tie (id DESC); limit 10 holds with 12 seeded events (newest 10, order preserved); null from/to slots; device model/serial join correct; employee ids present for links; `movementEventLabel` covers all 7 event types (raw-value fallback included) | unit (queries; fixtures via `assignDevice`/`transferDevice`/… actions like `tests/movements-queries.test.ts`) | `npx vitest run tests/dashboard-queries.test.ts` | ❌ Wave 0 |
| D-01/D-03 (integration) | `/` renders 200 with cookie (307→/login without); tiles/counter deep-link hrefs (`?type=`, `?status=`, `?warranty=`) present in HTML; nav «Дашборд» present; **old redirect assertion updated** | smoke (`scripts/smoke-dashboard.mjs` on the :31xx pattern + **edit `smoke-devices.mjs` step 8**) | `node scripts/smoke-dashboard.mjs` | ❌ Wave 0 (new) + update |

**Parity-test note (the D-04 pin):** the strongest drift guard is `expect(warrantyCounts.w60).toBe(listDevices({ type:'all', page:1, pageSize:1, filters:{ warranty:'w60' } }).total)` — the dashboard counter is asserted against the FILTER's own total through the public API, so any predicate divergence fails loudly. Same shape for type/status tiles vs `listDevices({type}).total`. Seed via the real `createDevice` + custody actions (fresh serial per test, `tests/movements-queries.test.ts` helper pattern) or raw inserts (`tests/devices-perf.test.ts` pattern) — both harnesses exist.

### Sampling Rate
- **Per task commit:** `npx vitest run tests/dashboard-queries.test.ts` (fast, focused)
- **Per wave merge:** `npx vitest run`
- **Phase gate:** full suite green + `npm run build` + smoke scripts (`smoke-dashboard.mjs` + updated `smoke-devices.mjs`) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/dashboard-queries.test.ts` — covers DASH-01/02/03 incl. parity assertions, TZ boundary, feed tie/limit (new file; temp-DB bootstrap = `tests/devices-queries.test.ts` lines 1–25 pattern: `DATABASE_PATH` before first `@/db` import, `applyMigrations(db.$client)`)
- [ ] `scripts/smoke-devices.mjs` step 8 — root no longer redirects (must ship with the page rewrite, not after)
- [ ] `scripts/smoke-dashboard.mjs` — perimeter + render + deep-link probes (clone of `smoke-devices.mjs` steps 1–7)
- [ ] Framework install: none needed

## Security Domain

> security_enforcement: true, ASVS Level 1 (config.json). This phase's surface is minimal: one new authenticated READ page, no params, no mutations, no file output.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no (existing session only) | requireSession pattern unchanged |
| V3 Session Management | no (reused) | jose HttpOnly cookie; proxy verifies |
| V4 Access Control | **yes** | proxy default-deny matcher `['/((?!_next/static\|_next/image\|favicon.ico).*)']` covers `/` (verified in `proxy.ts`); page calls `requireSession()` first (defense-in-depth, same as every `(app)` page) |
| V5 Input Validation | marginal | The dashboard parses **no** searchParams — zero new untrusted input. Every tile href is a static internal filter URL; the linked `/devices` page already revalidates its params server-side (a hand-edited `?warranty=zzz` degrades to «all», never a 500) |
| V6 Cryptography | no | none introduced |
| V7 Errors/Logging | yes (light) | Aggregates never throw on empty data (GROUP BY returns `[]`); no internals in responses |

### Known Threat Patterns for this stack/phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated dashboard view (data summary leak) | Information Disclosure | proxy perimeter + `requireSession()` in the page — both layers already exist; do not skip either |
| XSS via device/employee names in tiles/feed | Tampering | React auto-escaping; no `dangerouslySetInnerHTML`; hrefs are template literals over internal ids, never user strings |
| Malicious `?…` appended to `/` | Tampering (marginal) | Page ignores all params; links are builder-built constants |
| IDOR-style probing of `/devices/[id]` from feed links | Information Disclosure | Out of phase scope — card routes already guard (`requireSession` + zod id + `notFound()`); links expose no new ids beyond existing lists |

## Sources

### Primary (HIGH confidence)
- Live probe this session (temp SQLite + real migrations + real schema; 7/7 assertions): GROUP BY counts, preset-count boundaries, top-5 order, feed joins/nulls/tie/limit, Date-binding failure of raw `sql`, CASE-with-seconds workaround
- Bundled Next 16.3.3 docs (per AGENTS.md directive): `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md` (Suspense wraps page + children below — basis of Pitfall 6), route-groups.md presence
- Project code read in full this session: `db/queries/devices.ts`, `db/queries/movements.ts`, `db/schema.ts`, `db/index.ts` (via phase-5 research + probe), `lib/warranty.ts`, `lib/warranty-date.tsx`, `lib/movement-schema.ts`, `lib/device-schema.ts`, `lib/ru.ts`, `app/(app)/page.tsx`, `app/(app)/layout.tsx`, `app/(app)/nav.tsx`, `app/(app)/devices/page.tsx`, `app/(app)/devices/query-params.ts`, `app/(app)/devices/loading.tsx`, `app/(app)/(card)/devices/[id]/timeline.tsx`, `app/login/actions.ts`, `proxy.ts`, `scripts/smoke-devices.mjs`, `scripts/seed.mjs`, `tests/helpers.ts`, `tests/devices-perf.test.ts`, `tests/movements-queries.test.ts`, `tests/warranty.test.ts`
- Project decisions: 06-CONTEXT.md (D-01..D-06, verbatim in User Constraints), 05-RESEARCH.md (UDF/query/TZ recipes), STATE.md (phase-2 loading.tsx lesson, phase-5 resolutions)

### Secondary (MEDIUM confidence)
- None needed — no external web claims were load-bearing; the two seam-routed questions resolved to the bundled docs (stronger than context7 for the exact installed version) and to direct measurement (stronger than any web source for in-repo perf).

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; every operator/API exercised by this session's probe against the installed versions
- Architecture: HIGH — extends in-repo patterns (predicate co-location, listTimeline join, query-params builder); the one genuinely new shape (aggregates) was probed end-to-end
- Pitfalls: HIGH — each either reproduced in a probe (Date binding, GROUP BY silence, tie ordering), read from repo history (loading.tsx 404 flash, smoke redirect assertion), or verified in bundled docs (loading.js boundary scope)

**Research date:** 2026-09-13/14
**Valid until:** 2026-10-14 (stable installed stack; no fast-moving surface)
