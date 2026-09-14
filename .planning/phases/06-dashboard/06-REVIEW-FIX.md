---
phase: 06-dashboard
fixed_at: 2026-09-14T08:46:31Z
review_path: .planning/phases/06-dashboard/06-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 6: Code Review Fix Report

**Fixed at:** 2026-09-14T08:46:31Z
**Source review:** .planning/phases/06-dashboard/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (WR-01, WR-02 — Info findings IN-01..IN-04 out of scope per config)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: Warranty window predicate spelled out three times instead of composed

**Files modified:** `db/queries/devices.ts`
**Commit:** a8c2bf7
**Applied fix:** Gave `warrantyPredicate` an injectable `today: Date = displayTodayUtc()` parameter (default preserves every `deviceWhere` filter call site unchanged) and made both dashboard consumers COMPOSE it instead of re-spelling the window bodies:
- `warrantyPresetCounts` now counts through `warrantyPredicate(w, today)` via a local `countOf` helper — the «≤ 30» / «≤ 60» (WARRANTY_WARN_DAYS) / «Истекла» bodies exist exactly once, so counter==filter parity (D-04) is parity by construction.
- `nearestExpiringWarranties` where clause is now `warrantyPredicate('w60', today)` — the third verbatim copy of the w60 window is gone.
- Stale comments updated to describe the composition (the old «spelled out identically» comments would have lied after this change).

Semantics verified identical: all 17 tests in `tests/dashboard-queries.test.ts` (parity, hand-known bucket membership 1/3/1, TZ-boundary frozen-clock suite) pass unmodified. Note: this touches SQL-boundary logic per review guidance; flagged for human verification in the validation phase regardless.

### WR-02: Type-tile labels duplicate the filter island's copy with no byte-exactness enforcement

**Files modified:** `app/(app)/devices/query-params.ts`, `app/(app)/devices/type-filter.tsx`, `app/(app)/page.tsx`
**Commit:** c572e47
**Applied fix:** Added `TYPE_ITEMS` (the four keystone types with their plural UI-SPEC copy, `as const`) to `app/(app)/devices/query-params.ts` beside the `WARRANTY_ITEMS` precedent. `FILTER_ITEMS` in the type-filter island now composes `[{ value: 'all', label: 'Все типы' }, ...TYPE_ITEMS]`, and the dashboard's `TYPE_TILE_LABELS` became a lookup (`Map`) built from `TYPE_ITEMS` — the four Russian labels exist in exactly one place and byte-exactness is structural. Rendered copy unchanged (verified by smoke needles / build).

## Skipped Issues

None — both in-scope findings fixed.

## Out of Scope (untouched, per fix_scope: critical_warning)

- IN-01 (unused `DEVICE_STATUS_KEYS` import in `app/(app)/page.tsx`) — left as-is; still the only eslint finding on the changed files (pre-existing warning, 0 errors).
- IN-02 (unused `addDaysUtc` binding in tests) — left as-is.
- IN-03 (smoke scaffolding duplication) — left as-is.
- IN-04 (`redirect: 'manual'` junk header in smokes) — left as-is.

## Validation (post-fix, full battery in the isolated worktree)

- `npx vitest run`: 19 files / 295 tests — all passing (baseline preserved, dashboard-queries tests unmodified).
- `npx tsc --noEmit`: clean.
- `npm run lint` on changed files (`db/queries/devices.ts`, `app/(app)/page.tsx`, `app/(app)/devices/type-filter.tsx`, `app/(app)/devices/query-params.ts`): 0 errors, 1 pre-existing warning (IN-01, out of scope).
- `npm run build`: green; `/` remains dynamic (`ƒ`) per D-06.

---

_Fixed: 2026-09-14T08:46:31Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
