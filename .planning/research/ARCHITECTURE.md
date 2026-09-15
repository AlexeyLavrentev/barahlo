# Architecture Research: v1.1 «Скорость и удобство» — Integration into Existing Barahlo App

**Domain:** Integration architecture for 5 features on an existing Next.js 16 App Router / better-sqlite3 / drizzle RSC app
**Researched:** 2026-09-15
**Confidence:** HIGH (every existing-module claim below was verified by reading the source this run; the only external claims — cmdk ecosystem status — are tagged LOW and are not load-bearing)

## Verified Existing Architecture (the integration surface)

```
┌────────────────────────────────────────────────────────────────────┐
│ proxy.ts (Next 16 proxy, default-deny matcher)                     │
│   everything except _next/static|_next/image|favicon.ico is gated  │
│   PUBLIC_PATHS = ['/login'] exact strings; api/* IS covered        │
├────────────────────────────────────────────────────────────────────┤
│ app/(app)/ layout.tsx  — requireSession() + 48px bar               │
│   ├─ nav.tsx ('use client' island — layout-level client precedent) │
│   ├─ devices/  page.tsx (RSC) + filter-bar (server compose) +      │
│   │            search-box.tsx (300ms debounce island, URL state)   │
│   │            query-params.ts (THE parser/builder)                │
│   │            actions.ts (requireSession → zod → query → refresh) │
│   ├─ employees/ page.tsx (RSC, local buildQuery, NO search yet)    │
│   └─ (card)/   devices/[id], employees/[id] — palette targets      │
├────────────────────────────────────────────────────────────────────┤
│ app/api/  export/route.ts (requireSession-first GET precedent)     │
│           attachments/, photos/, health/                           │
├────────────────────────────────────────────────────────────────────┤
│ db/queries/*.ts — PURE sync functions, no framework imports;       │
│   devices.ts: deviceWhere (THE predicate) + searchPredicate +      │
│               exportDevices (composes deviceWhere) + ruSortKey     │
│   employees.ts: listEmployees (innerJoin departments, ruSortKey)   │
│   movements.ts: guard-UPDATE .changes pattern, one tx per action,  │
│                 append-only INSERTs (triggers in migration 0000)   │
│ db/index.ts — norm() UDF (deterministic normalizeNumber) on conn   │
└────────────────────────────────────────────────────────────────────┘
```

**Invariants every feature must respect** (all confirmed in source):
- Schema changes ONLY via drizzle-kit generate + migrate (never push).
- movements is append-only: INSERT only in app code + `movements_no_update/no_delete` triggers (drizzle/0000_amusing_talon.sql:94–99).
- query-params.ts is the single URL vocabulary for /devices; islands import builders themselves (functions never cross the RSC boundary — flat serializable props only).
- deviceWhere is co-located in db/queries/devices.ts; the export is «the same predicate, second caller» — never a parallel schema (D-18).
- requireSession() is the first statement of every action and API route (server actions are directly POST-able; the proxy does not cover them).
- Query modules stay pure/sync (vitest imports them directly against a temp db — tests/helpers.ts); actions add session + zod + refresh().
- better-sqlite3 v13 transaction semantics (verified from installed node_modules/lib/methods/transaction.js): ROLLBACK runs only when the exception propagates OUT of the transaction function; catching inside keeps the tx alive (HIGH).

## Feature 1: Employee Live Search (справочник)

**Verdict: extend listEmployees with `q`, mirror the devices URL discipline in a new employees/query-params.ts, extract the search-box engine into a shared hook.**

### Query-module shape

`db/queries/employees.ts` — modify `listEmployees` to take `q?: string` (the list IS the search target; pagination and the active/archive filter keep working unchanged). The predicate is the device searchPredicate recipe ported to people:

```typescript
// same recipe as searchPredicate in devices.ts: fold the BIND pattern through
// the SAME normalizeNumber the norm() UDF folds the columns with
export function employeeSearchPredicate(rawQ: string | undefined) {
  const q = normalizeNumber(rawQ ?? '').slice(0, 100)
  if (q === '') return undefined
  const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
  return or(
    sql`norm(${employees.name}) like ${pattern} escape '\\'`,
    sql`norm(${departments.name}) like ${pattern} escape '\\'`,
  )
}
```

- The `innerJoin(departments)` already in listEmployees carries the department term — the same «predicate rides the existing join» shape as the devices department filter (D-09).
- The count query and the rows query share ONE where (the Pitfall-5 parity property listDevices already exhibits).
- norm() needs no registration change — it is already a deterministic UDF on every connection (db/index.ts).
- Extract the predicate into a named exported function (not inline) — the ⌘K palette's `searchEmployees` composes exactly this function, mirroring the deviceWhere/exportDevices factoring.

### URL layer

New `app/(app)/employees/query-params.ts` — parse/build for `{ q, filter, page }` (parse degrades invalid values to sentinels, never 500s; builder omits inactive sentinels). Rationale: the current local `buildQuery` in page.tsx would become the second place that knows the URL vocabulary the moment `q` lands, and the search island must import a pure builder itself (function props are banned across the RSC boundary). This is the same discipline query-params.ts established for /devices, scoped to the employees' smaller vocabulary.

### Component: extract, don't copy

`app/(app)/devices/search-box.tsx` holds ~90 lines of battle-tested reconciliation (lastSynced anchor, inFlight echo absorption, push-time stamping — two UAT bugs G-5-1/G-5-2 fixed here). Extract the engine into `components/debounced-search.ts`:

```typescript
'use client'
// useDebouncedParam({ q, buildHref }) → { value, onChange, onKeyDown }
// Encapsulates: value state, 300ms timer, lastSynced/inFlight refs, commitNow.
// The BUILDER is imported by each wrapper, never passed as a prop.
```

- `DeviceSearchBox` is refactored onto the hook — **behavior-preserving refactor**; it keeps importing `buildDevicesQuery` and its `DeviceFilters` spread.
- New `app/(app)/employees/search-box.tsx` — thin wrapper importing the employees builder, RU placeholder «Имя или отдел», same aria conventions.
- **Risk (MEDIUM):** this code has no component tests (vitest covers queries/schemas only). Mitigate with a manual UAT checklist before merge: type-then-Back/Forward adopt, trailing-space mid-composition, external filter reset adopts into clean input, Enter commits immediately.

Page wiring (`app/(app)/employees/page.tsx`): parse q → pass to listEmployees → builder carries q; switching Активные/Архив keeps q and resets page to 1; add the «Ничего не найдено» empty-state variant with a reset link (copy parity with /devices).

**Files:** NEW employees/query-params.ts, employees/search-box.tsx, components/debounced-search.ts · MODIFIED db/queries/employees.ts, employees/page.tsx, devices/search-box.tsx.

## Feature 2: ⌘K Global Palette (устройства + сотрудники)

**Verdict: layout-level client island + one new authenticated GET /api/search route; hand-rolled on the existing Base UI dialog; one flattened keyboard index.**

### Where it lives

Mount `<CommandPalette />` in `app/(app)/layout.tsx` beside `<AppNav />` — a layout-level client island is an established precedent (nav.tsx). A global keydown listener (⌘K / Ctrl+K, ignore when a dialog already owns focus) toggles it; mounted at layout level it works on every protected page.

### Where results come from: new API route, NOT a server action, NOT RSC prefetch

- **Server actions are the wrong shape**: they are POST form machinery (FormData in, action state out) — type-ahead wants idempotent GET-with-params; and the action response carries an RSC payload of the current route, which is wasted bytes per keystroke.
- **RSC prefetch / router navigation per keystroke** would re-render whole list pages per query — the search-box deliberately avoids this even for one input.
- A **GET route handler** matches the export-route precedent: data leaves the RSC tree, authentication is explicit, the client gets a small JSON payload.

New `app/api/search/route.ts`:

```typescript
export async function GET(request: NextRequest) {
  await requireSession() // FIRST statement — export-route precedent
  const q = String(request.nextUrl.searchParams.get('q') ?? '').slice(0, 100)
  const [devices, employees] = [searchDevices(q, 8), searchEmployees(q, 5)]
  return Response.json({ devices, employees }) // hardcoded shape, no input echo
}
```

Proxy/auth coexistence: **no matcher change needed.** The default-deny matcher already covers `/api/*` (only `_next/static|_next/image|favicon.ico` are excluded — verified in proxy.ts), and the palette only renders under the (app) layout whose requireSession already passed, so the same-origin fetch carries the session cookie automatically. `requireSession` in the route is the defense-in-depth layer (V3), exactly like the attachments and export routes.

### New query functions (both pure-sync, tested against temp db)

- `searchDevices(q, limit)` in `db/queries/devices.ts` — composes the module-private `searchPredicate` (same module = the deviceWhere-colocation discipline; no need to export it), `ruSortKey` order + id tiebreaker, `.limit(limit)`; selects `{ id, typeKey, model, serialNumber, inventoryNumber, status }`.
- `searchEmployees(q, limit)` in `db/queries/employees.ts` — composes `employeeSearchPredicate` from Feature 1; selects `{ id, name, department, isActive }`. Archived employees SHOULD appear (badge «архив» in the palette) — an archived person's card is exactly what «кто это был?» needs; flag as a planning decision if the operator disagrees.
- Limit-driven: no pagination, no count query. At 50–200 employees / hundreds of devices a `norm() like` scan is single-digit ms (phase-5 measurement class).

### Merge + one keyboard model

Client-side, one flat array is the model (MEDIUM — universal palette pattern):

```typescript
type PaletteItem =
  | { kind: 'device'; id: number; title: string; subtitle: string }   // model · serial · holder
  | { kind: 'employee'; id: number; title: string; subtitle: string } // name · department (+ «архив»)

const items: PaletteItem[] = [
  ...data.devices.map(toDeviceItem),   // devices FIRST — registry is the primary entity
  ...data.employees.map(toEmployeeItem),
]
// selection = ONE index into items; section headers («Устройства», «Сотрудники»)
// are derived at render time (kind changes between neighbors) and are NOT focus-stops.
// ↑/↓ move (clamp), Home/End, Enter → router.push(`/devices/${id}` | `/employees/${id}`) + close,
// Esc → close + restore focus to the previously focused element.
```

Fetch discipline: debounce ~150–200 ms (shorter than the 300 ms URL debounce — palette results are ephemeral, never URL state), AbortController per request with latest-wins, do not fire until q is non-empty (unlike the list, a palette's «full list» is meaningless).

### No cmdk dependency

Hand-roll (~150 lines) on the existing `components/ui/dialog.tsx` (Base UI): the project hand-rolls for supply-chain reasons already (lib/csv.ts rationale), Base UI provides the dialog focus trap/Escape, and the filtering/ranking lives server-side in SQL anyway. The cmdk ecosystem is fork-fragmented around React 19 (cmdk-base, dip/cmdk) — LOW-confidence single-source web finding, supporting color only; the decision stands on the local precedent. aria: input with `aria-activedescendant` pointing at the active option id (listbox pattern) or roving highlight — pick one, pin it in the component comment.

**Files:** NEW app/api/search/route.ts, app/(app)/command-palette.tsx · MODIFIED app/(app)/layout.tsx, db/queries/devices.ts, db/queries/employees.ts.

## Feature 3: CSV Full-Context Report (ведомость)

**Verdict: extend the existing /api/devices/export in place. A second endpoint would be exactly the «параллельная таблица» D-18 exists to prevent — zero-drift is structural when the route keeps one parser, one strip, one predicate.**

What the phase-5 export already carries: Тип, Модель, Серийник, Инвентарник, Статус, Держатель, Отдел (holder's department, D-09), RAM, RAM апгрейд, SSD, Дата закупки, Стоимость, Поставщик, Гарантия до, Заметки. «Владелец, отдел, гарантия, стоимость» are DONE. The gap is the per-type config columns.

Changes:
- `db/queries/devices.ts` — `DeviceExportRow` gains `screenDiagonal, panelType, portCount, peripheralKind`; `exportDevices` select gains the same four. This module owns the export scan (it already exists here — no new owner).
- `app/api/devices/export/route.ts` — HEADER gains «Диагональ, ″», «Тип матрицы», «Количество портов», «Вид периферии» (after SSD, before the purchase block — registry visual order); cells map them (null → empty via esc()). Typed payload note: a row only populates its OWN type's columns — sparse columns are the honest machine-readable representation; do NOT merge into one «Конфигурация» text column (prettier, lossy, unfilterable in Excel).
- `lib/csv.ts` — unchanged (buildCsv/esc/csvResponseHeaders sufficient; BOM/«;»/CRLF/CWE-1236 guard all ride along).
- The «Скачать CSV» link in filter-bar.tsx — unchanged (same route, same href).
- `tests/csv-export.test.ts` — extend the column matrix.

**Files:** MODIFIED db/queries/devices.ts, app/api/devices/export/route.ts, tests/csv-export.test.ts. Nothing new.

## Feature 4: Device Cloning with Inventory Auto-Increment

**Verdict: query function in devices.ts (createDevice's sibling), one tx for the whole batch, prefix-scoped max+1 computed inside the tx, and — the milestone's one schema decision — allow empty serials via the proven NULL-pair migration.**

### Transaction shape

`cloneDevices(sourceId, count, serials, opts)` in `db/queries/devices.ts` — one `db.transaction` creating all N rows (returnAllDevices atomic-batch precedent: a mid-flight failure leaves no partial batch):

```typescript
return db.transaction((tx) => {
  const src = tx.select().from(devices).where(eq(devices.id, sourceId)).get()
  if (!src) throw { code: 'NOT_FOUND' }
  // copied: typeKey, model, config fields, purchaseDate/Price, supplier, warrantyUntil
  // NOT copied: serial (per-clone), inventory (auto or NULL), status (always 'in_stock'),
  //             currentEmployeeId (always NULL), notes (or per-clone), createdAt/updatedAt
  for (let i = 0; i < count; i++) { tx.insert(devices).values(rowFor(i)).run() }
})
```

Custody fields are never cloned — a clone is stock, exactly like createDevice produces. Validation rides the existing keystone: the clone dialog is the save dialog pre-filled (deviceSaveSchema validates each clone's effective payload); the action maps uniqueCodeOf results to the existing inline copy.

### Inventory auto-increment rule

If the source's inventoryNumber ends in a digit run (e.g. «2026-015», «Б-12»): extract prefix + width, scan `inventoryNormalized like prefix%` **inside the same tx**, parse suffixes in JS, take max+1, assign `base+1..base+N` zero-padded to the source width. No source number, or no trailing digits → all clones get NULL inventory (manual 1C assignment later — D-16 «inventory is manual-only» semantics preserved; do not invent numbers 1C will contradict).

- Race safety: better-sqlite3 executes the tx synchronously and serialized — the like-scan and the inserts cannot interleave with another writer. The uniqueCodeOf catch remains the backstop; a catch-and-bump retry inside the tx fn is safe (verified from transaction.js: rollback only on propagation; SQLite ABORT undoes only the failed statement).

### The serial sharp edge — recommend the NULL-pair migration

Verified today: `serialNumber: z.string().min(1)` (device-schema.ts:174) + `serial_number NOT NULL` + `UNIQUE(serial_normalized)` (D-17). Clones of one model cannot share a serial, and a batch of serial-less peripherals (mice, docks) currently forces the operator to invent unique strings («б/н», «б/н 2») — a live data-corruption pressure that cloning makes acute.

- **Recommended (b): allow empty serial via migration** — make `serial_normalized` nullable and store the empty serial as the NULL/NULL pair, the EXACT inventoryPair recipe (Pitfall 5, proven). SQLite UNIQUE permits multiple NULLs; search simply never matches a NULL serial (same three-valued behavior as NULL inventory); schema change goes through generate + migrate — the sanctioned path — plus schema.test.ts updates. The clone dialog accepts one serial per line where blank = «без серийника».
- Fallback (a): no schema change — the dialog requires N distinct serials; ship with a documented data-quality wart.
- Whatever is chosen: decide it in planning, BEFORE build — it is the only schema touch of the milestone.

### Movements on clone

Recommend writing ONE `received` («Поступление») event per clone in the same tx (append-only INSERT — sanctioned; the vocabulary exists in MOVEMENT_EVENT_LABELS; comment «Клон устройства #id»). It makes the batch visible in the dashboard feed (listRecentMovements) and on each card's timeline — a clone without history contradicts «Полная история перемещений». Open question for planning: plain createDevice writes no received event today — either accept the inconsistency or wire the same event there (small, same milestone).

**Files:** MODIFIED db/queries/devices.ts (cloneDevices), app/(app)/devices/actions.ts (cloneDeviceAction), lib/device-schema.ts (serial optional + clone payload pieces — only per decision), db/schema.ts + NEW drizzle migration (only if (b)), card UI (clone entry point beside device-actions.tsx), tests/devices-queries.test.ts, tests/schema.test.ts.

## Feature 5: Bulk Issue / Return

**Verdict: client-side selection island (children-as-props), NOT URL params; one tx per batch in movements.ts reusing the guard-UPDATE loop of returnAllDevices; all-or-nothing semantics.**

### Selection state: client island, explicitly NOT a URL param

- Selection is ephemeral UI state, not a filter. Adding `sel` to query-params.ts would corrupt THE filter vocabulary (a non-filter in DeviceFilters; every parse/strip/builder site must then know it), and `?sel=1,2,3` URLs go stale the moment any selected device changes status.
- Shape: `app/(app)/devices/selection.tsx` — a `'use client'` `SelectionProvider` holding `Set<number>` + the floating action bar. The server-rendered list passes THROUGH it as `children` (children-as-props keeps the 20 RSC rows server-rendered; only checkbox leaves are client). Per-row `SelectCheckbox` reads/writes context (Base UI checkbox exists).
- **UI refactor (the real cost of this feature):** rows are currently a full-row `<Link>`. A checkbox inside a Link navigates on click. Restructure the row: link on the content area, checkbox as a sibling outside the anchor.
- Scope: selection resets on navigation (provider remounts per page render) — per-page selection is accepted for v1.1; cross-page selection is a documented non-goal (typical bulk = one purchase batch on one filtered page).

### Server side: two batch functions beside the single transitions

`db/queries/movements.ts` — `bulkAssignDevices(deviceIds, employeeId, event)` and `bulkAcceptDevices(deviceIds, event)`:

- ONE `db.transaction`; loop over ids; **one movement event PER device** (append-only INSERTs — the returnAllDevices loop precedent verbatim); the guard-UPDATE (`status='in_stock'` / `status='assigned'` precondition, `.changes===0 → throw ILLEGAL_TRANSITION`) decides per device from the DB row.
- `assertActiveEmployee` reused for bulk assign.
- **All-or-nothing**: any guard failure rolls back the whole batch (a throw out of the tx fn rolls back — verified). Single operator, races rare; partial-success UX is deferred complexity. Error copy: «Не удалось выдать: часть выбранного уже изменена» — one string, same contract as returnAllDevices.
- Shared occurredAt/comment for the batch (one dialog, one date — a batch is one fact); backdate rules ride the existing movement-schema pieces.

Actions: `bulkAssignDeviceAction` / `bulkAcceptDeviceAction` in `app/(app)/devices/actions.ts` — requireSession, zod, refresh(). New zod in `lib/movement-schema.ts` (keystone discipline — no parallel schema lists): `{ deviceIds: z.array(z.coerce.number().int().positive()).min(1).max(50), employeeId?, occurredAt?, comment? }` — dedupe ids in the action; cap 50 (a page is 20; headroom without unbounded payloads).

**Files:** NEW app/(app)/devices/selection.tsx · MODIFIED app/(app)/devices/page.tsx (row structure, provider), db/queries/movements.ts, app/(app)/devices/actions.ts, lib/movement-schema.ts, tests/movements-queries.test.ts.

## Recommended Build Order (dependency-driven)

| # | Slice | Why here |
|---|-------|----------|
| 1 | **Employee live search** | Foundation: creates employees/query-params.ts + `employeeSearchPredicate` + the extracted debounce hook. The palette composes its predicate. Behavior-preserving search-box refactor is safest before new UI piles on. |
| 2 | **CSV ведомость** | Fully independent, smallest diff (2 files + tests), zero coupling — a clean warm-up; can run parallel to 1. |
| 3 | **Clone** | Independent of 1–2; the serial-nullable decision (the only schema touch) must be resolved at planning and migrated FIRST if accepted. |
| 4 | **Bulk issue/return** | Independent query/action layer; largest UI refactor (row structure). Doing it after clone keeps actions.ts churn in two reviewable steps. |
| 5 | **⌘K palette** | LAST by dependency: composes `searchDevices` (exists) + `searchEmployees` (slice 1) behind the new /api/search route; pure additive UI + one route. Delivers the headline UX once both backends exist. |

Hard dependency: 1 → 5. Everything else is soft ordering chosen for review size and risk isolation.

## New-vs-Modified File Map (consolidated)

| File | Status | Features |
|------|--------|----------|
| app/(app)/employees/query-params.ts | NEW | 1 |
| app/(app)/employees/search-box.tsx | NEW | 1 |
| components/debounced-search.ts | NEW (extracted engine) | 1 |
| app/api/search/route.ts | NEW | 2 |
| app/(app)/command-palette.tsx | NEW | 2 |
| app/(app)/devices/selection.tsx | NEW | 5 |
| drizzle/000X_*.sql (+ db/schema.ts change) | NEW, only if serial decision (b) | 4 |
| db/queries/employees.ts | MODIFIED | 1, 2 |
| db/queries/devices.ts | MODIFIED | 2, 3, 4 |
| db/queries/movements.ts | MODIFIED | 5 |
| app/(app)/employees/page.tsx | MODIFIED | 1 |
| app/(app)/devices/search-box.tsx | MODIFIED (refactor onto hook) | 1 |
| app/(app)/devices/page.tsx | MODIFIED | 5 |
| app/(app)/devices/actions.ts | MODIFIED | 4, 5 |
| app/(app)/layout.tsx | MODIFIED (mount palette) | 2 |
| app/api/devices/export/route.ts | MODIFIED (4 columns) | 3 |
| lib/device-schema.ts | MODIFIED (only per serial decision / clone payload) | 4 |
| lib/movement-schema.ts | MODIFIED (bulk schemas) | 5 |
| lib/csv.ts, filter-bar.tsx, proxy.ts, db/index.ts | UNCHANGED | — |

## Anti-Patterns to Avoid (this codebase's specific drift paths)

1. **Second URL parser/builder** (employees local buildQuery growing q ad hoc, or a palette-private param encoding) — every second parse path is the drift the phase-5 refactor killed. Each list gets exactly one pure params module its islands import.
2. **Second device predicate for the palette** — `searchDevices` MUST compose the existing `searchPredicate`; a re-spelled LIKE with different escaping/caps will diverge from the list («палитра находит, список — нет» is the cardinal bug of this milestone).
3. **Second CSV endpoint for «ведомость»** — parallel-table regression against D-18; extend exportDevices/route instead.
4. **Selection in the URL** — non-filter state in the filter vocabulary; stale ids in shareable links.
5. **Per-device server action calls in a JS loop for bulk** — N round trips, N transactions, partial states on failure; one tx, one event per device, `.changes` guard.
6. **Copying serial/inventory into clones** — UNIQUE normalized columns are business conditions (D-17); collision must be structurally impossible (per-clone serials, computed inventory), with uniqueCodeOf as backstop, never the mechanism.
7. **Inventing inventory numbers when the source has none** — D-16: inventory is 1C-assigned; auto-increment only extends an existing digit-suffixed number.
8. **cmdk import before measuring** — a dependency for ~150 lines the Base UI dialog + a flat index already cover; the project's hand-rolled rule exists for exactly this size of need.

## Scaling Considerations

Not a concern at this scale (single operator, hundreds of rows — phase-5 measured 0.76 ms @ 600 rows), but two design points keep headroom free: palette queries are LIMIT-capped scans (an FTS5 index over devices/employees is the drop-in upgrade if the registry ever reaches tens of thousands), and the bulk tx is capped at 50 devices per call (bounded statements per transaction, no unbounded payloads). Nothing else in these five features has a scaling dimension worth engineering for now.

## Open Questions for Planning

1. **Serial-nullable migration (Feature 4)** — accept (b) or ship (a)? Decides whether the milestone has a schema touch at all.
2. **`received` event on clone (and on plain create?)** — timeline/feed consistency vs. scope discipline.
3. **Archived employees in the palette** — show with «архив» badge (recommended) or active-only?
4. **Bulk cap (50?) and cross-page selection** — confirm cap; cross-page selection documented non-goal unless the operator objects.
5. **CSV typed columns** — 4 sparse columns (recommended) vs one merged «Конфигурация» text column.

## Sources

- Codebase (HIGH, read this run): db/queries/devices.ts, employees.ts, movements.ts; db/index.ts; db/schema.ts; drizzle/0000_amusing_talon.sql (movements triggers); app/(app)/devices/{page,filter-bar,search-box,query-params,actions}.*; app/(app)/employees/page.tsx; app/(app)/layout.tsx, nav.tsx; app/api/devices/export/route.ts; lib/{csv,normalize.mjs,device-schema,movement-schema}.ts; proxy.ts; tests/helpers.ts; package.json.
- better-sqlite3 v13 transaction.js from installed node_modules (HIGH — source read: rollback only on exception propagation).
- Next.js 16.3.3 bundled docs node_modules/next/dist/docs (HIGH for this version): proxy.md (middleware→proxy rename), server-actions.md (refresh/revalidatePath semantics), route-handlers.md.
- Web: cmdk ecosystem fragmentation (LOW, single source, non-load-bearing) — [cmdk-base](https://www.npmjs.com/package/cmdk-base), [dip/cmdk](https://github.com/dip/cmdk), [react-cmdk](https://react-cmdk.com/).

---
*Architecture research for: Barahlo v1.1 «Скорость и удобство»*
*Researched: 2026-09-15*
