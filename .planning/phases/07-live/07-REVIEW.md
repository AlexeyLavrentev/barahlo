---
phase: 07-live
reviewed: 2026-09-16T04:13:06Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - app/(app)/devices/search-box.tsx
  - app/(app)/employees/page.tsx
  - app/(app)/employees/query-params.ts
  - app/(app)/employees/search-box.tsx
  - db/queries/employees.ts
  - lib/use-search-param.ts
  - tests/employee-search.test.ts
findings:
  critical: 0
  warning: 1
  info: 5
  total: 6
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-09-16T04:13:06Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the phase-7 live-search expansion: the shared `useDebouncedSearchQuery` hook extracted from the device island, the new `/employees` search island + query-params module, the `listEmployees` search predicate, the employees page, and the 46-case test matrix.

Verified sound: `tsc --noEmit` clean; the test suite passes (46/46); the hook body was diffed against the base commit (34074e9) and is verbatim except the deliberate G-7-1 `inFlight.length === 0` adopt guard; LIKE patterns are parameterized, wildcard-escaped, and carry `ESCAPE '\'` (no SQL-injection path); `q`/`filter` degrade to sentinels in the one parser; the count and rows queries share one `where` and the same inner join (count/rows parity holds; the join is on a `.notNull()` FK primary key and cannot multiply rows); page parsing guards fractional/non-numeric values and `listEmployees` clamps into `[1, pages]`.

The one substantive defect family lives in the shared hook's push bookkeeping: its push sites do not check whether identical text is already in flight, which produces redundant navigations and stale `inFlight` entries. I verified this empirically with a line-faithful plain-JS mirror of the hook's state machine (real timers, FIFO navigation queue, server-side trim, React cleanup/dep semantics); the mirror is deterministic and reproduced all three scenarios below. Consequences are user-visible but recoverable (a reset click silently undone; input/URL desync after a double-Enter), so this is WARNING tier, not BLOCKER. No security issues found.

## Warnings

### WR-01: Hook push sites lack an in-flight/no-op guard — duplicate navigations, a reset click that silently reverts, and a persistent input/URL desync

**File:** `lib/use-search-param.ts:71-74, 110, 125-135, 147-164`

**Issue:** Three push-site gaps share one root cause — nothing checks whether the server already holds (or is already being navigated to) the exact text being pushed:

1. **Duplicate push of an in-flight value** (lines 125-135, 147-164). When the echo of push N lands during push N+1's arm window, the absorb branch falls through and re-arms a push of the same text that is *already queued*. Proven scenario (server latency > 300 ms, normal typing pace): typing `a` then `ab` fires navigations `[a, ab, ab]` — three navigations for two queries. If the user clicks «Сбросить поиск» between the duplicate's queueing and its landing, the stale duplicate lands *after* the reset and **reverts the URL and list back to `?q=ab`** — the reset click is silently undone and must be repeated. Double-Enter has the same duplicate-push hole (`commitNow` re-pushes while `value` is already in `inFlight`).
2. **Stale `inFlight` entry permanently blocks external adoption.** The duplicate same-URL echo never re-runs the effect (its deps are unchanged), so the echo branch's `findIndex`/`splice` removes only one of the two identical entries and the survivor is never absorbed. Afterwards the adopt branch (line 80) is permanently gated off by `inFlight.length === 0`: after clicking «Сбросить поиск» the list resets (`q=''`) but the input keeps the old text **indefinitely** — the user's only recovery is typing (four more pushes evict the entry via the shift cap). Proven: double-Enter, then reset → `value='елкин'`, `q=''`, `inFlight=['елкин']` persists.
3. **Trailing-space segment switch re-pushes the current URL** (line 110). The no-op skip is `value === q` (exact). A synced input holding `«aspire »` (its push echoed as `q='aspire'`) fails that check, so every segment switch (new `filter` prop) arms a 300 ms push of the already-current query — a redundant navigation per segment click. Proven: nav history `[aspire, aspire]`.

**Fix:**

```ts
// 1) In the debounce callback (before line 127) and in commitNow (before
//    line 156): never queue a value that is already being navigated to.
if (inFlight.current.includes(value)) return

// 2) In the echo branch (lines 72-74): absorb ALL matching entries, not
//    just the first, so duplicates cannot survive an echo.
const remaining = inFlight.current.filter((p) => q !== p && q !== p.trim())
if (remaining.length !== inFlight.current.length) {
  inFlight.current = remaining
  lastSynced.current = q
}

// 3) Replace the exact no-op skip (line 110) with a trim-aware one — the
//    server normalizes q, so identical-after-trim content is a no-op:
if (value.trim() === q.trim()) return
```

All three proven scenarios clear with this patch: no duplicate is ever queued (1 kills scenarios 1 and 2), and the trailing-space switch becomes a silent no-op (3 kills scenario 3).

## Info

### IN-01: `router` omitted from the effect dependency array (lint warning)

**File:** `lib/use-search-param.ts:144`

**Issue:** `react-hooks/exhaustive-deps` warning: `router` is used inside the effect but not listed as a dependency. `useRouter()` returns a stable instance in the App Router, so behavior is unaffected. Already reviewed and accepted in the broken-windows ledger (`.planning/WINDOWS.md`, commit 5e00b28). Listed for traceability only — no action.

### IN-02: `target: { filter }` inline object re-runs the hook effect on every render

**File:** `app/(app)/employees/search-box.tsx:26-32`

**Issue:** The island allocates a fresh `target` object per render; since `target` is an effect dependency in the shared hook, the reconciliation effect re-runs on *every* island render, not only on `value`/`q` changes. Currently benign (every branch skips when synced), but it is a latent footgun on a hook whose API is documented as a frozen shared dependency, and it is what converts WR-01's item 3 into a redundant navigation on every segment switch.

**Fix:** `const target = useMemo(() => ({ filter }), [filter])`

### IN-03: `EmployeeListItem` and `EmployeeRow` are structurally identical types

**File:** `db/queries/employees.ts:13-25`

**Issue:** Both define `{ id, name, department, isActive }`. Duplication invites drift when one grows.

**Fix:** `export type EmployeeRow = EmployeeListItem` (or a shared base).

### IN-04: Ё/ё search-fold asymmetry between /employees and /devices

**File:** `db/queries/employees.ts:59-68` (vs `db/queries/devices.ts:172-178`)

**Issue:** The employee predicate folds Ё/ё→E/e on both the query and the column side, so «елкин» finds «Ёлкин». The device predicate folds neither, so the same class of query cannot find a model storing «Ё…» on /devices. The employees-side comment documents the fold placement as deliberate (D-01 keeps the write-side `normalizeNumber` untouched), and inventory codes rarely carry Ё — but the user-facing behavior of the two search boxes diverges for the same mental model. Confirm the asymmetry is intended; if so, no code change needed.

### IN-05: Token cap silently drops tokens beyond 20

**File:** `db/queries/employees.ts:60`

**Issue:** `.slice(0, 20)` truncates the token list without any signal: a 25-token query returns rows that do **not** contain tokens 21–25 (AND semantics silently weaken to first-20-AND). Documented as a sanitary ceiling, and unreachable from the input (maxLength 100 makes >20 Cyrillic tokens impossible from the UI), but Phase 11's ⌘K palette reuses this predicate whole and may feed it longer strings.

**Fix:** If the ceiling is the contract, document it at the export site the palette will call; otherwise AND the overflow tokens into a post-filter.

---

_Reviewed: 2026-09-16T04:13:06Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
