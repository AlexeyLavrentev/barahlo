---
phase: 06-dashboard
plan: 01
subsystem: ui
tags: [dashboard, rsc, drizzle, better-sqlite3, group-by, nextjs-16, smoke]

# Dependency graph
requires:
  - phase: 05-search-filters
    provides: buildDevicesQuery/DeviceFilters (the ONE URL builder), deviceWhere/warrantyPredicate predicates, URL-filter deep links, displayTodayUtc
  - phase: 04-custody-photos
    provides: append-only movements table, movementEventLabel vocabulary, listTimeline alias double-join pattern
  - phase: 03-registry
    provides: DEVICE_TYPES/DEVICE_STATUS_KEYS keystone, devices schema
provides:
  - deviceCountByType/deviceCountByStatus/totalDeviceCount aggregates in db/queries/devices.ts (co-located with the predicates — D-04 invariant)
  - listRecentMovements(limit = 10) + RecentMovementView (employee ids in SELECT) in db/queries/movements.ts
  - Live dashboard at «/» — 8 zero-default tiles deep-linking phase-5 filters, «Всего: N» headline, 10-row movements feed with segmented links, honest empty states
  - Nav «Дашборд» as the first item; smoke step 8 asserting the dashboard root
affects: [06-02 (warranty block reuses today + tile grid + block zone; parity pin), verify-work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Aggregate counters co-located with predicates (N small GROUP BY counts, never raw sql with Date operands)"
    - "Zero-default tile rendering: iterate keystone lists (DEVICE_TYPES/DEVICE_STATUS_KEYS) with Map.get ?? 0"
    - "Segmented feed links: row container without href; device anchor + employee anchors + plain pill/date siblings (no nested anchors)"
    - "Tile hrefs = route path + buildDevicesQuery(full DeviceFilters) — the builder owns the query string"
    - "Route table as ONE segment source feeding both rendering and title text"

key-files:
  created: []
  modified:
    - db/queries/devices.ts
    - db/queries/movements.ts
    - app/(app)/page.tsx
    - app/(app)/nav.tsx
    - scripts/smoke-devices.mjs

key-decisions:
  - "Tile hrefs are `/devices` + buildDevicesQuery(full DeviceFilters) — the builder returns a relative query string (?type=laptop), so the page prefixes its own route path; the query string itself is never hand-built (D-03/D-08 stay the builder's job)"
  - "Type tile labels are a page-local byte-exact copy of type-filter.tsx FILTER_ITEMS plural options (RSC cannot import the client island constant — orchestrator-резолюция 5); status order is a page-local D-02 array with deviceStatusLabel labels"
  - "Feed route table lives in ONE routeSegments() function — text+href segments feed both the rendered links and the title attribute (no parallel text/node implementations)"
  - "Aggregate key casts to DeviceTypeKey/DeviceStatusKey are backed by schema invariants (device_types FK + status CHECK), documented at the code"
  - "today = displayTodayUtc() computed once per render per plan (orchestrator-резолюция 6) — plan 06-02 hands the same instant to the warranty counters and WarrantyDate"

patterns-established:
  - "Dashboard aggregates pattern: exported GROUP BY/count functions beside private predicates (co-location = D-04)"
  - "RecentMovementView pattern: view type with ids selected whenever names become links (timeline's names-as-text stays the anti-analog)"
  - "Smoke root assertion pattern: 200 + static dashboard markers, SSR-split-aware needles (no interpolated-number asserts)"

requirements-completed: [DASH-01, DASH-03]

coverage:
  - id: D1
    description: "Dashboard at «/» renders 8 always-present type/status tiles with live counts (zero-default from keystones), «Всего: {pluralDevices}» non-link headline, and deep-links each tile into the phase-5 /devices filters via buildDevicesQuery"
    requirement: DASH-01
    verification:
      - kind: e2e
        ref: "node scripts/smoke-devices.mjs (step 8: GET / with cookie → 200 + «Дашборд» + active nav + /devices?type= + /devices?status= + «Всего:»)"
        status: pass
      - kind: other
        ref: "npm run build (type check + production compile; / is a dynamic route)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Movements feed: 10 latest events ordered (occurredAt DESC, id DESC), segmented links (row → /devices/[id], names → /employees/[id], no nested anchors), «склад» only in custody moves, honest empty state on a fresh DB"
    requirement: DASH-03
    verification:
      - kind: e2e
        ref: "node scripts/smoke-devices.mjs (step 8: empty-feed copy «Перемещений пока нет» on fresh temp DB)"
        status: pass
      - kind: other
        ref: "throwaway live check 2026-09-14 (temp DB + port 3123 + minted cookie): populated feed — segmented hrefs (/employees/1|2, /devices/1), склад slots, all 4 pill labels, tie resolved by id DESC, «2 устройства» plural"
        status: pass
    human_judgment: false
  - id: D3
    description: "Visual anatomy backstops: long model/route truncate before shrink-0 pill/serial/date, title attributes carry full text, quiet-tile styling per 06-UI-SPEC"
    verification: []
    human_judgment: true
    rationale: "Held-out visual verification — overflow/title behavior is only provable by looking at rendered rows (UI-SPEC UI Considerations reserves this for verify-work); no component test runner exists in the repo"

# Metrics
duration: 21min
completed: 2026-09-14
status: complete
---

# Phase 6 Plan 1: Dashboard Tracer Summary

**Live RSC dashboard at «/»: 8 zero-default count tiles deep-linking phase-5 filters via buildDevicesQuery, plus a 10-row movements feed with segmented device/employee links over a 3-way join — redirect stub and its smoke needle removed in the same commit**

## Performance

- **Duration:** 21 min
- **Started:** 2026-09-14T06:39:47Z
- **Completed:** 2026-09-14T07:01:05Z
- **Tasks:** 1 (tracer)
- **Files modified:** 5

## Accomplishments
- `/` is now the dashboard (D-01): «Дашборд» metadata title + headline, «Всего: {pluralDevices(total)}» non-link subtitle (D-03), one grid of 8 Link tiles (4 types byte-exact FILTER_ITEMS plural labels, then 4 statuses in D-02 order via deviceStatusLabel), all zero-defaulted from DEVICE_TYPES/DEVICE_STATUS_KEYS with `Map.get ?? 0`
- Tile hrefs built ONLY by buildDevicesQuery with a full DeviceFilters object; hand-concatenated filter URLs absent (negative grep passes)
- Feed = listRecentMovements(10): single innerJoin(devices) + alias double-join(employees), employee ids in SELECT (D-05), orderBy desc(occurredAt)+desc(id) tiebreaker; rows are segmented links (row container without href), route table per UI-SPEC («склад» only in assigned/returned/transferred), «Списание» pill destructive-tinted, honest empty state
- Nav island gains «Дашборд» first (active rule untouched — matches «/» exactly); zero new client islands (D-06), no loading.tsx (404-matrix hazard avoided)
- smoke-devices.mjs step 8 rewritten in all three places in the same commit as the page rewrite: 200 + dashboard markers, empty-feed expectation on fresh temp DB (Pitfall 8); perimeter needles untouched

## Task Commits

1. **Task 1: Tracer — «/»: живые счётчики и лента движений end-to-end** - `e02b059` (feat)

**Plan metadata:** pending (docs commit follows this summary)

## Files Created/Modified
- `db/queries/devices.ts` — deviceCountByType/deviceCountByStatus (GROUP BY) + totalDeviceCount, co-located with deviceWhere/warrantyPredicate (D-04); TypeCount/StatusCount types
- `db/queries/movements.ts` — RecentMovementView + listRecentMovements(limit = 10), three-way join with ids in SELECT
- `app/(app)/page.tsx` — full rewrite: pure-RSC dashboard (metadata «Дашборд», requireSession first, today once per render, tiles + feed + empty states)
- `app/(app)/nav.tsx` — NAV_ITEMS gains { href: '/', label: 'Дашборд' } first
- `scripts/smoke-devices.mjs` — step 8 (header comment, assert block, summary) asserts the dashboard root

## Decisions Made
- Tile hrefs: `/devices` + builder output. buildDevicesQuery returns a RELATIVE query string (`?type=laptop` — correct on /devices itself), which on `/` would resolve to `/?type=laptop`; the page prefixes the route path while the builder keeps sole ownership of the query string
- Type tile labels page-local (`TYPE_TILE_LABELS`), status order page-local (`STATUS_TILE_ORDER`) — keystone labels via deviceStatusLabel, no new maps in lib
- Feed route table in ONE `routeSegments()` returning {text, href} segments — rendering and title derive from the same array
- Aggregate `as DeviceTypeKey/DeviceStatusKey` casts documented as FK/CHECK-backed (schema column types are plain text)
- `today = displayTodayUtc()` kept per plan despite no 06-01 consumer (06-02 contract; build does not lint unused locals)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tile hrefs resolved against `/` instead of `/devices`**
- **Found during:** Task 1 (smoke step 8 first run)
- **Issue:** buildDevicesQuery returns a relative query string (`?type=laptop`); used as-is in a Link on `/` it navigated to `/?type=laptop`, not the intended filtered list — smoke needle `/devices?type=laptop` failed
- **Fix:** tile href helpers return `` `/devices${buildDevicesQuery({...})}` `` — query string still built exclusively by the builder
- **Files modified:** app/(app)/page.tsx
- **Verification:** npm run build + smoke step 8 green (needle found)
- **Committed in:** e02b059 (task commit)

**2. [Rule 3 - Blocking] Missing requireSession import in the rewritten page**
- **Found during:** Task 1 (first npm run build)
- **Issue:** page.tsx rewrite referenced requireSession without importing it — TS2304, build failed
- **Fix:** added `import { requireSession } from '@/lib/auth'`
- **Files modified:** app/(app)/page.tsx
- **Verification:** npm run build green
- **Committed in:** e02b059 (task commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking import)
**Impact on plan:** Both necessary for the tracer to work at all; no scope creep. Plan otherwise executed as written.

## Issues Encountered
- Port 3001 (the sanctioned isolated-check port) is occupied by a stale `next-server` (PID 30799) from a prior session — left untouched (not created by this run); the isolated populated-feed check ran on port 3123 instead. The stale process may deserve manual cleanup.
- Throwaway check needle «Всего: 2 устройства» failed due to React SSR text-splitting (`Всего: <!-- -->2 устройства`); adjusted to smoke-style static needles (the committed smoke was written SSR-aware from the start)
- Pre-existing working-tree modifications (.planning/STATE.md, .planning/config.json, package.json/package-lock.json with a playwright devDep) belong to the orchestrator environment and were deliberately left out of the task commit

## Verification Results
- `npm run build` — green; `/` compiles as a dynamic route
- `node scripts/smoke-devices.mjs` — exit 0: perimeter 307 → /login; step 8 asserts 200 + «Дашборд» + aria-current nav + `/devices?type=laptop` + `/devices?status=` + «Всего:» + «Перемещений пока нет»
- `npx vitest run` — 18 files / 278 tests green (baseline preserved exactly)
- Isolated populated-feed live check (temp DB, port 3123, killed by PID): segmented employee/device hrefs, «склад» slots, 4 pill labels, id-DESC tie order at equal instants, «2 устройства» plural — all pass
- All acceptance greps pass (next/navigation=0, groupBy=2, builder-only URLs, keystone lists, Дашборд≥2, no (app)/loading.tsx)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 06-02 appends the «Гарантия» block to the same page: `warrantyPresetCounts`/`nearestExpiringWarranties` join the aggregates in db/queries/devices.ts, the blocks zone becomes `grid gap-8 sm:grid-cols-2 sm:gap-6`, and `today` is already computed once per render for WarrantyDate
- `tests/dashboard-queries.test.ts` (06-02 Wave 0) pins the D-04 parity: counters vs listDevices totals; feed tie/limit is query-pinnable against listRecentMovements
- Known deferred: tile-count parity against listDevices is intentionally NOT committed in this plan (plan assigns the pin to 06-02)

---
*Phase: 06-dashboard*
*Completed: 2026-09-14*

## Self-Check: PASSED

All 5 task files exist on disk; task commit `e02b059` present in git log; all verify commands green (build, smoke, vitest 278/18, acceptance greps, isolated populated-feed check).

