---
phase: 08-csv
reviewed: 2026-09-16T13:52:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - lib/device-csv.ts
  - db/queries/devices.ts
  - app/api/devices/export/route.ts
  - tests/csv-export.test.ts
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-09-16T13:52:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the phase 8 (EXP-01) changes across `lib/device-csv.ts` (new pure module: header/cells layer, keystone-derived labels, warranty dictionary, ISO formatter, decimal-comma diagonal), the `exportDevices`/`DeviceExportRow` extension in `db/queries/devices.ts`, the thin-composer rewrite of `app/api/devices/export/route.ts`, and the expanded `tests/csv-export.test.ts`.

Verified against locked decisions in `.planning/phases/08-csv/08-CONTEXT.md`: column order matches D-01/D-05 exactly (config block contiguous after «SSD, ГБ», «Статус гарантии» right after «Гарантия до», 20 columns); labels are derived from the `PER_TYPE_FIELDS` keystone with a loud throw on unknown keys (D-02); the warranty dictionary maps `warrantyState()` output with no day numbers and «Без гарантии» in every row (D-03/D-04); dates render through one ISO formatter via UTC-midnight-safe `toISOString().slice(0,10)` (D-06). All cells flow through the frozen `esc()`/`buildCsv` path — no raw join exists, so formula injection (CWE-1236) stays closed by construction, including the new free-text `panelType` column.

Frozen surfaces verified untouched in the phase range `c7e095a..a46417a` (git diff): `deviceWhere` unchanged (only `DeviceExportRow` type + `exportDevices` SELECT extended), `parseDevicesSearchParams`→`toDeviceListFilters` chain unchanged (`query-params.ts` not in diff), `requireSession()` still the first statement of the GET handler, `lib/csv.ts` and `lib/warranty-date.tsx` (site dd.mm.yyyy) not in diff. `lib/device-csv.ts` imports `DeviceExportRow` type-only from the db module, so the pure-module discipline (no db side effects on import) holds.

Mechanical checks: `npx vitest run` — 370/370 pass across 20 files (55 in csv-export.test.ts); `npx tsc --noEmit` clean; eslint clean on all four files.

One parity defect found: the export route pre-coalesces duplicated query parameters where the /devices page does not, so a malformed URL can make the CSV diverge from the page view — the exact drift the D-18 contract claims is unrepresentable. Two minor informational items.

## Warnings

### WR-01: Route collapses duplicated query params; page degrades them — page/export parity break on malformed URLs

**File:** `app/api/devices/export/route.ts:43`
**Issue:** `Object.fromEntries(request.nextUrl.searchParams)` silently keeps only the LAST value of a duplicated query parameter. The /devices page instead hands Next's `searchParams` (`Record<string, string | string[]>`) to the shared `parseDevicesSearchParams` (`app/(app)/devices/page.tsx:38-41`), whose design explicitly degrades non-string values to their inactive sentinel (`typeof sp.q === 'string'` etc., `query-params.ts:73-83`). For a duplicated-param URL the two paths therefore disagree — e.g. `?type=laptop&type=monitor`: the page shows ALL types (array → sentinel `all`), the CSV exports only monitors (last value wins); `?ram=0&ram=1`: page has no RAM filter, CSV does. This violates the zero-drift contract the route comments and D-18 rest on («export is literally the same predicate as the page»): not a second parse, but a second param-shaping that only the route performs.
**Fix:** Shape the record the way Next does for the page, preserving duplicates as arrays, before the shared parser:

```ts
// route.ts, GET
const sp: Record<string, string | string[]> = {}
for (const [k, v] of request.nextUrl.searchParams) {
  const prev = sp[k]
  sp[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v]
}
const filters = parseDevicesSearchParams(sp)
```

Both sides then hit the parser's intended array-degradation path and the export equals the page for every URL, well-formed or not.

## Info

### IN-01: Filename date uses server-UTC clock while everything else uses the display-TZ wall clock

**File:** `app/api/devices/export/route.ts:61`
**Issue:** `new Date().toISOString().slice(0, 10)` names the file by the server-UTC calendar day, while the phase's date decisions (`displayTodayUtc`, both file date columns, the warranty verdict) run on the DISPLAY_TZ wall clock. Between 00:00–03:00 MSK the file is named with "yesterday" relative to the office. This is frozen phase-5 behavior (A7), deliberately untouched by this phase and documented in the route comments — noted for awareness only, not a phase-8 regression.
**Fix:** None required for this phase. If ever revisited, compute the filename date via `displayTodayUtc()` for consistency with the rest of the module set.

### IN-02: Date-null guards use Date truthiness instead of an explicit null check

**File:** `lib/device-csv.ts:143-146`
**Issue:** `r.purchaseDate ? isoFileDate(r.purchaseDate) : null` (and the `warrantyUntil` twin) relies on Date objects being always truthy — it works as a null check, but states the wrong contract. If the pattern is ever copied onto a value where falsy is not null (`0`, `''`), a valid falsy value would silently render as an empty cell.
**Fix:** `r.purchaseDate !== null ? isoFileDate(r.purchaseDate) : null` (same for `warrantyUntil`).

---

_Reviewed: 2026-09-16T13:52:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
