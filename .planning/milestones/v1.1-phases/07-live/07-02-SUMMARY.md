---
phase: 07-live
plan: 02
subsystem: search
tags: [live-search, url-state, empty-state, vitest, homoglyphs, rsc]

# Dependency graph
requires:
  - phase: 07-live
    plan: 01
    provides: buildEmployeesQuery/parseEmployeesSearchParams (ONE params module), employeeSearchPredicate + listEmployees q, EmployeeSearchBox island with clean-input adoption
  - phase: 02-employees
    provides: /employees page skeleton (two phase-2 empty states, segments, pagination), pluralEmployees, ruSortKey
provides:
  - Finished /employees search surface: third empty state «Ничего не найдено» + «Сбросить поиск» (segment-preserving) with q-first precedence (D-08)
  - Subtitle variant «Найдено: {pluralEmployees(total)}» gated on q non-empty exactly
  - Full D-10 matrix in tests/employee-search.test.ts — URL matrix + homoglyphs both directions (11 pairs), wildcard literalness, empty-q contract, non-unique names, count/rows parity walk, clamp, ruSortKey stability
affects: [07-03 (UAT — browser-only scenarios remain), 11 (⌘K consumes the now fully-locked predicate)]

# Tech tracking
tech-stack:
  added: []   # zero new npm dependencies (D-10 / REQUIREMENTS Out of Scope)
  patterns:
    - "Empty-state precedence as a q-first ternary INSIDE one card recipe — the new state wins over both phase-2 states, which stay byte-exact"
    - "Reset-as-omission: «Сбросить поиск» passes q: '' to the ONE builder and lets the builder's omission rule drop it — segment survives, island's clean-input adoption clears the input"
    - "Matrix test file seeds at collection time → tracer assertions are membership/structural, never hardcoded counts"
    - "Page walk bounded by probe.pages — the server clamp makes an unbounded walk-to-empty infinite (devices precedent)"

key-files:
  created: []
  modified:
    - app/(app)/employees/page.tsx
    - tests/employee-search.test.ts

key-decisions:
  - "«Сбросить поиск» href uses the real 07-01 builder signature buildEmployeesQuery({ filter, q: '' }, 1) — the plan/UI-SPEC notation { filter, page: 1 } predates the builder's (f: EmployeeFilters, page = 1) API; semantics identical (q dropped by omission, segment preserved, page 1)"
  - "Tracer tests moved from absolute totals to membership/structural asserts (names byte-identical): vitest seeds the WHOLE file before any test runs, so the growing D-10 matrix invalidates hardcoded counts like toBe(1)/toBe(2)"
  - "Parity walk bounded by probe.pages (devices-queries.test.ts:550 precedent): listEmployees CLAMPS beyond-last pages to the last one, so «walk until an empty page» can never terminate"
  - "Sort-stability seeds share a department-only token («сорт» → Сортировка) — an exact discriminator with zero name-token collisions across the file"

patterns-established:
  - "Third empty state rides the existing card recipe with q !== '' as the first ternary branch; both phase-2 branches untouched"
  - "Homoglyph matrix shape for name columns: per-pair twin seeding ГомNN-<letter>-Гом in a dedicated department; membership asserts because cyr/lat twins canonicalize identically by design"

requirements-completed: [FIND-05]

coverage:
  - id: D1
    description: "Search empty state: non-empty q with zero rows shows «Ничего не найдено» + Ё/ё hint + «Сбросить поиск» that clears ONLY q (segment preserved); wins over both phase-2 states (D-08, SC 4)"
    requirement: FIND-05
    verification:
      - kind: unit
        ref: "npm run build (TS-checked page render path) + acceptance greps: «Ничего не найдено»/«Сбросить поиск»/hint ×1 each; buildEmployeesQuery ×5 call sites; URLSearchParams ×0; phase-2 headings still ×1"
        status: pass
      - kind: unit
        ref: "tests/employee-search.test.ts#URL matrix — absent/hostile params degrade, builder link shapes > segment switch carries q through the builder and resets page by omission (D-05)"
        status: pass
    human_judgment: true
    rationale: "Visual rendering of the empty state (long-text wrap, button look) is browser-only — assigned to plan 03 UAT per the must_haves backstop; no UI test runner allowed (D-10)"
  - id: D2
    description: "Subtitle variant: «Найдено: {pluralEmployees(total)}» exactly while q is non-empty; q-empty keeps the phase-2 counter byte-exact (D-08, UI-SPEC Default 6)"
    requirement: FIND-05
    verification:
      - kind: unit
        ref: "Acceptance greps: «Найдено: » ×3 (comment + template literal), pluralEmployees ×3; npm run build green"
        status: pass
    human_judgment: true
    rationale: "Wording render is visual — plan 03 UAT covers it on the live page"
  - id: D3
    description: "Full D-10 predicate matrix green: homoglyphs both directions (11 pairs), wildcard literalness, empty-q contract, non-unique names, page parity, clamp, ruSortKey stability"
    requirement: FIND-05
    verification:
      - kind: unit
        ref: "npx vitest run — 341 tests / 20 files green, incl. tests/employee-search.test.ts (46 tests); tests/homoglyphs-fixture.ts and tests/device-search.test.ts byte-untouched (git status empty)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Hostile URLs degrade to defaults, never a 500: q trimmed+cap 100, unknown filter → 'active', page integer-guarded + clamped (SC 3, T-07-04)"
    requirement: FIND-05
    verification:
      - kind: unit
        ref: "tests/employee-search.test.ts > URL matrix (absent params → sentinels, 120-char q → first 100) + round-trip describe (junk degrades) + listEmployees clamp test"
        status: pass
    human_judgment: false

# Metrics
duration: 29min
completed: 2026-09-15
status: complete
---

# Phase 7 Plan 2: Live-поиск по сотрудникам (expansion) Summary

**/employees search surface finished: «Ничего не найдено» + segment-preserving «Сбросить поиск», q-gated «Найдено: N» subtitle — and the full D-10 matrix (URL + homoglyphs + wildcards + parity + clamp + sort) locked green with zero production changes**

## Performance

- **Duration:** 29 min
- **Started:** 2026-09-15T18:29:04Z
- **Completed:** 2026-09-15T18:57:34Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Third empty state on /employees with explicit precedence (D-08): any non-empty q with zero rows — including an empty archive reached with a q — shows «Ничего не найдено», the hint «Проверьте раскладку и Ё/ё: „елкин“ найдёт „Ёлкин“.», and «Сбросить поиск»; both phase-2 empty states («Пока нет сотрудников», «Архив пуст») stay byte-exact for q-empty cases
- «Сбросить поиск» is a plain server Link built ONLY through buildEmployeesQuery({ filter, q: '' }, 1) — q dropped by the builder's omission rule, segment preserved; on arrival the island's clean-input adoption clears the input without a focus jump (D-08, deliberate divergence from the devices bare-link reset)
- Subtitle variant: «Найдено: {pluralEmployees(total)}» exactly while q is non-empty; «Найдено: 0 сотрудников» above the empty state is valid output; q-empty keeps the phase-2 counter byte-exact (UI-SPEC Default 6)
- URL matrix locked: absent params → sentinels, 120-char q → first 100 chars, segment switch carries q and resets page by omission (D-05), empty q emits no q/page fragment (Pitfall 5)
- Full predicate matrix locked (46 tests in the file): ALL 11 homoglyph pairs in BOTH directions through the live listEmployees path, wildcard literalness (lone %, _, а%б), empty-q contract, non-unique names disambiguated by department, count/rows parity walk, beyond-last clamp, ruSortKey + id tiebreaker stability — full suite 341 tests green
- Zero production changes needed: the 07-01 predicate/builder/page parse already satisfied the entire matrix (fixture and device tests byte-untouched, D-02/SC 5)

## Task Commits

Each task was committed atomically:

1. **Task 1: Empty state «Ничего не найдено», subtitle variant, URL matrix tests** - `8449c1a` (feat)
2. **Task 2: Full predicate matrix — homoglyphs, escape, parity walk, clamp, sort** - `207bba5` (test)

## Files Created/Modified
- `app/(app)/employees/page.tsx` - q-first empty-state precedence inside the existing card recipe, «Сбросить поиск» Link via the ONE builder, q-gated «Найдено: …» subtitle; loading.tsx/error.tsx untouched (D-06); requireSession() still the first action (T-07-06)
- `tests/employee-search.test.ts` - URL matrix describe + homoglyph matrix (both directions × 11 pairs) + wildcard safety + empty-q contract + non-unique names + parity walk/clamp + sort stability + fixture guard; tracer asserts moved to membership form (names byte-identical)

## Decisions Made
- Reset link written against the real 07-01 builder API (see Deviations) — semantics per D-08 preserved exactly
- Sort-stability probe uses a department-only token («сорт» → «Сортировка») for collision-free exactness; duplicates «Анна Смирнова» ×2 pin the id tiebreaker, asserted searched AND unfiltered («search or not», D-04)
- «анна ит» AND-semantics asserted sharply: «Анна Петрова» (Бухгалтерия) legitimately matches (ПЕТР prefixes «Петрова» + БУХ department) while her twin «Петрова Анна» (ИТ) must be excluded

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reset-link href written against the actual 07-01 builder signature**
- **Found during:** Task 1 (npm run build — TS2353/TS2345)
- **Issue:** The plan/UI-SPEC notation `buildEmployeesQuery({ filter, page: 1 })` predates the builder's actual API `(f: EmployeeFilters, page = 1)` — `page` is the second argument and `EmployeeFilters` requires `q`; the literal plan form does not typecheck
- **Fix:** `href={buildEmployeesQuery({ filter, q: '' }, 1)}` — identical semantics: q dropped by the builder's omission rule, filter survives, page 1
- **Files modified:** app/(app)/employees/page.tsx
- **Verification:** npm run build exits 0
- **Committed in:** 8449c1a (Task 1 commit)

### Test-authoring fixes inside Task 2's RED iteration (test-only, no production drift)
- **Homoglyph/underscore seeds:** `createEmployee` returns `{ id, name, departmentId }` (device `createDevice` returns a bare id) — 23 assertions fixed to destructure/use `.id`
- **Parity walk:** the first draft walked «until an empty page» — impossible, `listEmployees` clamps beyond-last pages to the last one (infinite loop, caught when the suite hung); rewritten to the bounded devices precedent (`p <= probe.pages`)
- **«пётр бух» uniqueness:** «Анна Петрова» legitimately matches (ПЕТР prefixes «Петрова» + Бухгалтерия) — exact-`[yolkin]` claim replaced with the sharper twin discriminator («Петрова Анна» in ИТ excluded)

---

**Total deviations:** 1 auto-fixed (blocking, signature drift) + 3 test-authoring fixes caught by the task's own RED loop. Zero production-code changes against 07-01.
**Impact on plan:** None on scope; frozen surfaces verified byte-untouched via git status (lib/normalize.mjs, db/index.ts, tests/homoglyphs-fixture.ts, tests/device-search.test.ts, loading.tsx, error.tsx).

## TDD Gate Compliance

Task 2 carries `tdd="true"`. The RED phase ran the matrix against the existing 07-01 production code — and the plan explicitly anticipated GREEN being empty ("production code comes from 07-01 and must already satisfy these"). After fixing the test-authoring bugs above, the entire matrix passed with `db/` at zero diff, so there is no GREEN `feat(...)` commit (nothing to implement). Gate sequence: single `test(07-02)` commit instead of RED+GREEN pair — intentional, per the plan's own design for this characterization-matrix task. Any real drift would have produced a `fix/feat` commit in `db/queries/employees.ts` per the task action.

## Issues Encountered
- Full-suite run hung on the first attempt — self-inflicted unbounded parity-walk loop (clamped server pagination); killed the process, bounded the walk, re-ran green. Documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 03 (UAT) owns the browser-only scenarios: empty-state visuals incl. the 100-character q backstop, reset-link input-clearing (clean-input adoption), live-filter feel, segment switch carrying q
- Phase 11 contract unchanged and now fully locked by the matrix: employeeSearchPredicate + useDebouncedSearchQuery exported, behavior pinned by 46 tests

## Self-Check: PASSED

- app/(app)/employees/page.tsx — FOUND (modified, committed)
- tests/employee-search.test.ts — FOUND (modified, committed)
- Commit 8449c1a — FOUND (git log)
- Commit 207bba5 — FOUND (git log)
- Full suite 341/341 green; npm run build green

---
*Phase: 07-live*
*Completed: 2026-09-15*
