---
phase: 04-custody-photos
fixed_at: 2026-09-04T08:05:00Z
review_path: .planning/phases/04-custody-photos/04-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-09-04T08:05:00Z
**Source review:** .planning/phases/04-custody-photos/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (1 Critical, 2 Warning; Info findings untouched per scope)
- Fixed: 3
- Skipped: 0

**Final gates:** `npx vitest run` → 184 passed (174 baseline + 10 new); `npm run build` → success; `npx tsc --noEmit` → clean; `scripts/smoke-custody.mjs`, `scripts/smoke-devices.mjs`, `scripts/smoke-employees.mjs` → all exit 0.

## Fixed Issues

### CR-01: occurredAt «не в будущем» uses server-local (UTC) day boundary — prefilled «today» rejected nightly 00:00–03:00 MSK

**Files modified:** `lib/movement-schema.ts`, `tests/movement-schema.test.ts` (new — reviewer-mandated regression test)
**Commit:** 1a31814
**Status:** fixed: requires human verification (logic-class change; behavior is pinned byte-exact by frozen-clock tests, but the day-semantics choice deserves a human glance)

**Applied fix:**
- `isNotFutureDate` now compares the submitted `yyyy-mm-dd` against TODAY IN `DISPLAY_TZ` (Europe/Moscow, imported from `lib/ru.ts` — single source; both pure lib modules) via `Intl.DateTimeFormat` parts, instead of server-local `new Date(y, m-1, d)` vs `startOfTomorrow`. Both strings are `yyyy-mm-dd`, so lexicographic comparison is chronological. Today is legal, tomorrow+ rejected — identical boundary semantics, correct zone.
- `occurredAtFromDate` now builds the stored instant so its **Moscow** wall clock equals the submitted day with NOW's Moscow time-of-day (fixed-point UTC-offset resolution from `Intl` parts — two steps from the original target; Moscow is fixed UTC+3 so the first step lands). This closes the second half of the review's fix paragraph ("the stored instant's day semantics"): previously the UTC container stored the event 3h shifted, landing on Moscow day D+1 for submissions in the nightly window (timeline would display «04.09» for a 03.09 event).
- Both helpers take an injectable `now: Date = new Date()`; the zod `.refine` now wraps in an arrow so a zod context can never be forwarded into the new `now` parameter.
- Empirical verification: with the clock frozen at `2026-09-02T21:30:00Z` (= MSK 00:30 09-03, the review's exact example) and `2026-09-02T22:00:00Z` (= MSK 01:00), the prefilled «today» `2026-09-03` now passes `isNotFutureDate` and the full `assignSchema`/`acceptSchema` path (was rejected pre-fix), and «tomorrow» still fails with «Дата не может быть в будущем».
- New `tests/movement-schema.test.ts` (10 tests) pins: MSK 00:30/01:00 «today» passes (incl. one `vi.setSystemTime` full-schema run), «tomorrow» rejected, backdating legal, and byte-exact stored instants (`2026-09-02T22:00:00.000Z` for MSK 09-03 01:00; backdate and daytime sanity). Existing 174 tests untouched and green.

### WR-01: Partially failed batch upload leaves the photo grid stale

**Files modified:** `app/(app)/(card)/devices/[id]/photo-grid.tsx`
**Commit:** 3ca056d
**Status:** fixed

**Applied fix:** `onFilesChosen` counts `stored` successes; `router.refresh()` moved to the `finally` block and runs whenever `stored > 0` — so a mid-batch failure (e.g. 4th file hits `409 CAP` after 3 stored) now refreshes the grid to show the 3 stored photos alongside the single UI-SPEC error copy, while a total first-file failure still skips the refresh. Input reset and `setUploading(false)` unchanged.

### WR-02: Employee picker shows «Нет активных сотрудников» for any zero-match search

**Files modified:** `app/(app)/devices/movement-dialogs.tsx`
**Commit:** d079179
**Status:** fixed

**Applied fix:** split the two zero states in `EmployeePicker` per the review's suggested shape: the UI-SPEC hiring hint «Нет активных сотрудников — добавьте их в разделе „Сотрудники“.» (byte-exact copy preserved) renders via `ComboboxEmpty` only when `employees.length === 0`; a query that matches nothing among existing employees renders a neutral inline `<p>Никого не найдено</p>` (`px-3 py-2 text-sm text-ink-secondary` — same classes as the `employee-dialog.tsx` inline-fallback precedent). When matches exist, neither renders.

## Skipped Issues

None — all in-scope findings were fixed.

## Notes

- Info findings (IN-01..IN-05) were explicitly out of scope and untouched.
- CR-01 intentionally fixed via DISPLAY_TZ comparison (not the `TZ=Europe/Moscow` container env alternative) per fix instruction; the env alternative remains a valid belt-and-suspenders follow-up for the whole codebase but was not required by the finding scope.
- On a Moscow-local dev machine and on the UTC container outside the 00:00–03:00 MSK window, the CR-01 change is behavior-neutral; inside the nightly window it is exactly the fix (reject→accept, stored day D+1→D). This equivalence was checked analytically (fixed-offset zones cancel in the old formula) and pinned by the new tests.

---

_Fixed: 2026-09-04T08:05:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
