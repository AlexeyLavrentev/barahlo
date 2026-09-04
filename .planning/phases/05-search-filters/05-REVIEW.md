---
phase: 05-search-filters
reviewed: 2026-09-04T20:16:00Z
depth: standard
files_reviewed: 30
files_reviewed_list:
  - app/(app)/(card)/devices/[id]/page.tsx
  - app/(app)/(card)/employees/[id]/page.tsx
  - app/(app)/devices/department-filter.tsx
  - app/(app)/devices/filter-bar.tsx
  - app/(app)/devices/page.tsx
  - app/(app)/devices/query-params.ts
  - app/(app)/devices/ram-chip.tsx
  - app/(app)/devices/search-box.tsx
  - app/(app)/devices/status-filter.tsx
  - app/(app)/devices/type-filter.tsx
  - app/(app)/devices/warranty-filter.tsx
  - app/api/devices/export/route.ts
  - app/globals.css
  - db/index.ts
  - db/queries/devices.ts
  - db/queries/movements.ts
  - lib/csv.ts
  - lib/device-schema.ts
  - lib/normalize.mjs
  - lib/normalize.ts
  - lib/warranty-date.tsx
  - lib/warranty.ts
  - scripts/seed.mjs
  - tests/csv-export.test.ts
  - tests/device-search.test.ts
  - tests/devices-perf.test.ts
  - tests/devices-queries.test.ts
  - tests/homoglyphs-fixture.ts
  - tests/movements-queries.test.ts
  - tests/warranty.test.ts
findings:
  critical: 1
  warning: 1
  info: 3
  total: 5
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-09-04T20:16:00Z
**Depth:** standard
**Files Reviewed:** 30
**Status:** issues_found

## Summary

Phase 5 (live search, combinable filters, warranty color, CSV export, perf gate/seed) is
strong overall: the search predicate is fully parameterized with LIKE-wildcard escaping and a
write/query normalization fold that the tests prove in both directions; the CSV route is the
correct security shape for the phase's main attack surface (`requireSession()` first, every
cell through the CWE-1236 tab-prefix escaper, hardcoded headers, nosniff/no-store, RFC 5987
dual filename); the warranty filter and color share the one inclusive 60-day boundary via
`WARRANTY_WARN_DAYS` + `displayTodayUtc()`, so a filter hit can never render green; and the
NULL-safe RAM predicate (`isNull OR ne 1`) is correct against three-valued SQL.

The one genuine correctness failure is in `DeviceSearchBox`: its local state never
reconciles with the server-parsed `q` prop. This does not merely degrade UX — it
(a) un-does the «Сбросить фильтры» empty-state action 300 ms after it is clicked, and
(b) starts an unbounded, repeating navigation loop whenever the raw input differs from the
server-trimmed query (e.g. a trailing space). Everything else found is drift-risk
(duplicated filter-stripping, a hardcoded type list) or fixture quality.

No issues were found in: CSV injection matrix and headers, homoglyph/normalization path,
warranty date math and predicates, movements/custody queries, pagination/clamping, the
sentinel-to-undefined filter contract itself, or the perf gate.

## Critical Issues

### CR-01: DeviceSearchBox state never reconciles with the URL — «Сбросить фильтры» is undone after 300 ms and a padded query loops navigations forever

**File:** `app/(app)/devices/search-box.tsx:28-57` (with the false rationale at `app/(app)/devices/page.tsx:123-124`)
**Issue:**
`value` is initialized from `q` once (`useState(q)`, line 28) and `setValue` is called only
from `onChange` (line 85). There is no code path that adopts an externally changed `q`. The
debounce effect's only guard is `if (value === q) return` (line 40), which is a no-op skip —
it neither clears the input nor prevents a push when the two differ. Two concrete failures:

1. **Reset is always undone.** Whenever a search is active, `value === q` (they match), so
   clicking the empty state's «Сбросить фильтры» `<Link href="/devices">` renders the island
   with `q=''` while `value` still holds the old query → `value !== q` → the effect schedules
   a 300 ms timer → `router.replace(buildDevicesQuery({ ...current, q: value }))` re-applies
   the just-cleared filter. The user sees the full list flash for ~300 ms, then the filtered
   (often empty) state snaps back, and the input still displays the stale query. The comment
   at `page.tsx:123-124` — "On arrival q='' flows down and the island's value === q guard
   clears the input" — describes a mechanism that does not exist anywhere in the file. The
   same fight applies to browser Back/Forward across search states.

2. **Server-trim mismatch causes a repeating navigation loop.** The server trims `q`
   (`query-params.ts:60`, `rawQ.trim()`), but the island pushes and keeps the raw input. Type
   a query with a trailing space (ordinary while typing) and stop: the debounce pushes
   `?q=foo%20`, the server renders `q='foo'`, and now `value ('foo ') !== q ('foo')` on every
   render. Because `current` is a fresh object from `parseDevicesSearchParams` on every
   server render, the effect re-runs each render, schedules the 300 ms timer, and pushes the
   same URL again; App Router creates a fresh segment on every push/replace (the
   `bfcacheId` contract in the bundled Next 16 docs), re-rendering with a new `current` —
   the cycle repeats indefinitely (~1 full RSC request + page render every 300 ms per open
   tab) until the user edits the input. This is an unbounded self-triggered request loop, not
   a perf nit.

**Fix:**
Track the last `q` the island has seen or pushed, and adopt external changes instead of
fighting them:

```tsx
const lastSynced = useRef(q)

useEffect(() => {
  if (!mounted.current) {
    mounted.current = true
    lastSynced.current = q
    return
  }
  // q changed behind our back («Сбросить фильтры», Back/Forward, or the
  // server's trimmed echo of a padded push): adopt it, never re-push.
  if (q !== lastSynced.current) {
    lastSynced.current = q
    setValue(q)
    return
  }
  if (value === q) return
  lastSynced.current = value // we are initiating; the echo lands on this value
  timer.current = setTimeout(() => {
    timer.current = null
    startTransition(() =>
      router.replace(buildDevicesQuery({ ...current, q: value }), { scroll: false }),
    )
  }, 300)
  return () => { /* existing cleanup */ }
}, [value, q, current, router])
```

`commitNow` (line 60) must set `lastSynced.current = value` before its push as well. With
this shape the padded-query echo lands on `lastSynced`, the adopt branch trims the input to
the canonical value, and the loop is dead; the reset link and Back/Forward restore control to
the user. Also correct the false comment at `page.tsx:123-124`.

## Warnings

### WR-01: URL-sentinel stripping block is duplicated between the page and the export route — a silent-drift hazard against the phase's own zero-drift contract

**File:** `app/(app)/devices/page.tsx:47-52` and `app/api/devices/export/route.ts:59-64`
**Issue:** Both call sites hand-maintain an identical 6-line mapping from `DeviceFilters`
sentinels (`'' / 'all' / null / false`) to the db layer's `undefined`-means-inactive contract.
Phase 5's own architecture note (`query-params.ts:7-11`, `route.ts:14-17`) treats any second
parse path as the drift anti-pattern ("any second parse path WILL drift"), and
`db/queries/devices.ts:30-35` states a leaked sentinel "would corrupt every composed filter"
— e.g. a future filter added to `DeviceFilters` but forgotten in one of the two blocks, or
one block updated to pass a sentinel, silently yields wrong results (a leaked `'all'` status
compiles into `eq(devices.status, 'all')` → zero rows) rather than erroring. Today both
blocks are identical; the risk is the next edit.

**Fix:** Put the mapping next to the parser it mirrors, in the ONE params module:

```ts
// query-params.ts
export function toDeviceListFilters(f: DeviceFilters): DeviceListFilters {
  const out: DeviceListFilters = {}
  if (f.q !== '') out.q = f.q
  if (f.status !== 'all') out.status = f.status
  if (f.departmentId !== null) out.departmentId = f.departmentId
  if (f.warranty !== 'all') out.warranty = f.warranty
  if (f.ramNoUpgrade) out.ramNoUpgrade = true
  return out
}
```

and call `listDevices({ type: filters.type, ..., filters: toDeviceListFilters(filters) })`
from both the page and the route.

## Info

### IN-01: Type filter hardcodes the type vocabulary, unlike the status/warranty filters which derive from the keystone

**File:** `app/(app)/devices/type-filter.tsx:24-30`
**Issue:** `FILTER_ITEMS` enumerates the four type keys literally. The status filter derives
from `DEVICE_STATUS_KEYS`/`deviceStatusLabel` (`status-filter.tsx:19-25`, honoring D-02's
single-source rule) and the warranty filter shares `WARRANTY_ITEMS` with the parser — the
type filter is the one island with a parallel list. A fifth type added to
`lib/device-schema.ts` would be accepted by the server and invisible to the filter.
**Fix:** Derive the option keys from `DEVICE_TYPES` (labels may stay local for the plural
list-filter copy), or export a `DEVICE_TYPE_FILTER_ITEMS` from the keystone.

### IN-02: Seed can generate future-dated «assigned» movement events, violating D-01 in fixtures

**File:** `scripts/seed.mjs:77-78, 104, 244-250`
**Issue:** `MAX_PURCHASE` is the hardcoded instant 2026-08-31 and the assigned event's
`occurred_at` is `purchaseDate + 1..21 days`, so fixtures seeded around today's date carry
«assigned» events up to 2026-09-21 — in the future. D-01 (movement schema) rejects future
dates on the real write path, so the seed produces history the app itself would refuse, and
the employee card / timeline render «выдано {будущая дата}». The hardcoded date also silently
goes stale as wall-clock time advances (the window is already closing naturally).
**Fix:** Anchor the purchase spread relative to seeding time, e.g.
`MAX_PURCHASE = Math.floor(Date.now() / 1000) - 30 * DAY` (keeping determinism via the
existing PRNG for everything else), or clamp assigned-event dates to `min(computed, now)`.

### IN-03: Comment documents a nonexistent input-clearing mechanism

**File:** `app/(app)/devices/page.tsx:123-124`
**Issue:** "On arrival q='' flows down and the island's value === q guard clears the input"
is factually wrong — the `value === q` guard skips work; it never clears anything (see
CR-01). A future maintainer reasoning from this comment would re-introduce the reset bug.
**Fix:** Delete or rewrite the comment as part of the CR-01 fix.

---

_Reviewed: 2026-09-04T20:16:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
