---
phase: 07-live
plan: 01
subsystem: search
tags: [live-search, url-state, drizzle, sqlite, react-hooks, rsc, debounce]

# Dependency graph
requires:
  - phase: 05-search-filters
    provides: device live-search island (G-5-1/G-5-2 reconciliation), norm() UDF + normalizeNumber fold, query-params parser/builder pattern, escaped LIKE bind discipline
  - phase: 02-employees
    provides: /employees list page (segments, pagination, empty states), createEmployee, ruSortKey
provides:
  - useDebouncedSearchQuery hook (lib/use-search-param.ts) — frozen API consumed by DeviceSearchBox, EmployeeSearchBox and (Phase 11) the ⌘K palette
  - employeeSearchPredicate (exported, db/queries/employees.ts) — Ё/ё-fold + AND-token + name-OR-department predicate, reused whole by Phase 11
  - URL-driven ?q= on /employees with ONE parser/builder module (employees/query-params.ts)
  - EmployeeSearchBox island mounted on /employees (the page's only client island)
  - listEmployees with optional q — count and rows share one where + innerJoin departments
affects: [07-02 (empty state + subtitle), 07-03 (UAT), 11 (⌘K palette consumes hook + predicate), devices]

# Tech tracking
tech-stack:
  added: []   # zero new npm dependencies (D-10 / REQUIREMENTS Out of Scope)
  patterns:
    - "Shared client hook with verbatim-moved reconciliation body (D-07): behavior bought by two UAT race fixes moves, never rewrites"
    - "Island imports its query builder itself — functions never cross the RSC boundary as props"
    - "Ё/ё search fold = normalizeNumber + local Ё/ё→Latin E/e replace on BOTH sides of every LIKE (UDF untouched, D-01)"
    - "count/rows parity: one where shared by count and rows, join present on both (Pitfall 1/5)"

key-files:
  created:
    - lib/use-search-param.ts
    - app/(app)/employees/query-params.ts
    - app/(app)/employees/search-box.tsx
    - tests/employee-search.test.ts
  modified:
    - app/(app)/devices/search-box.tsx
    - app/(app)/employees/page.tsx
    - db/queries/employees.ts

key-decisions:
  - "Ё/ё search fold lands on the LATIN E/e, not Cyrillic Е/е: a typed base «е» reaches Latin E through the homoglyph map inside normalizeNumber, so the stored «Ё» (which norm() leaves untouched) must fold onto the same Latin codepoint for «елкин» → «Ёлкин» (SC 2). The plan's ruSortKey-inherited Cyrillic Е recipe failed exactly that case"
  - "Hook generic reshaped to target-type T with buildQuery: (f: T & { q: string }) => string — the plan's Q-generic form (target: Omit<Q,'q'>) does not typecheck on the spread push ({ ...target, q } is Omit<Q,'q'> & {q}, not Q). API surface (names, arg roles, return shape) unchanged from UI-SPEC Default 9"
  - "listEmployees count query now carries the innerJoin departments + the shared where — searching by department name cannot drift total from rows (research Pitfall 1)"

patterns-established:
  - "useDebouncedSearchQuery: 300 ms debounce → router.replace(scroll:false) inside startTransition; Enter = commitNow; push-time lastSynced stamp; inFlight cap 4 with exact/trim echo absorption; clean-input-only adoption — one implementation for every search surface"
  - "employeeSearchPredicate: split AFTER the fold (norm collapses whitespace), ≤20 tokens, every token ANDed, each token matches name OR department, patterns bound as parameters with escape '\\'"
  - "buildEmployeesQuery: filter always present (no inactive sentinel), q only when non-empty, page only when ≠ 1 — a fresh push resets pagination by omission (D-05)"

requirements-completed: [FIND-05]

coverage:
  - id: D1
    description: "URL-driven employee search: /employees?q=елкин filters server-side and finds «Ёлкин» via the Ё/ё-fold (SC 2)"
    requirement: FIND-05
    verification:
      - kind: unit
        ref: "tests/employee-search.test.ts#listEmployees q — FIND-05 search (tracer) > a Cyrillic query finds «Ёлкин» through the Ё/ё-fold (елкин → Ёлкин)"
        status: pass
      - kind: unit
        ref: "tests/employee-search.test.ts#listEmployees q — FIND-05 search (tracer) > a cross-field token pair («пётр бух») finds Ёлкин: per token name OR department (D-04)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Shared hook extraction with device behavior frozen: DeviceSearchBox consumes useDebouncedSearchQuery, device suites pass with test files unmodified (SC 5)"
    requirement: FIND-05
    verification:
      - kind: unit
        ref: "npx vitest run tests/device-search.test.ts tests/devices-queries.test.ts (26+42 tests, files untouched — git status empty)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Live input island: typing on /employees filters after 300 ms with no reload; Enter commits immediately; input never blocks (SC 1, D-06)"
    requirement: FIND-05
    verification: []
    human_judgment: true
    rationale: "Input-race behavior (keystroke loss, echo absorption, debounce feel) is browser-only — D-10 assigns SC 1 race scenarios to orchestrator Playwright UAT (plan 03); no UI test runner allowed (D-10/REQUIREMENTS Out of Scope)"

# Metrics
duration: 13min
completed: 2026-09-15
status: complete
---

# Phase 7 Plan 1: Live-поиск по сотрудникам (tracer) Summary

**URL-driven ?q= employee search through every layer with the device reconciliation moved verbatim into the shared useDebouncedSearchQuery hook; «елкин» finds «Ёлкин» via a Ё/ё-fold onto Latin E**

## Performance

- **Duration:** 13 min
- **Started:** 2026-09-15T18:12:25Z
- **Completed:** 2026-09-15T18:25:20Z
- **Tasks:** 2
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments
- Tracer path proven end-to-end: keystroke → hook → router.replace → server parse → employeeSearchPredicate → filtered RSC swap; /employees?q=елкин renders «Ёлкин» server-side
- Shared hook useDebouncedSearchQuery extracted with the G-5-1/G-5-2 reconciliation moved verbatim; DeviceSearchBox refactored onto it with byte-identical render and the device regression suites green untouched
- employeeSearchPredicate exported for Phase 11: normalizeNumber fold + local Ё/ё→Latin E, ≤20 ANDed tokens, each matching name OR department, escaped LIKE patterns bound as parameters
- listEmployees gained optional q with count/rows parity — count carries the same innerJoin departments and shared where
- EmployeeSearchBox island mounted on /employees as the page's only client island (full-width row, «Имя или отдел» / «Поиск по сотрудникам», no form element, no blocking pending state)

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — ?q= employee search through every layer + shared hook extraction** - `71ec255` (feat)
2. **Task 2: EmployeeSearchBox — live input island mounted on /employees** - `71a7490` (feat)

_Note: Tracer feedback gate re-ran the full verify (3 suites + build) after the Task 1 commit — PASS before any expansion._

## Files Created/Modified
- `lib/use-search-param.ts` - useDebouncedSearchQuery: verbatim device reconciliation (lastSynced push-time stamp, inFlight cap 4, clean-input adoption, Enter commitNow)
- `app/(app)/devices/search-box.tsx` - DeviceSearchBox refactored onto the hook; render byte-identical, behavior frozen (SC 5)
- `app/(app)/employees/query-params.ts` - EmployeeFilters + parseEmployeesSearchParams + buildEmployeesQuery (the ONE /employees params module)
- `db/queries/employees.ts` - exported employeeSearchPredicate; listEmployees optional q, count shares innerJoin + where
- `app/(app)/employees/page.tsx` - parses via the module, q passed to listEmployees, all links (segments, pagination) built by buildEmployeesQuery (D-05), island mounted
- `app/(app)/employees/search-box.tsx` - EmployeeSearchBox island (flat props, imports its builder, input outside any form)
- `tests/employee-search.test.ts` - temp-SQLite matrix: Ё/ё-fold, AND tokens, cross-field tokens, department substring, empty-q no-predicate + parser/builder round-trip

## Decisions Made
- Ё/ё fold target is Latin E/e (see Deviations) — verified against the homoglyph map in lib/normalize.mjs, normalize.mjs itself untouched
- Hook generic parameterized over the target type (T & { q: string }) — same API surface as UI-SPEC Default 9, typechecks without casts
- Empty/whitespace q keeps the no-predicate full-list contract; archived segment search inherits everything through the isActive term in the shared where

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Ё/ё-fold target corrected to Latin E/e**
- **Found during:** Task 1 (tracer verify — the SC 2 headline case failed)
- **Issue:** The plan's recipe (`replaceAll('Ё', 'Е')` + SQL `replace(...,'Ё','Е')`, inherited from the ruSortKey recipe) folds a stored «Ё» onto CYRILLIC Е, but a typed base «е» reaches LATIN E through the homoglyph map inside normalizeNumber — so `?q=елкин` found nothing (0 rows), breaking SC 2 («елкин» найдёт «Ёлкин»)
- **Fix:** Fold Ё/ё onto LATIN E/e on both sides: `normalizeNumber(raw).replaceAll('Ё', 'E')` and SQL `replace(replace(norm(col), 'Ё', 'E'), 'ё', 'e')`. Both spellings («елкин», «ёлкин») now produce identical patterns and match the stored name
- **Files modified:** db/queries/employees.ts
- **Verification:** tests/employee-search.test.ts green — «елкин»→Ёлкин, «ёлкин п», «пётр бух», «бух» all find Ёлкин; device suites untouched and green
- **Committed in:** 71ec255 (Task 1 commit)

**2. [Rule 3 - Blocking] Hook generic reshaped to fix a TypeScript variance failure**
- **Found during:** Task 1 (npm run build)
- **Issue:** With `target: Omit<Q, 'q'>`, the push argument `{ ...target, q: value }` has type `Omit<Q,'q'> & { q: string }`, which is not assignable to `Q` (tsc TS2345 on both push sites) — build failed
- **Fix:** Parameterize over the target type: `useDebouncedSearchQuery<T extends object>({ q, target: T, buildQuery: (f: T & { q: string }) => string })`. The spread typechecks; both builders (buildDevicesQuery, buildEmployeesQuery) remain assignable by contravariance. Names, argument roles and the return shape are unchanged from UI-SPEC Default 9
- **Files modified:** lib/use-search-param.ts
- **Verification:** npm run build exits 0; both islands compile against the hook
- **Committed in:** 71ec255 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes required for the plan's own acceptance criteria (SC 2 case + tsc). No scope creep; frozen surfaces (lib/normalize.mjs, db/index.ts, device test files) verified byte-untouched via git status.

## Issues Encountered
- None beyond the two deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 02 can add the third empty state («Ничего не найдено» + «Сбросить поиск» Link) and the «Найдено: N сотрудников» subtitle — parser/builder and island adoption (clean-input clears) are already in place
- Plan 03 UAT covers the browser-only scenarios: live-filter feel, Enter commit, input races (G-5-1/G-5-2 on the new island), segment switch carrying q
- Phase 11 contract ready: employeeSearchPredicate and useDebouncedSearchQuery are exported with frozen APIs (D-07 reversibility noted)

## Self-Check: PASSED

- lib/use-search-param.ts — FOUND
- app/(app)/employees/query-params.ts — FOUND
- app/(app)/employees/search-box.tsx — FOUND
- tests/employee-search.test.ts — FOUND
- Commit 71ec255 — FOUND (git log)
- Commit 71a7490 — FOUND (git log)

---
*Phase: 07-live*
*Completed: 2026-09-15*
