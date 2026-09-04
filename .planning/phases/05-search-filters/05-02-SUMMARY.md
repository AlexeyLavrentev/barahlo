---
phase: 05-search-filters
plan: 02
subsystem: filters
tags: [sqlite, drizzle, warranty-date-math, url-driven-filters, nextjs-16, react-19, empty-states]

# Dependency graph
requires:
  - phase: 05-search-filters
    plan: 01
    provides: "query-params.ts (DeviceFilters/WARRANTY_ITEMS/parse/build), DeviceListFilters + searchPredicate in the shared where, search-box island, /devices page skeleton"
  - phase: 03-device-registry
    provides: "listDevices extension point (leftJoin employees, RU-sort, covers batch), type-filter island template"
  - phase: 01-foundation
    provides: "lib/ru DISPLAY_TZ (CR-01 lesson), vitest temp-SQLite harness"
provides:
  - "lib/warranty.ts — WARRANTY_WARN_DAYS = 60 (ONE inclusive boundary for filter AND color), displayTodayUtc() (CR-01 wall-clock recipe), addDaysUtc(), WarrantyState, warrantyState() — plan 03 consumes for coloring"
  - "warrantyPredicate + status/department/ramNoUpgrade predicates composed into the single listDevices where (count and rows share it, count carries the same employees leftJoin)"
  - "DeviceWarrantyFilter / DeviceStatusFilter / DeviceDepartmentFilter / RamChip islands + FilterBar server composition (D-12 one bar, CSV slot at the end for plan 04)"
  - "type-filter rewired onto buildDevicesQuery — the last bare push in the app is gone"
  - "three-state empty-state precedence + any-dimension «Найдено: …» subtitle on /devices"
  - "tests/warranty.test.ts (frozen-clock boundaries) + the full filter matrix in tests/devices-queries.test.ts"
affects: [05-03 warranty coloring, 05-04 csv export, 05-05 perf]

# Tech tracking
tech-stack:
  added: [] # zero new packages (T-05-SC — no supply-chain surface)
  patterns:
    - "Warranty boundaries computed in JS on the DISPLAY_TZ wall clock (en-CA formatToParts → Date.UTC midnight) and bound as Date operands on the timestamp-mode column — never date('now')"
    - "NULL-safe SQL: ramNoUpgrade predicate = and(typeKey='laptop', or(isNull(ramUpgraded), ne(ramUpgraded, 1))) — plain != 1 silently drops NULL rows"
    - "Department filter rides the existing leftJoin on the pk side; the COUNT query carries the same join so the shared where can span employees"
    - "Server FilterBar composition: listDepartments() called once server-side, flat {id,name} rows across the RSC boundary; islands import the ONE builder themselves"

key-files:
  created:
    - lib/warranty.ts
    - app/(app)/devices/warranty-filter.tsx
    - app/(app)/devices/filter-bar.tsx
    - app/(app)/devices/status-filter.tsx
    - app/(app)/devices/department-filter.tsx
    - app/(app)/devices/ram-chip.tsx
    - tests/warranty.test.ts
  modified:
    - db/queries/devices.ts
    - app/(app)/devices/type-filter.tsx
    - app/(app)/devices/page.tsx
    - tests/devices-queries.test.ts

key-decisions:
  - "Unified INCLUSIVE 60-day warranty boundary (orchestrator resolution 1): one WARRANTY_WARN_DAYS = 60 backs the «Истекает ≤ 60 дней» filter AND the future color — a filter hit can never render green; «истекает ≤ N» presets are active-only windows, NULL warranty matches no warranty filter"
  - "D-07 SQL shape exactly per orchestrator resolution 5: (type_key = 'laptop') AND (ram_upgraded IS NULL OR ram_upgraded != 1); the term is self-limiting server-side — hand-crafted ?type=monitor&ram=1 is inert (client coupling is UX only, T-05-06)"
  - "The count query carries the same leftJoin(employees) as the rows query because the shared where now spans employees — join on the pk side keeps the total exact (Pitfall 5 preserved)"
  - "«Найдено: …» fires for ANY active dimension incl. type-only (UI-SPEC Default 6); the empty-state's «Ничего не найдено» deliberately EXCLUDES type so a type-only empty keeps the phase-3 copy verbatim (Default 7)"

patterns-established:
  - "displayTodayUtc(): en-CA yyyy-mm-dd parts in DISPLAY_TZ → Date.UTC midnight — the canonical «today» for every day-level boundary (plan 03 reuses)"
  - "Chip coupling in ONE builder: activate writes type=laptop+ram, deactivate drops ram keeps laptop, non-laptop type drops ram — components never re-implement it"
  - "Filter islands: flat props in, buildDevicesQuery out — no island builds query strings manually"

requirements-completed: [FIND-02, FIND-03]

coverage:
  - id: D1
    description: "«Ноуты без апгрейда RAM» one click — NULL-safe predicate (0 and NULL included, 1 excluded, non-laptops never, hostile combos inert)"
    requirement: FIND-02
    verification:
      - kind: unit
        ref: "tests/devices-queries.test.ts#RAM «без апгрейда» — NULL-safe D-07 predicate (edge 5) > includes laptops with ramUpgraded 0 AND NULL, excludes ramUpgraded 1"
        status: pass
      - kind: unit
        ref: "tests/devices-queries.test.ts#RAM «без апгрейда» > hostile hand-crafted combo ?type=monitor&ram=1 is inert (T-05-06)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Type/status/department/warranty filters and q compose freely; URL round-trips every filter; invalid URLs degrade to «all», never 500"
    requirement: FIND-03
    verification:
      - kind: unit
        ref: "tests/devices-queries.test.ts#composition — every filter combines with every other and with q (edge 6) > count and rows share ONE where — a paged walk yields exactly total rows"
        status: pass
      - kind: unit
        ref: "tests/devices-queries.test.ts#degrade — junk URL params never reach SQL as an invalid enum (edge 6)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Department = holder's dept: in-stock excluded, archived holders included, unknown id → empty (D-09)"
    requirement: FIND-03
    verification:
      - kind: unit
        ref: "tests/devices-queries.test.ts#department — the holder's dept (D-09, edge 6) > matches exactly the devices whose CURRENT holder belongs to the department"
        status: pass
    human_judgment: false
  - id: D4
    description: "Unified inclusive 60-day warranty window at the SQL boundary (day 0/60 in, day 61 out, yesterday expired, null never) backed by one constant"
    requirement: WAR-01
    verification:
      - kind: unit
        ref: "tests/warranty.test.ts#warrantyState — the ONE inclusive boundary (edge 8/9) > wu == today + 60 is warn — the inclusive boundary (edge 8)"
        status: pass
      - kind: unit
        ref: "tests/devices-queries.test.ts#listDevices — warranty filters (WAR-01, edge 9 filter side) > «Истекает ≤ 60 дней» returns exactly the inclusive warn band (day 0/30/60)"
        status: pass
    human_judgment: false
  - id: D5
    description: "One-bar FilterBar D-12 order, chip states, select widths, empty-state precedence, «Найдено: …» trigger — live filter feel is a held-out end-of-phase check"
    requirement: UI-03
    verification:
      - kind: grep
        ref: "aria-labels «Фильтр по статусу/отделу/гарантии», aria-pressed on RamChip, sm:w-48 warranty trigger, zero combobox occurrences in the islands; npx next build green"
        status: pass
    human_judgment: true
    rationale: "The live one-bar wrap on narrow viewport, chip press feel and select ergonomics are the documented manual-only checks at end-of-phase per 05-VALIDATION.md (human_verify_mode: end-of-phase) — RSC output cannot be asserted from the vitest node environment"

# Metrics
duration: 21min
completed: 2026-09-04
status: complete
---

# Phase 5 Plan 2: Combinable Filters — «Ноуты без апгрейда RAM» Summary

**Combinable filters end-to-end: the NULL-safe RAM predicate `(type=laptop) AND (ram_upgraded IS NULL OR != 1)`, type/status/department/warranty windows composing with search in ONE shared where — with the unified inclusive 60-day warranty boundary backed by a single constant.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-09-04T18:34:57Z
- **Completed:** 2026-09-04T18:56:12Z
- **Tasks:** 3/3 (tracer + tdd + auto)
- **Files modified:** 11 (7 created, 4 modified)

## Accomplishments
- **FIND-02 is one click:** RamChip island activates → `type=laptop&ram=1&page=1`; the server predicate `and(eq(typeKey,'laptop'), or(isNull(ramUpgraded), ne(ramUpgraded,1)))` includes NULL- and 0-flag laptops, excludes upgraded ones, and never matches non-laptops — hand-crafted `?type=monitor&ram=1` is inert (T-05-06; client coupling lives only in the ONE builder).
- **FIND-03 composes for free:** status/department/warranty predicates joined q and type in the single `and()` shared by count and rows. Department rides the existing `leftJoin(employees)` — in-stock rows drop out for free, archived holders stay (D-09). Junk params degrade to «all»/null/false before SQL ever sees them.
- **WAR-01 foundation:** `lib/warranty.ts` with `WARRANTY_WARN_DAYS = 60` (unified INCLUSIVE boundary — orchestrator resolution 1), `displayTodayUtc()` (CR-01 wall-clock recipe, en-CA parts), `addDaysUtc()`, pure `warrantyState()`. `warrantyPredicate` binds the same boundaries as Date operands: «истекает ≤ N» is active-only, «истекла» is `wu < today` non-null, NULL matches nothing.
- **The one-bar FilterBar (D-12):** server composition поиск → тип → статус → отдел → гарантия → RAM-чип; four new islands receive flat props and route through `buildDevicesQuery`; type-filter rewired — the last bare `?type=X&page=1` push in the app is gone.
- **Edge 11/12 wired:** every filter change resets page via the builder; page 0/-3/fractional clamp to 1, beyond-pages clamps to last (listDevices backstop). Empty-state precedence: any of q/статус/отдел/гарантия/RAM → «Ничего не найдено» + раскладка hint + «Сбросить фильтры»; type-only and zero-overall keep phase-3 copy verbatim. «Найдено: …» fires for any active dimension incl. type-only.

## Task Commits

1. **Task 1: End-to-end warranty window — «Истекает ≤ 60 дней» filters the registry (tracer)** - `e35b2a1` (feat)
2. **Task 2: The full filter matrix — NULL-safe D-07 SQL (RED gate)** - `10cb3ee` (test — 13 failing tests demonstrated against the Task-1 tree)
3. **Task 2: status + department + RAM predicates in the one where-builder (GREEN)** - `e414c35` (feat)
4. **Task 3: Filter bar completion — islands, chip coupling, empty-state precedence** - `fd629c4` (feat)

**Plan metadata:** (this commit) docs: complete plan

## Files Created/Modified
- `lib/warranty.ts` — NEW pure module: WARRANTY_WARN_DAYS/displayTodayUtc/addDaysUtc/warrantyState (injectable clock, no framework imports)
- `db/queries/devices.ts` — `warrantyPredicate` (active-only windows + expired + NULL exclusion) and status/department/ramNoUpgrade terms in the shared where; count query carries the same employees leftJoin
- `app/(app)/devices/warranty-filter.tsx` — NEW island (WARRANTY_ITEMS, sm:w-48, «Фильтр по гарантии»)
- `app/(app)/devices/filter-bar.tsx` — NEW server composition, D-12 order, CSV slot documented for plan 04
- `app/(app)/devices/status-filter.tsx` — NEW island («Все статусы» + keystone-derived options, sm:w-40)
- `app/(app)/devices/department-filter.tsx` — NEW island (flat items prop, Select not combo per D-13, truncate trigger, zero-departments fallback)
- `app/(app)/devices/ram-chip.tsx` — NEW pill toggle (aria-pressed, bg-ink active state, active:scale press rule)
- `app/(app)/devices/type-filter.tsx` — rewired onto buildDevicesQuery with a flat filters prop; trigger narrowed to sm:w-40
- `app/(app)/devices/page.tsx` — FilterBar swap, three-state empty-state precedence, any-dimension subtitle
- `tests/warranty.test.ts` — NEW frozen-clock suite (MSK 00:30 pair, day 0/59/60/61, expired, null)
- `tests/devices-queries.test.ts` — extended: warranty SQL matrix + full filter matrix (RAM/dept/status/composition/degrade/ordering/clamp)

## Decisions Made
- **Unified inclusive 60-day boundary** (resolution 1, closes RESEARCH Open Question 1 / UI-SPEC Defaults #3): day 0 and day 60 are warn AND inside the ≤60 filter; day 61 is ok — one constant, so a filter hit can never render green (plan 03 consumes the same `warrantyState`).
- **Count query carries the employees leftJoin.** The shared where spans `employees` (department term), so the bare `from(devices)` count crashed; adding the identical leftJoin (pk-side, cannot multiply rows) keeps Pitfall 5's property — count and rows provably cannot drift.
- **Type-only excluded from the empty-state trigger, included in the subtitle trigger.** UI-SPEC Default 6 says «Найдено: …» fires for any dimension incl. type-only; Default 7 says the «Ничего не найдено» state fires only for the new dimensions — two variables (`anyFilterActive` / `anySearchFilter`) encode exactly that.
- **Server predicate self-limiting, client coupling UX-only** (RESEARCH Pattern 6): the ram term includes `type_key='laptop'` regardless of the chip; a hostile combo renders the chip inactive and returns nothing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Count query lacked the employees join once the where spanned it**
- **Found during:** Task 2 (GREEN run — the department term made every `listDevices` call with a departmentId throw at the count query)
- **Issue:** the count query selected `count()` from `devices` only, while the shared where now referenced `employees.department_id` — SQLite «no such column» at `.get()`
- **Fix:** the count query carries the same `leftJoin(employees, eq(devices.currentEmployeeId, employees.id))`; pk-side join cannot multiply rows, so the total stays exact
- **Files modified:** db/queries/devices.ts
- **Commit:** e414c35

### Documented interpretations (no code deviation)

1. **TDD RED gate quality (Task 2):** 13 of the new matrix tests failed against the Task-1 tree as required. A handful passed trivially in RED (degrade, clamp, parity) — they exercise behavior plan 01 already shipped and now guard regressions under filters. One RED-passing test (archived holder) becomes discriminating only after GREEN, where the exact-match test gates the predicate.
2. **Fixture fidelity (Task 2):** assigning a holder via raw SQL does not change `status` (production custody actions set holder+status together); fixtures set both, matching production semantics.
3. **«combobox» token in comments:** the plan's automated verify greps department-filter.tsx for zero combobox occurrences; the D-13 historical comment was worded «Base UI combo input» to keep the rationale (bb5674e, 7e400c9) without tripping the structural check. No combobox import or usage exists.

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** none — the fix is the minimal consequence of the plan's own "Keep ONE and() object shared by the count and rows queries" constraint.

## Issues Encountered
- Two test-file iterations during RED authoring: an unescaped apostrophe in a describe title (parse error) and a fixture whose status/holder pair didn't match production semantics — both caught by the RED run itself and fixed before the gate commit. No product-code impact.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- Plan 03 (warranty coloring) consumes: `warrantyState()` + `displayTodayUtc()` from `lib/warranty.ts` (the ONE calculation for all three render sites), `WARRANTY_WARN_DAYS` for the same boundary, and `devices.warrantyUntil` (already on DeviceRow).
- Plan 04 (CSV) consumes: `parseDevicesSearchParams` unchanged (zero-drift guarantee holds), `listDevices`' where-builder as the template for the full filtered scan, and the FilterBar end slot (`ml-auto`) for the «Скачать CSV» link.
- Plan 05 (perf) inherits: the composed where is the measured 0.9 ms @ 500 rows shape (RESEARCH probe); the new predicates add index-friendly terms (`warranty_until_idx` partial index exists).
- Full suite green: 249 tests / 16 files (baseline after 05-01 was 210 / 15); `npx next build` green.

---
*Phase: 05-search-filters*
*Completed: 2026-09-04*

## Self-Check: PASSED

- SUMMARY exists: .planning/phases/05-search-filters/05-02-SUMMARY.md
- All 7 created files exist on disk
- Commits verified in git log: e35b2a1 (Task 1 tracer), 10cb3ee (Task 2 RED), e414c35 (Task 2 GREEN), fd629c4 (Task 3)
- D-07 SQL shape verified in source: `or(isNull(devices.ramUpgraded), ne(devices.ramUpgraded, 1))` inside `eq(devices.typeKey, 'laptop')`
- Full suite: 249 tests / 16 files green; `npx next build` green
