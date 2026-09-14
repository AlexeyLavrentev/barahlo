---
phase: 05-search-filters
plan: 01
subsystem: search
tags: [sqlite, better-sqlite3-udf, drizzle, nextjs-16, react-19, normalization, url-driven-state, debounce]

# Dependency graph
requires:
  - phase: 03-device-registry
    provides: "listDevices extension point (where-once/use-twice, RU-sort, covers batch), lib/device-schema keystone, URL-driven filter pattern"
  - phase: 01-foundation
    provides: "lib/normalize.mjs normalizeNumber (write-side fold), normalized UNIQUE columns serial_normalized/inventory_normalized, temp-SQLite vitest harness"
provides:
  - "norm() UDF registered in openDb() — the query-side fold IS the write-side normalizeNumber"
  - "DeviceListFilters (db layer, undefined-for-inactive) + searchPredicate(q) + optional filters param on listDevices"
  - "app/(app)/devices/query-params.ts — the ONE pure params module: DeviceFilters, WARRANTY_ITEMS, parseDevicesSearchParams, buildDevicesQuery (plans 02–04 import it)"
  - "lib/device-schema.ts keystone exports: DeviceStatusKey, DEVICE_STATUS_KEYS, isDeviceStatusKey"
  - "exported HOMOGLYPHS map (lib/normalize.mjs) + typed re-export (lib/normalize.ts)"
  - "DeviceSearchBox debounced live-search island (300 ms → router.replace scroll:false in startTransition)"
  - "/devices «Найдено: N» subtitle (D-05), «Ничего не найдено» empty state with раскладка hint + «Сбросить фильтры» (D-04)"
  - "tests/homoglyphs-fixture.ts + tests/device-search.test.ts — FIND-01/FIND-04 matrix (26 tests, all 11 pairs)"
affects: [05-02 filters, 05-03 warranty, 05-04 csv, 05-05 perf, device-status-filter, filter-bar, ram-chip]

# Tech tracking
tech-stack:
  added: [] # zero new packages (Package Legitimacy Audit: none — T-05-SC)
  patterns:
    - "better-sqlite3 deterministic UDF as the single fold point for SQL (replaces impossible SQL-side Cyrillic folding)"
    - "one where-builder shared by count+rows; filters compose as and(...) terms"
    - "URL-layer DeviceFilters ('all'/null/false/'' sentinels) stripped to db-layer undefined-for-inactive"
    - "debounced island: setTimeout + cleanup in useEffect, router.replace(scroll:false) inside startTransition, value===q no-op guard"

key-files:
  created:
    - app/(app)/devices/query-params.ts
    - app/(app)/devices/search-box.tsx
    - tests/homoglyphs-fixture.ts
    - tests/device-search.test.ts
  modified:
    - db/index.ts
    - db/queries/devices.ts
    - lib/device-schema.ts
    - lib/normalize.mjs
    - lib/normalize.ts
    - app/(app)/devices/page.tsx

key-decisions:
  - "norm() UDF (deterministic) registered in openDb — query-side fold cannot diverge from write-side normalizeNumber; SQLite LIKE/upper fold ASCII only"
  - "searchPredicate: folded q capped at 100 chars server-side, \\ % _ escaped with ESCAPE '\\', exactly serial/inventory/model (D-02) — employees join stays out of the predicate"
  - "query-params.ts is the single parse/build path; D-08 ram/type coupling lives in buildDevicesQuery (non-laptop type drops the ram param)"
  - "db-layer DeviceListFilters is undefined-for-inactive; the page strips URL sentinels so plan-02 presence guards never see 'all'/false"

patterns-established:
  - "UDF fold: sql`norm(${devices.model}) like ${pattern} escape '\\\\'` — bound param, column ref interpolated"
  - "Debounced search island: controlled input OUTSIDE any <form> (React 19 reset landmine), Enter commits immediately, cleanup cancels on every value/q change"
  - "Empty-state precedence: q active → «Ничего не найдено»; else type==='all' → «Пока нет устройств»; else «Нет устройств этого типа»"

requirements-completed: [FIND-01, FIND-04]

coverage:
  - id: D1
    description: "Live homoglyph-proof substring search over serial/inventory/model via norm() UDF — Cyrillic «с123» finds Latin «C123»"
    requirement: FIND-01
    verification:
      - kind: unit
        ref: "tests/device-search.test.ts#listDevices filters.q — FIND-01 search (tracer) > a Cyrillic-typed query finds the Latin serial (с123 → C123)"
        status: pass
      - kind: unit
        ref: "tests/device-search.test.ts#FIND-04 homoglyph matrix — Cyrillic query finds Latin serial (11 pairs)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Input tolerance: whitespace trim/collapse, case folds, 100-char server cap, LIKE wildcards match literals only"
    requirement: FIND-04
    verification:
      - kind: unit
        ref: "tests/device-search.test.ts#FIND-04 input tolerance through the SQL path"
        status: pass
      - kind: unit
        ref: "tests/device-search.test.ts#FIND-04 wildcard safety — % and _ match literals only (T-05-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Homoglyph typing fixture completeness — every HOMOGLYPHS key guarded by the fixture (STATE blocker closed)"
    requirement: FIND-04
    verification:
      - kind: unit
        ref: "tests/device-search.test.ts#FIND-04 fixture completeness — the map cannot outgrow the fixture"
        status: pass
    human_judgment: false
  - id: D4
    description: "URL-driven live search UI: debounced island, «Найдено: N» subtitle under active q, «Ничего не найдено» empty state with hint + «Сбросить фильтры», pagination preserves q"
    requirement: FIND-01
    verification:
      - kind: unit
        ref: "npx vitest run tests/device-search.test.ts (query path behind the UI); wiring greps: parseDevicesSearchParams in page.tsx"
        status: pass
    human_judgment: true
    rationale: "The live-feel of the 300 ms debounce (focus retained, no skeleton flash, Enter commits) is a documented manual-only check at end-of-phase per 05-VALIDATION.md — RSC output cannot be asserted from the vitest node environment"
  - id: D5
    description: "Reverse direction: Latin-typed query finds the Cyrillic-stored MODEL twin through the norm() UDF"
    requirement: FIND-04
    verification:
      - kind: unit
        ref: "tests/device-search.test.ts#FIND-04 reverse direction — Latin query finds the Cyrillic-stored twin"
        status: pass
    human_judgment: false

# Metrics
duration: 18min
completed: 2026-09-04
status: complete
---

# Phase 5 Plan 1: Live Homoglyph-Proof Device Search Summary

**Live URL-driven device search end-to-end: «С123» typed on a Cyrillic keyboard finds the Latin serial «C123» — norm() UDF fold + 300 ms debounced island + the shared query-params module plans 02–04 import.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-09-04T18:10:04Z
- **Completed:** 2026-09-04T18:27:50Z
- **Tasks:** 2/2
- **Files modified:** 10 (4 created, 6 modified)

## Accomplishments
- **The Core Value moment works at the queries level:** `listDevices({ filters: { q: 'с123' } })` finds the serial `C123` — the query-side fold is the write-side `normalizeNumber`, registered as a deterministic `norm()` UDF in `openDb()` (probe-verified approach from 05-RESEARCH Pattern 1).
- **The ONE params module:** `app/(app)/devices/query-params.ts` exports `DeviceFilters`, `WARRANTY_ITEMS`, `parseDevicesSearchParams` (server-side validation: q trim+slice 100, enum guards, zod dept coercion) and `buildDevicesQuery` (full query string, sentinels omitted, D-08 ram/type coupling enforced in the builder) — the single source plans 02–04 and the CSV route will import.
- **Debounced live-search island** (`search-box.tsx`): controlled input outside any `<form>` (React 19 reset landmine), 300 ms debounce → `router.replace(href, { scroll: false })` inside `startTransition`, Enter commits immediately, `value === q` guard skips no-op pushes (Pitfall 6 race with «Сбросить фильтры»).
- **/devices page rewired:** «Найдено: N устройств» subtitle under active q (D-05), third empty state «Ничего не найдено» + раскладка hint + plain-Link «Сбросить фильтры» (D-04), pagination links via `buildDevicesQuery` (q survives paging), filter row `mt-6 flex flex-wrap items-center gap-2` ready for plan 02's FilterBar.
- **Keystone exports:** `DeviceStatusKey` / `DEVICE_STATUS_KEYS` / `isDeviceStatusKey` derived from `DEVICE_STATUS_LABELS` (no parallel list); `HOMOGLYPHS` exported from the .mjs and typed-re-exported.
- **FIND-04 proof layer:** 26-test matrix — all 11 homoglyph pairs forward, reverse direction (Latin query → Cyrillic-stored model, the UDF path), whitespace/case round-trips, 100-char cap, wildcard literal-safety (`a_b`/`a%b`/`%`), RU-sort stability with id tiebreaker, fixture completeness guard (mutation-verified: removing the «Х» pair fails the suite; restored).

## Task Commits

1. **Task 1: End-to-end live search — Cyrillic «с123» finds Latin serial «C123»** - `ff6438d` (feat — tracer)
2. **Task 2: Homoglyph typing fixture + FIND-04 matrix** - `b6aad80` (test — tdd proof layer)

**Plan metadata:** (this commit) docs: complete plan

## Files Created/Modified
- `db/index.ts` — `sqlite.function('norm', { deterministic: true }, normalizeNumber)` after the pragmas in `openDb()`; lazy-singleton pattern untouched
- `db/queries/devices.ts` — `DeviceListFilters` type (undefined-for-inactive), private `searchPredicate()` (fold → cap 100 → escape → 3-way LIKE with ESCAPE '\' via bound params), `listDevices` optional `filters` consumed in the one shared `and(...)`; covers batch and RU-sort untouched
- `app/(app)/devices/query-params.ts` — NEW pure module (no framework imports): the single parse/build path
- `app/(app)/devices/search-box.tsx` — NEW debounced client island (flat props only, imports the builder itself — server-serialization)
- `app/(app)/devices/page.tsx` — parse via `parseDevicesSearchParams`, sentinel stripping into `DeviceListFilters`, subtitle D-05, D-04 empty state, `buildDevicesQuery` pagination, search box in the filter row
- `lib/device-schema.ts` — status keystone exports (type + readonly keys + guard)
- `lib/normalize.mjs` / `lib/normalize.ts` — exported `HOMOGLYPHS` + typed re-export
- `tests/homoglyphs-fixture.ts` — NEW: 11 typed pairs, reverse subset С/О/Е, `assertFixtureCompleteness()`
- `tests/device-search.test.ts` — NEW: FIND-01/FIND-04 matrix against temp SQLite through `listDevices`

## Decisions Made
- **UDF as the only fold point** (plan/RESEARCH-locked): SQL `upper()`/`LIKE` fold ASCII only; the UDF reuses `lib/normalize.mjs` byte-for-byte so query-side and write-side folds cannot diverge. Zero migrations, zero new packages.
- **Server-side 100-char cap on the folded q** (A4) mirrors the serial bound; LIKE wildcards escaped with `ESCAPE '\'` — bound parameters mean user text never enters SQL text (T-05-01/T-05-02 mitigations in place).
- **Sentinel boundary:** URL layer keeps `'all'/null/false/''`; the page strips them into `undefined` before `listDevices` — plan-02 presence guards assume undefined.
- **Empty-state precedence:** q active → «Ничего не найдено» (D-04); the two phase-3 states keep their exact copy when q is empty.

## Deviations from Plan

None requiring auto-fixes — plan executed as written. Two documented interpretations:

1. **Local `page` Number-guard kept in page.tsx** (Task 1 step 7 said "delete the local type/page ad-hoc parsing"). `parseDevicesSearchParams` deliberately does not parse page (it is pagination state, not a filter — plan step 5's param convention routes page through `buildDevicesQuery(f, page)` as an argument), so the fractional-`?page=` integer guard (WR-01) stays as the local backstop; `listDevices` clamps into [1, pages].
2. **TDD RED note (Task 2, tdd="true"):** the implementation predates the proof layer (Task 1 tracer built the feature; Task 2 proves it). The plan explicitly anticipates this: "a genuinely failing first run is expected only for cases like the cap or wildcards if Task 1 missed them" — Task 1 implemented cap + wildcard escape from the start, so the RED run was fully green. No test was weakened; the fixture-completeness guard WAS mutation-verified to fail (removed the «Х» pair → suite failed with «HOMOGLYPHS key „Х“ is missing» → restored).

**Total deviations:** 0 auto-fixed
**Impact on plan:** None — both items are within the plan's own text.

## Issues Encountered
- The mutation-check restore via `git checkout --` failed because the fixture file was still untracked at that moment (new file, Task 2 not yet committed); the pair was re-added manually and the suite re-verified green (32 tests in the two files, 210 across the full suite). Resolved within the task; no code impact.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- Plan 02 (filters) consumes: `query-params.ts` (add status/dept/warranty/ram islands onto `DeviceFilters`), `DEVICE_STATUS_KEYS`/`isDeviceStatusKey`, `WARRANTY_ITEMS`, the `DeviceListFilters` fields the page already strips (`status`, `departmentId`, `warranty`, `ramNoUpgrade` reach `listDevices` but the remaining predicates return undefined until plan 02 implements them), and the filter-row container for FilterBar.
- Plan 03 (warranty) consumes: `warranty` slot in `DeviceListFilters` + the same where-builder; the page's subtitle «Найдено:» trigger set widens to all filters per UI-SPEC Default 6.
- Plan 04 (CSV) imports the exact `parseDevicesSearchParams` — no second parse path exists.
- Full suite green: 210 tests / 15 files (includes pre-existing 187).

---
*Phase: 05-search-filters*
*Completed: 2026-09-04*

## Self-Check: PASSED

- SUMMARY exists: .planning/phases/05-search-filters/05-01-SUMMARY.md
- All 4 created files exist on disk
- Commits verified in git log: ff6438d (Task 1), b6aad80 (Task 2)
- Full suite: 210 tests / 15 files green
