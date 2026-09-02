---
phase: 03-device-registry
fixed_at: 2026-09-02T10:46:49Z
review_path: .planning/phases/03-device-registry/03-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-09-02T10:46:49Z
**Source review:** .planning/phases/03-device-registry/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (warnings only — no criticals; Info findings untouched per scope)
- Fixed: 3
- Skipped: 0

**Final gates (after all fixes):** `npx vitest run` 102/102 passed · `npm run build` success · `node scripts/smoke-devices.mjs` SMOKE OK · `node scripts/smoke-employees.mjs` SMOKE OK · `npx tsc --noEmit` clean for modified files (only pre-existing environmental `LayoutProps` error in unmodified `app/layout.tsx` from the absent `.next/types` in a fresh checkout; resolves on `next build`, which passed).

## Fixed Issues

### WR-01: Fractional `?page=` query param crashes the devices list route

**Files modified:** `app/(app)/devices/page.tsx`, `app/(app)/employees/page.tsx`
**Commit:** 6ae3541
**Applied fix:** Replaced `Math.max(1, Number(sp.page) || 1)` with the reviewer's integer guard on both list pages (the coordinator directed the same fix for the phase-2 employees page, which shares the flaw):

```ts
const parsedPage = Number(sp.page)
const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
```

A fractional `?page=1.05` now falls back to page 1, so `listDevices`/`listEmployees` never bind a non-integer OFFSET (better-sqlite3 `datatype mismatch` crash and the error-boundary dead end are gone); NaN, 0, negative, and Infinity also fall back to 1. The query layer's existing clamp into `[1, pages]` is unchanged. Inline comments updated to describe the integer guard.

### WR-02: List sort order contradicts the binding UI-SPEC (alphabetical vs newest-first)

**Files modified:** `.planning/phases/03-device-registry/03-UI-SPEC.md`
**Commit:** e577e40
**Applied fix:** Doc-only resolution (plan wins; code untouched, per coordinator). Amended the binding spec in both places the reviewer cited:
- Line 108 list contract: replaced «Sort: newest first (`created_at DESC`, id DESC tiebreak — default, see Defaults)» with «Sort: по модели (русская коллация, Ё-нормализация), id как тай-брейкер» plus a note that the plan override is documented in 03-01-SUMMARY and UAT-confirmed.
- Line 222 Defaults/audit-trail row: default column now states «По модели (русская коллация, Ё-нормализация), id как тай-брейкер»; basis column records that the original «`created_at DESC` (newest first)» default was overridden by plan 03-01 (Ё-sort plan test is a mandatory acceptance), override documented in 03-01-SUMMARY, UAT confirmed.

Downstream phases (5+) now read the shipped contract. No other .planning files touched.

### WR-03: Card «Редактировать» renders as an accent-primary button; UI-SPEC says secondary

**Files modified:** `app/(app)/devices/device-dialog.tsx`
**Commit:** 838199d
**Applied fix:** The dialog trigger Button now derives its variant from the component's mode: `variant={editing ? 'secondary' : 'default'}`. The card's «Редактировать» trigger renders as secondary per UI-SPEC:112; the list's «Добавить устройство» CTA (create mode) keeps the accent `default` variant, which the UI-SPEC color rules explicitly reserve for it. Accent is no longer diluted by an extra filled button on every card. Phase-2 `employee-dialog.tsx` was NOT touched (out of the coordinator's scope).

## Skipped Issues

None — all findings in scope were fixed.

---

_Fixed: 2026-09-02T10:46:49Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
