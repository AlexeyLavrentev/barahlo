---
phase: 05-search-filters
fixed_at: 2026-09-04T20:27:16Z
review_path: /Users/aleksey/projects/barahlo/.planning/phases/05-search-filters/05-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-09-04T20:27:16Z
**Source review:** /Users/aleksey/projects/barahlo/.planning/phases/05-search-filters/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (fix_scope: critical_warning — CR-01, WR-01; IN-01..IN-03 out of scope, left untouched)
- Fixed: 2
- Skipped: 0

**Verification:** after each fix, `npx tsc --noEmit` (clean) and `npx vitest run`
(278 passed / 18 files — baseline preserved, nothing broken). Next APIs
(`router.replace(href, { scroll })`, `bfcacheId` fresh-segment behavior) were
verified against the bundled `node_modules/next/dist/docs/` (Next 16.3.3) per
AGENTS.md before applying the client-side reconciliation fix.

## Fixed Issues

### CR-01: DeviceSearchBox state never reconciles with the URL — «Сбросить фильтры» is undone after 300 ms and a padded query loops navigations forever

**Files modified:** `app/(app)/devices/search-box.tsx`, `app/(app)/devices/page.tsx`
**Commit:** be80413
**Status:** fixed: requires human verification (logic-level state-reconciliation change; syntax/type/tests verified, browser behavior should be spot-checked)

**Applied fix:** Applied the review's ref-based reconciliation proposal, verified
against the actual code and the bundled Next 16 docs:

- Added a `lastSynced` ref (initialized to `q`) as the reconciliation anchor.
- The debounce effect now has three branches, in order: (1) mount — record
  `lastSynced = q`; (2) external `q` change (`q !== lastSynced.current` — the
  «Сбросить фильтры» `<Link href="/devices">`, Back/Forward, or the server's
  trimmed echo of a padded push) — adopt it (`lastSynced = q; setValue(q)`) and
  return, never re-push; (3) initiating a push — mark
  `lastSynced = value` before arming the 300 ms timer, so the server-trimmed
  echo (`?q=foo%20` → server `q='foo'`) lands on the adopt branch instead of
  re-arming the timer. The trailing-space navigation loop is structurally
  impossible: after adoption `value === q`, so the effect is a no-op.
- `commitNow` (Enter) also sets `lastSynced.current = value` before its push.
- Replaced the false «no-op push / Pitfall 6» comment with comments describing
  the actual adopt-vs-initiate mechanism.
- Corrected the factually wrong comment at `page.tsx:123-124` (part of CR-01's
  fix per the review): the island's input is cleared by the `lastSynced`
  adopt branch, not by the nonexistent "value === q guard clears the input".

This satisfies the UI-SPEC SearchBox contract (URL is the single search state;
controlled input outside form; Enter commits; `value===q` no-op guard) and the
locked D-04 empty-state behavior — reset now genuinely clears the input.

### WR-01: URL-sentinel stripping block duplicated between the page and the export route

**Files modified:** `app/(app)/devices/query-params.ts`, `app/(app)/devices/page.tsx`, `app/api/devices/export/route.ts`
**Commit:** 85b1fa3
**Status:** fixed

**Applied fix:** Added the single `toDeviceListFilters(f: DeviceFilters):
DeviceListFilters` mapping to `query-params.ts` — the ONE params module, right
after the parser it mirrors field-for-field (type-only `DeviceListFilters`
import keeps the db module unbundled, matching the existing `DeviceListType`
pattern). Both call sites now run the shared mapper:

- `page.tsx`: the 6-line inline strip block replaced by
  `const listFilters = toDeviceListFilters(filters)`; unused
  `DeviceListFilters` type import removed.
- `app/api/devices/export/route.ts`: same replacement; unused type import
  removed; the zero-drift header contract updated to name the one
  parser + one predicate + one sentinel-strip.

The mapping is semantically identical to both removed blocks (verified by
tsc + full suite); a future `DeviceFilters` field now has exactly one strip
site to extend, eliminating the silent-drift hazard.

## Skipped Issues

None — all in-scope findings were fixed.

Out of scope (fix_scope: critical_warning), left as-is: IN-01 (type-filter
hardcoded vocabulary), IN-02 (seed future-dated «assigned» events),
IN-03 (false page.tsx comment — resolved as part of the CR-01 commit).

---

_Fixed: 2026-09-04T20:27:16Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
