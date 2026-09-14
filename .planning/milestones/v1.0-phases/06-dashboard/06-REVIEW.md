---
phase: 06-dashboard
reviewed: 2026-09-14T08:35:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - app/(app)/nav.tsx
  - app/(app)/page.tsx
  - db/queries/devices.ts
  - db/queries/movements.ts
  - scripts/smoke-dashboard.mjs
  - scripts/smoke-devices.mjs
  - tests/dashboard-queries.test.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-09-14T08:35:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the phase-6 dashboard slice at standard depth against 06-CONTEXT.md (D-01..D-06) and 06-UI-SPEC.md. The core read-model is solid: the page is a pure RSC made dynamic by `requireSession()` → `cookies()` (D-06's no-cache requirement holds — no static prerender path exists), `displayTodayUtc()` is computed once per render and threaded to all three warranty consumers (WAR-01), every filter href goes through `buildDevicesQuery` with a FULL `DeviceFilters` (D-03/D-04 — no hand-concatenated filter URLs anywhere; the only raw hrefs are numeric-id card routes), feed rows have no nested anchors, route segments match the locked UI-SPEC table per event type (incl. conditional `to_repair`), no `loading.tsx` exists at `(app)` level, tile zero-defaults iterate the keystone lists with `?? 0`, and the `as DeviceTypeKey`/`as Date` casts are backed by the schema FK/CHECK constraints. The 17 parity/boundary tests pass (verified: `17 passed`), `tsc --noEmit` is clean, and spot-checked copy (tile labels, counter rows, empty states) is byte-exact vs the spec.

Two warnings remain, both instances of the same failure shape: a single-source invariant satisfied by duplication + tests instead of by construction. No critical issues — no injection, no auth gap, no data-loss path, no incorrect SQL boundary was found.

## Warnings

### WR-01: Warranty window predicate spelled out three times instead of composed

**File:** `db/queries/devices.ts:306-346` (also `:361-389`, reference `:191-203`)
**Issue:** The phase's cardinal invariant is «counter==filter parity (no duplicated predicate logic)» (D-04: счётчики «обязаны использовать те же предикаты, что фильтры»). The implementation does NOT reuse `warrantyPredicate` — `warrantyPresetCounts` re-spells the «≤ 30» / «≤ 60» / «истекла» operator bodies (:310-344), and `nearestExpiringWarranties` re-spells the w60 window a third time (:372-378). The comments acknowledge this («spelled out identically») and lean on co-location plus the parity tests. That is parity by test, not by construction: the tests pin today's windows, but any future edit to one copy (e.g., a boundary change made only in `warrantyPredicate`) silently desyncs the dashboard from the list until CI catches it — and the top-5 rows would then show devices whose color/counter/list disagree, the exact «cardinal bug» the phase forbids. The stated blocker to reuse (`warrantyPredicate` computing its own `today`) is trivially removable.
**Fix:**
```ts
// db/queries/devices.ts
function warrantyPredicate(
  w: DeviceListFilters['warranty'],
  today: Date = displayTodayUtc(),   // injectable — deviceWhere call sites unchanged
) {
  if (!w) return undefined
  if (w === 'expired') {
    return and(isNotNull(devices.warrantyUntil), lt(devices.warrantyUntil, today))
  }
  const days = w === 'w30' ? 30 : WARRANTY_WARN_DAYS
  return and(
    isNotNull(devices.warrantyUntil),
    gte(devices.warrantyUntil, today),
    lte(devices.warrantyUntil, addDaysUtc(today, days)),
  )
}

export function warrantyPresetCounts(
  today: Date = displayTodayUtc(),
): WarrantyPresetCounts {
  const countOf = (w: NonNullable<DeviceListFilters['warranty']>) =>
    db.select({ value: count() }).from(devices)
      .where(warrantyPredicate(w, today)).get()!.value
  return { w30: countOf('w30'), w60: countOf('w60'), expired: countOf('expired') }
}

// nearestExpiringWarranties: .where(warrantyPredicate('w60', today))
```
All existing tests must still pass unchanged (verified semantics identical).

### WR-02: Type-tile labels duplicate the filter island's copy with no byte-exactness enforcement

**File:** `app/(app)/page.tsx:41-46`
**Issue:** `TYPE_TILE_LABELS` («Ноутбуки» / «Мониторы» / «Док-станции» / «Периферия») must stay byte-exact with `FILTER_ITEMS` in `app/(app)/devices/type-filter.tsx:24-29` — a locked UI-SPEC copy contract. The in-code justification («an RSC page cannot import a client island's constant») is true for the island file itself, but the labels could live in a plain shared module that both sides already import: `query-params.ts` is non-client, imported by `type-filter.tsx` today, and already hosts UI vocabulary (`WARRANTY_ITEMS` with its option labels — the exact precedent). As written, a future copy edit to the filter option silently diverges the dashboard tile, and nothing (type system, test, lint) detects it.
**Fix:**
```ts
// app/(app)/devices/query-params.ts — beside WARRANTY_ITEMS
export const TYPE_ITEMS = [
  { value: 'laptop', label: 'Ноутбуки' },
  { value: 'monitor', label: 'Мониторы' },
  { value: 'dock', label: 'Док-станции' },
  { value: 'peripheral', label: 'Периферия' },
] as const
```
Then `FILTER_ITEMS` composes `{ value: 'all', label: 'Все типы' } + TYPE_ITEMS` in the island, and `TYPE_TILE_LABELS` is replaced by a lookup over `TYPE_ITEMS` on the page. One source, byte-exact by construction.

## Info

### IN-01: Unused import `DEVICE_STATUS_KEYS`

**File:** `app/(app)/page.tsx:22`
**Issue:** Imported but never used — `STATUS_TILE_ORDER` is the (deliberately different, D-02-locked) literal order and `deviceStatusLabel` supplies labels. Confirmed by eslint (`no-unused-vars`).
**Fix:** Delete `DEVICE_STATUS_KEYS,` from the import block.

### IN-02: Unused destructured binding `addDaysUtc`

**File:** `tests/dashboard-queries.test.ts:54`
**Issue:** `const { addDaysUtc, displayTodayUtc } = warrantyModule` — `addDaysUtc` is never used in the file (windows are built by the queries themselves; `at()` is local). Confirmed by eslint.
**Fix:** `const { displayTodayUtc } = warrantyModule`.

### IN-03: Fourth verbatim copy of the smoke scaffolding

**File:** `scripts/smoke-dashboard.mjs:42-136`
**Issue:** `applyMigrations`, the spawn/env block, the readiness poll, the jose cookie mint, and the SIGTERM/SIGKILL cleanup are copied verbatim from `smoke-devices.mjs` (and the same block already exists in `smoke-custody.mjs` / `smoke-employees.mjs`). Any fix to the scaffolding (e.g., the migration comment-stripping edge case) now has four places to land.
**Fix:** Extract the shared helpers into `scripts/smoke-lib.mjs` (applyMigrations, startServer, waitForReady, mintSessionCookie, withServer cleanup) and import from the four smokes. Follow-up chore, not a blocker for this phase.

### IN-04: `redirect: 'manual'` passed inside a headers object is a junk HTTP header

**File:** `scripts/smoke-dashboard.mjs:136` (same pattern `scripts/smoke-devices.mjs:135`)
**Issue:** `const cookieHeaders = { cookie: \`session=${token}\`, redirect: 'manual' }` is then passed as `fetch(url, { headers: cookieHeaders })`. `redirect` is a `RequestInit` option, not a header — here it becomes a literal `redirect: manual` HTTP header and the effective redirect mode stays `follow`. Harmless today (all cookie'd assertions expect 200/404), but it misleads readers into thinking redirects are disabled on those requests.
**Fix:** `const cookieHeaders = { cookie: \`session=${token}\` }` and pass `redirect: 'manual'` explicitly only in the fetch inits that need it (as step 8's `/` fetch already does in `smoke-devices.mjs`).

---

_Reviewed: 2026-09-14T08:35:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
