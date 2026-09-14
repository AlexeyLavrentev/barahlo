---
phase: 05-search-filters
verified: 2026-09-04T20:39:27Z
status: passed
score: 5/6 must-haves verified
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:

  - truth: "Live-search UI invariant: 300 ms debounce from the first character, re-typing cancels the pending timer, Enter commits immediately, and an externally changed q («Сбросить фильтры», Back/Forward) is adopted into the input without a re-push navigation loop (CR-01 lastSynced reconciliation)"
    test: "In a browser on a seeded dev DB: type in the search box, retype mid-debounce, press Enter, then click «Сбросить фильтры» and use browser Back/Forward"
    expected: "Results update without Enter and without flicker; retyping never fires a stale push; after reset/Back/Forward the input shows the URL's q and no navigation loop starts"
    why_human: "Timer cancellation and the lastSynced reconciliation are client-runtime state transitions in a 'use client' island — no test exercises them (the repo has no component-test harness; the vitest node env cannot render the island), so presence + wiring is proven but the transition is not"
human_verification:

  - test: "Live-search feel: open /devices on a seeded dev DB, type a serial fragment from the first character (no Enter), retype mid-debounce, press Enter once"
    expected: "Results update live ~300 ms after typing stops, no skeleton flash per keystroke, the input keeps focus and its value, Enter commits immediately"
    why_human: "Debounce feel, focus retention and transition smoothness are browser-runtime behavior — RSC/island output is not assertable from the vitest node environment (documented manual-only item in 05-VALIDATION.md)"

  - test: "Search-box reconciliation (CR-01): with a q active click «Сбросить фильтры», then use browser Back and Forward; also push a query with trailing spaces and let the server trim it"
    expected: "The input adopts the URL's q after reset/Back/Forward (it empties on reset, restores on Back) and no re-push navigation loop starts"
    why_human: "The fix (be80413, lastSynced ref) is present and wired, but the invariant spans browser history navigation — untestable outside a real browser; the fixer explicitly flagged it human-verify"

  - test: "One-bar FilterBar on a narrow viewport: narrow the window under ~768 px; set a department with a very long name; type a 100-character query"
    expected: "The bar wraps to a second line without overflow (flex-wrap by design), the long department name truncates with ellipsis in its sm:w-40 trigger, the long query renders in the flex-1 field without breaking the bar"
    why_human: "PLAN 02/05 backstop truths marked verification: backstop — held-out visual layout checks (05-VALIDATION.md manual item)"

  - test: "Warranty colors on real data: open /devices, a device card with each warranty state, and an employee card with issued devices"
    expected: "Registry row line 2 shows « · гар. до dd.mm.yyyy» colored green (#248A3D) beyond 60 days, orange (#FF9500) in the inclusive window, red (#D70015) expired; the device card «Гарантия до» value colored, label untouched; «без гарантии» renders no segment in lists and a plain «—» on the card; text color only — no pills/backgrounds/bold/icons"
    why_human: "Rendered color/typography is RSC visual output — the calculation is test-proven (frozen-clock boundary tests) but the paint cannot be asserted from vitest (documented manual-only item)"

  - test: "CSV open test: download via «Скачать CSV» on a filtered view and open the file once in RU Excel or Numbers"
    expected: "Cyrillic intact (no mojibake), one column per field («;» separator), dates dd.mm.yyyy, a model starting with «=» opens as text (no formula execution)"
    why_human: "PLAN 04 backstop truth marked verification: backstop — BOM/«;»/CRLF/mojibake behavior in a real spreadsheet app cannot be asserted from the vitest node environment; the automated layer (shape + injection matrix + headers) is fully proven"

  - test: "Reseed the dev DB and feel UI-03 at real scale: rm data/app.db (+ WAL/SHM), npx drizzle-kit migrate && DATABASE_PATH=./data/app.db node scripts/seed.mjs, then page/filter/search /devices"
    expected: "The registry shows ~400 devices (200/80/50/70) with all four warranty states; paging, filtering and search feel instant at that scale"
    why_human: "The automated perf gate is green (avg 0.922 ms @ 600 rows), but the felt «мгновенно» on the real dev DB is the documented end-of-phase check; the dev DB still holds the old 80-device fixtures (seed refuses non-empty DBs by design)"
---

# Phase 5: Search & Filters — Verification Report

**Phase Goal:** Главный продукт и момент Core Value: мгновенный точный ответ — нашёл устройство по фрагменту номера, отфильтровал «ноуты без апгрейда RAM» одним кликом, увидел истекающую гарантию; всё это летает на сотнях устройств.
**Verified:** 2026-09-04T20:39:27Z
**Status:** human_needed
**Re-verification:** No — initial verification

> **MVP-mode format discrepancy (escalation).** ROADMAP.md sets `Mode: mvp` for this phase, but the goal is NOT in User Story format (`As a …, I want to …, so that ….` — `gsd-tools query user-story.validate` returns `false`). The strict MVP User-Flow UAT framing therefore cannot be applied literally. Verification proceeded against the ROADMAP's 5 Success Criteria (the non-negotiable roadmap contract), with the User Flow Coverage table below derived from those criteria — they decompose the goal into exactly its user-visible moments. If strict MVP framing is wanted for the UAT script, run `/gsd mvp-phase 5` to reformat the goal. This discrepancy does not change the technical verdict.

## User Flow Coverage

User story equivalent (from the 5 ROADMAP Success Criteria): an operator finds a device by a number fragment despite keyboard layout, filters «ноуты без апгрейда RAM» in one click, composes filters with search, sees expiring warranties at a glance — all instant at hundreds of devices.

| Step | Expected | Evidence | Status |
|------|----------|----------|--------|
| Type a fragment of serial/inventory/model | Live filtered results, case/whitespace/homoglyph-insensitive; «С123» finds «C123» | `db/queries/devices.ts:171` searchPredicate (fold → cap → escape → 3-way LIKE), `db/index.ts:25` norm() UDF = write-side normalizeNumber, `tests/device-search.test.ts` 26 tests (11-pair matrix, reverse direction, cap, wildcards) — all green | ✓ (server path) |
| Live search from the keyboard | ~300 ms debounce, Enter commits, no lost keystrokes | `app/(app)/devices/search-box.tsx` island wired into FilterBar (`filter-bar.tsx:26`) → router.replace(scroll:false) in startTransition; **timer-cancellation/reconciliation transition unexercised by any test** | ⚠️ behavior-unverified |
| Click «Без апгрейда RAM» | One click → complete correct list of non-upgraded laptops (NULL and 0 included, 1 excluded) | `ram-chip.tsx` + `query-params.ts:101` D-08 coupling + `devices.ts:236-241` NULL-safe predicate; `tests/devices-queries.test.ts:426-445` matrix green | ✓ |
| Combine тип/статус/отдел/гарантия with search | Filters compose; URL round-trips; junk params degrade, never 500 | ONE `deviceWhere` (`devices.ts:213-244`) shared by count+rows+export; all islands push full query via `buildDevicesQuery`; composition/degrade/clamp tests green | ✓ |
| Look at a device with expiring warranty | Colored date in registry row, device card, employee card — green/orange/red, nothing when «без гарантии» | `lib/warranty-date.tsx` wired at 3 sites (`page.tsx:217`, `devices/[id]/page.tsx:305`, `employees/[id]/page.tsx:91`); `tests/warranty.test.ts` 14 boundary tests; tokens `globals.css:68-69`; **paint itself is visual** | ✓ (calc+wiring; visual → human) |
| Work at hundreds of devices | Search/filters/pagination instant, server-side | `tests/devices-perf.test.ts`: avg 0.922 ms / worst 12.5 ms @ 600 rows (200 ms ceiling); seed verified live: 400 devices, buckets 175/20/180/25, Cyrillic 18; felt speed → human | ✓ (automated gate) |

## Goal Achievement

### Observable Truths

Merged must-haves: 5 ROADMAP Success Criteria (roadmap contract) + PLAN frontmatter truths from 05-01..05-05 (deduplicated into the SC-level truths below; plan-level detail appears as evidence).

| #  | Truth                                                                                                                                                                    | Status                         | Evidence                                                                                                                                                                                                                      |
|----|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| T1 | Fragment search over serial/inventory/model is case-insensitive, whitespace-tolerant, homoglyph-folded («С123»→«C123» both directions), server-validated, URL-driven (SC1, FIND-01/FIND-04) | ✓ VERIFIED                     | `tests/device-search.test.ts` 26/26 (Cyrillic→Latin, Latin→Cyrillic via norm() UDF, trim/collapse, 100-char cap, `%`/`_` literal-safe, sort stability, fixture completeness); searchPredicate + shared parser/strip wired (page.tsx:41-57, route.ts:58-63) |
| T2 | Live-search UI invariant: 300 ms debounce from first char, re-typing cancels the timer, Enter commits, external q change adopts without re-push (CR-01)                    | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Island present and wired (search-box.tsx:38-89, FilterBar:26); the cancellation/reconciliation state transition has no test and cannot be exercised in the vitest env — see behavior_unverified_items and Human Verification #1/#2 |
| T3 | «Ноуты без апгрейда RAM» — one click, full correct list; NULL-ramUpgraded laptops INCLUDED, upgraded EXCLUDED, non-laptops NEVER, hand-crafted ?type=monitor&ram=1 inert (SC2, FIND-02) | ✓ VERIFIED                     | `devices.ts:236-241` exact D-07 shape `and(typeKey='laptop', or(isNull, ne 1))`; `tests/devices-queries.test.ts:426-445` (4 RAM cases + hostile combo); RamChip ↔ buildDevicesQuery D-08 coupling (`ram-chip.tsx:21-36`, `query-params.ts:101`) |
| T4 | Type/status/department/warranty filters + q compose into ONE where shared by count and rows; URL round-trips every filter; invalid params degrade to «all», never a 500 (SC3, FIND-03) | ✓ VERIFIED                     | Single `deviceWhere` consumed by listDevices + exportDevices (`devices.ts:213,371`); `tests/devices-queries.test.ts` — composition (497+), degrade, dept D-09 (447-471), clamp; count carries the employees leftJoin (271); shared `toDeviceListFilters` strip (query-params.ts:80-88) |
| T5 | Warranty state visible in card and lists: green ≤60-day INCLUSIVE window / orange / red expired / nothing for NULL — one warrantyState, one WARRANTY_WARN_DAYS=60, three sites (SC4, WAR-01) | ✓ VERIFIED                     | `tests/warranty.test.ts` 14/14 frozen-clock boundaries (day 0/59/60/61, MSK-00:30, null); filter shares the constant (`devices.ts:197`) — a filter hit cannot render green; WarrantyDate wired at all three D-16 sites; tokens #248A3D/#FF9500 at `globals.css:68-69`, expired reuses #D70015; `movements.ts:41,401` widening pinned by tests. Visual paint → Human Verification #4 |
| T6 | At hundreds of devices search/filters/pagination stay instant: server-side LIMIT/OFFSET, ≤ pageSize rows/page, perf regression gate, seed at real scale (SC5, UI-03)       | ✓ VERIFIED                     | `tests/devices-perf.test.ts` green — avg 0.922 ms / worst 12.477 ms @ 600 rows under the 200 ms ceiling with count-parity + paged-walk honesty assertions; seed verified live this verification: total 400 (200/80/50/70), warranty buckets expired 175 / warn 20 / ok 180 / none 25, Cyrillic models 18; page clamp (`devices.ts:274-276`) |

**Score:** 5/6 truths verified (1 present, behavior-unverified)

### Deferred Items

None. No phase-5 gap maps to a later milestone phase (Phase 6 adds the dashboard; it covers none of the items verified here, and the manual-only checks are end-of-phase human checks, not deferred work).

### Required Artifacts

All artifacts: Level 1 (exists) + Level 2 (substantive — no TODO/stub, real logic) + Level 3 (wired) checked.

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `db/index.ts` | norm() UDF in openDb() | ✓ VERIFIED | line 25, `{ deterministic: true }, normalizeNumber` |
| `db/queries/devices.ts` | DeviceListFilters, searchPredicate, deviceWhere, listDevices(filters), exportDevices | ✓ VERIFIED | all present; one where for count+rows; clamp; covers batch untouched; WIRED (page + route) |
| `app/(app)/devices/query-params.ts` | the ONE params module | ✓ VERIFIED | parse/build/toDeviceListFilters/WARRANTY_ITEMS; imported by page, all 6 islands, FilterBar, CSV route — zero drift by construction |
| `app/(app)/devices/search-box.tsx` | debounced island | ✓ VERIFIED | 300 ms timer + startTransition + scroll:false + Enter + lastSynced reconciliation; wired in FilterBar |
| `app/(app)/devices/filter-bar.tsx` | D-12 one bar + CSV link | ✓ VERIFIED | поиск→тип→статус→отдел→гарантия→RAM-чип→CSV (ml-auto); server component, flat props; used by page.tsx:106 |
| `app/(app)/devices/{status,department,warranty,type}-filter.tsx`, `ram-chip.tsx` | filter islands | ✓ VERIFIED | Select (no combobox), aria-labels, aria-pressed on chip, all route through buildDevicesQuery |
| `lib/warranty.ts` | WARRANTY_WARN_DAYS/displayTodayUtc/addDaysUtc/warrantyState | ✓ VERIFIED | pure, injectable clock; consumed by predicates, WarrantyDate, tests |
| `lib/warranty-date.tsx` | WarrantyDate (list/card) | ✓ VERIFIED | one component, three wired sites; null → omitted/«—» |
| `app/globals.css` | warranty tokens | ✓ VERIFIED | `--color-warranty-ok: #248A3D`, `--color-warranty-warn: #FF9500`; no #34C759 anywhere; exactly one red (#D70015) |
| `db/queries/movements.ts` | IssuedDeviceView.warrantyUntil + select field | ✓ VERIFIED | lines 41, 401; pinned by movements tests |
| `lib/csv.ts` | esc/buildCsv/csvResponseHeaders | ✓ VERIFIED | BOM «;» CRLF, tab-prefix guard, dual RFC 5987 filename; vitest-pinned |
| `app/api/devices/export/route.ts` | authenticated GET export | ✓ VERIFIED | requireSession() first (line 56), shared parser + shared strip + exportDevices; registered dynamic in `next build` (ƒ) |
| `tests/{device-search,devices-queries,warranty,csv-export,devices-perf,movements-queries}.test.ts`, `tests/homoglyphs-fixture.ts` | proof layer | ✓ VERIFIED | all enumerated and green in the single full-suite run |
| `scripts/seed.mjs` | DEVICE_COUNTS 200/80/50/70 + NULL slice | ✓ VERIFIED | lines 104, 156; verified live into a temp DB |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| DeviceSearchBox | URL ?q= → parseDevicesSearchParams → listDevices(filters.q) | router.replace(buildDevicesQuery(...), { scroll:false }) in startTransition | ✓ WIRED | search-box.tsx:61,86 → page.tsx:41-57 |
| searchPredicate fold | write-side normalizeNumber | norm() UDF in openDb; serial/inventory *_normalized columns | ✓ WIRED | db/index.ts:25; devices.ts:171-180 vs 413/451 — same lib import |
| DeviceFilters (URL sentinels) | DeviceListFilters (undefined-for-inactive) | shared toDeviceListFilters — ONE mapping | ✓ WIRED | query-params.ts:80-88; page.tsx:51; route.ts:63 |
| displayTodayUtc | warrantyPredicate boundaries | Date operands bound on timestamp column | ✓ WIRED | devices.ts:191-203 imports lib/warranty |
| All 5 filter islands + RamChip | buildDevicesQuery full query string, page=1 | router.push | ✓ WIRED | every island file; no bare `?type=X&page=1` push remains (grep) |
| department predicate | existing leftJoin(employees) | eq(employees.departmentId, filters.departmentId) | ✓ WIRED | devices.ts:226-228; count query carries the same join (271) |
| WarrantyDate (3 sites) | warrantyState + WARRANTY_WARN_DAYS | today = displayTodayUtc() once per render | ✓ WIRED | warranty-date.tsx:14,57; page 217 / device card 305 / employee card 91 |
| listIssuedByEmployee | devices.warrantyUntil | one added select field | ✓ WIRED | movements.ts:401; type at 41; test-pinned |
| /api/devices/export | parseDevicesSearchParams + deviceWhere | request.nextUrl.searchParams → shared parser → exportDevices | ✓ WIRED | route.ts:8-10,58,66; devices.ts:371 |
| «Скачать CSV» link | /api/devices/export + buildDevicesQuery(filters) | plain server <a>, page omitted | ✓ WIRED | filter-bar.tsx:44-49 |
| perf test | listDevices full DeviceListFilters | temp SQLite + 200 timed runs | ✓ WIRED | test green, avg 0.922 ms |
| seed DEVICE_COUNTS | /devices registry at scale | DATABASE_PATH-temp run | ✓ WIRED | verified live: 400 devices |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `/devices` page | rows/total | listDevices → SQLite (deviceWhere) | Real DB query; no static returns | ✓ FLOWING |
| DepartmentFilter | items | FilterBar → listDepartments() once, flat {id,name} | Real query | ✓ FLOWING |
| CSV route | rows | exportDevices → SQLite, no limit/offset | Real query; parity test proves export == union of pages | ✓ FLOWING |
| WarrantyDate | value/today | listDevices select + movements select; displayTodayUtc() | Real columns (Pitfall 9 select-widening test-pinned) | ✓ FLOWING |
| Islands (all) | filters prop | parseDevicesSearchParams on the server | No hollow props (no `{}`/`[]`/null hardcodes at call sites) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Cyrillic «с123» finds Latin «C123» through the SQL path | `npx vitest run` (device-search.test.ts:48) | pass | ✓ PASS |
| Full filter matrix (RAM NULL/dept D-09/status/composition/degrade/clamp) | `npx vitest run` (devices-queries.test.ts) | 42/42 pass | ✓ PASS |
| Warranty inclusive boundaries (day 0/59/60/61, MSK-00:30, null) | `npx vitest run` (warranty.test.ts) | 14/14 pass | ✓ PASS |
| CSV injection matrix + BOM/«;»/CRLF + parity + headers | `npx vitest run` (csv-export.test.ts) | 26/26 pass | ✓ PASS |
| UI-03 perf gate | `npx vitest run` (devices-perf.test.ts) | avg 0.922 ms / worst 12.477 ms @ 600 rows — under 200 ms ceiling | ✓ PASS |
| Whole suite | `npx vitest run` (run once) | 278 tests / 18 files, all green | ✓ PASS |
| Type-check | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Production build + route registration | `npx next build` | green; `/api/devices/export` and `/devices` registered dynamic (ƒ) | ✓ PASS |
| Seed scale + warranty spread (temp DB, dev DB untouched) | mktemp + drizzle-kit migrate + seed + SQL counts | total 400; expired 175 / warn 20 / ok 180 / none 25; Cyrillic models 18 | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes are declared or conventional for this phase (the vitest gates above are the phase's automated proof layer). SKIPPED — nothing to run.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| FIND-01 | 05-01 | Instant substring search over serial/inventory/model, case-insensitive | ✓ SATISFIED | T1: searchPredicate + UDF + 26 tests + live UI wired |
| FIND-02 | 05-02 | «Ноуты без апгрейда RAM» in one click | ✓ SATISFIED | T3: RamChip + NULL-safe predicate + matrix tests |
| FIND-03 | 05-02, 05-04 | Filters by type/status/department/warranty window, combinable with search (+ CSV of the full filtered set) | ✓ SATISFIED | T4 + D-18 route/link/parity tests |
| FIND-04 | 05-01 | Input tolerance: spaces, регистр, homoglyphs | ✓ SATISFIED | T1: 11-pair matrix, tolerance tests, fixture completeness guard |
| WAR-01 | 05-03 | Warranty expiry state shown on card and lists (green/yellow/red) | ✓ SATISFIED | T5: three wired sites, one calculation, boundary tests; visual paint → Human Verification #4 |
| UI-03 | 05-05 | Lists stay fast at hundreds of devices | ✓ SATISFIED | T6: perf gate 0.922 ms @ 600 rows; seed 400 verified; felt speed → Human Verification #6 |

No orphaned requirements: REQUIREMENTS.md maps exactly FIND-01..04, WAR-01, UI-03 to Phase 5; every plan's `requirements` field accounts for all six.

### Prohibitions (must_haves.prohibitions)

| Prohibition | Tier | Status | Enforcement evidence |
| ----------- | ---- | ------ | -------------------- |
| Search MUST NOT widen beyond serial/inventory/model (no holder/employee-name matching) | test | ✓ VERIFIED (structural) | `searchPredicate` is the ONLY consumer of q and references exactly serialNormalized/inventoryNormalized/norm(model); parity test seeds a q-excluded decoy. Note: no dedicated negative test for a holder-name query — the invariant is enforced by single-code-path structure, not by an explicit assertion |
| MUST NOT build relevance ranking — deterministic RU-sort + id tiebreaker | test | ✓ VERIFIED | orderBy(ruSortKey, asc(id)) in both listDevices and exportDevices; sort-stability + Ё-recipe tests |
| RAM MUST NOT use nominal/base-RAM semantics or schema changes | test | ✓ VERIFIED | `git log ff6438d^..HEAD -- db/schema.ts` is empty; predicate reads ramUpgraded only; matrix tests |
| MUST NOT introduce Base UI combobox for filters | judgment | ✓ VERIFIED (LLM-judge, non-authoritative — human review recommended) | All four islands + chip use `components/ui/select` Select; zero combobox imports in app/(app)/devices |
| MUST NOT add a second red / colored warranty surfaces (text color only) | test | ✓ VERIFIED (structural) | globals.css contains exactly one red (#D70015, reused for expired); no #34C759; WarrantyDate renders plain colored text spans only — no pill/background/bold/icon classes |
| MUST NOT add a CSV parsing/serialization dependency | test | ✓ VERIFIED | csv-export.test.ts:318-329 negative dependency test; phase-5 commits touch no package.json (the working-tree `playwright` devDependency is uncommitted and referenced by nothing — info only) |
| Perf ceiling MUST NOT be flaky-tight | judgment | ✓ VERIFIED (LLM-judge, non-authoritative) | 200 ms ceiling + 1 s outlier guard vs 0.922 ms measured, in test source |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| package.json (working tree, uncommitted) | 39 | `playwright` devDependency added outside any phase-5 commit | ℹ️ Info | Not referenced by app/test code; last committed package.json change is phase 4. Unrelated to this phase — flag for housekeeping |
| — | — | No TBD/FIXME/XXX/placeholder/stub markers in any phase-5 file | — | Clean (grep over all 22 phase files) |

### Human Verification Required

See the 6 items in the `human_verification` frontmatter (live-search feel; CR-01 reset/Back-Forward reconciliation; narrow-viewport bar wrap + truncation backstops; warranty color paint; CSV open in Excel/Numbers; dev-DB reseed + felt «мгновенно» at ~400 rows). Items 3 and 5 are the PLANs' own `verification: backstop` truths and are honestly abstained, not passed.

### Gaps Summary

No gaps: every roadmap Success Criterion has code-level, wiring-level and (where automatable) behavioral evidence; 278/278 tests, tsc, and `next build` are green; the seed scale was re-proven live during this verification. What remains is exactly the honest manual surface the plans themselves carved out: browser-only interaction invariants (debounce/CR-01), visual paint (warranty colors, bar wrap), one real-spreadsheet CSV open, and the one-time dev reseed. Status is human_needed solely because those items exist — none is a missing or broken implementation.

---

_Verified: 2026-09-04T20:39:27Z_
_Verifier: Claude (gsd-verifier)_
