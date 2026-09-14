---
phase: 06-dashboard
plan: 02
subsystem: ui
tags: [dashboard, warranty, drizzle, better-sqlite3, parity-tests, tz-boundary, smoke, nextjs-16]

# Dependency graph
requires:
  - phase: 06-01
    provides: dashboard page shape (tiles/feed/nav, today once per render), deviceCountByType/Status/totalDeviceCount aggregates, listRecentMovements, smoke step 8
  - phase: 05-search-filters
    provides: warrantyPredicate operator composition, buildDevicesQuery/DeviceFilters, WARRANTY_WARN_DAYS=60, displayTodayUtc/addDaysUtc, WarrantyDate component
  - phase: 04-custody-photos
    provides: custody actions for test fixtures (assign/transfer/repair/dispose), append-only movements
provides:
  - warrantyPresetCounts(today?) → {w30,w60,expired} + nearestExpiringWarranties(limit?, today?) → NearestExpiringWarranty[] in db/queries/devices.ts (co-located with warrantyPredicate — D-04 complete)
  - Блок «Гарантия» on / — 3 counter links (locked order 30 → 60 → истекла) into phase-5 presets, «Ближайшие сроки» sub-header, top-5 nearest w60-alive warranties with WarrantyDate variant="card"
  - tests/dashboard-queries.test.ts — Wave-0 fixtures: parity counter↔listDevices.total, frozen-MSK TZ boundary, zero-default, feed ordering/limit/null-slots (06-VALIDATION Wave 0 closed)
  - scripts/smoke-dashboard.mjs — dedicated full-screen smoke on :3119 (perimeter + render + deep-link families + fresh-DB zeros)
affects: [verify-work (held-out visual checks), end-of-phase UAT]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Preset counts as N small count() queries composing THE SAME typed operators as warrantyPredicate — never raw sql with Date operands, never single-pass CASE"
    - "Parity pin: every counter asserted against listDevices({filters}).total through the public API — predicate drift fails loudly"
    - "Frozen-clock TZ tests: vi.useFakeTimers + vi.setSystemTime(MSK_0030) around displayTodayUtc()'s injectable-now default"
    - "Template-literal counter text («label: N» as ONE text node) keeps smoke needles contiguous across React SSR text-splitting"

key-files:
  created:
    - tests/dashboard-queries.test.ts
    - scripts/smoke-dashboard.mjs
  modified:
    - db/queries/devices.ts
    - app/(app)/page.tsx

key-decisions:
  - "warrantyPresetCounts spells the predicate's operator bodies out per counter (w30 with addDaysUtc(today,30), w60 with addDaysUtc(today, WARRANTY_WARN_DAYS)) instead of a shared window closure — the composition stays literally visible beside warrantyPredicate and each boundary is greppable"
  - "Counter labels carry the trailing colon and render via one template literal, so each row is a single static text node — smoke asserts «Истекает ≤ 30 дней: 0» verbatim (the 06-01 SSR-split lesson applied at the source)"
  - "Warranty top-5 rows render the «гар. до » prefix themselves + WarrantyDate variant=\"card\" (bare colored date, warn orange by construction — w60-alive only); zero page-local date/color math"
  - "Zero-default group runs FIRST in tests/dashboard-queries.test.ts on the still-empty temp DB (later groups seed in beforeAll) — deterministic vitest declaration order, no second database bootstrap"
  - "smoke-dashboard seeds NO probe device: a fully fresh DB turns Pitfall 8 into assertions (zeros + honest empty states) instead of a caveat"

patterns-established:
  - "Dashboard warranty pattern: counters + nearest list take an injectable today parameter defaulting to displayTodayUtc() — the page's once-per-render Date is the single source for counts, list and WarrantyDate"
  - "Parity-fixture pattern: counter == filter total through the PUBLIC API (listDevices), plus hand-known bucket counts to catch shared-math drift"
  - "Second smoke harness pattern: dedicated per-screen smoke scripts clone the smoke-devices harness on their own :31xx port"

requirements-completed: [DASH-01, DASH-02]

coverage:
  - id: W1
    description: "Parity pin (D-04): every dashboard counter (4 types, 4 statuses, total, warranty presets w30/w60/expired) equals listDevices' total under identical params through the public API; type tiles sum to «Всего»"
    requirement: DASH-01
    verification:
      - kind: e2e
        ref: "npx vitest run tests/dashboard-queries.test.ts (parity group) — counter == filter total, hand-known buckets 1/3/1"
        status: pass
    human_judgment: false
  - id: W2
    description: "Блок «Гарантия» (DASH-02): inclusive WARRANTY_WARN_DAYS boundary (day 0/60 in, 61 out, yesterday expired-only, NULL nowhere), locked counter order, top-5 soonest-first with id tiebreaker and no expired/NULL rows, empty states truthful"
    requirement: DASH-02
    verification:
      - kind: e2e
        ref: "node scripts/smoke-dashboard.mjs (perimeter 307 /login; 200 + counter labels + deep-link hrefs w30/w60/expired; fresh-DB zeros + empty states)"
        status: pass
      - kind: other
        ref: "throwaway live check 2026-09-14 (temp DB, port 3123, killed by PID): seeded fixtures render counters 2/3/1, top-5 soonest-first excluding +70/expired/NULL, warn-orange only (no green), hrefs w30/w60/expired"
        status: pass
      - kind: other
        ref: "npx vitest run tests/dashboard-queries.test.ts (TZ group, frozen MSK 00:30 via vi.setSystemTime)"
        status: pass
    human_judgment: false
  - id: W3
    description: "Visual anatomy held out per UI-SPEC: counter row hover/focus rings, top-5 two-line shape with truncated model + warn date, «Ближайшие сроки» 14/600 sub-header separation"
    verification: []
    human_judgment: true
    rationale: "Held-out visual verification — only provable by looking at the rendered card (UI Considerations reserves this for verify-work); no component test runner exists in the repo"

# Metrics
duration: 19min
completed: 2026-09-14
status: complete
---

# Phase 6 Plan 2: Warranty Block + Wave-0 Fixtures + Smoke Summary

**Блок «Гарантия» достроен из тех же операторов, что фильтры фазы 5 (счётчики-пресеты + топ-5 w60-живых с переиспользованной WarrantyDate), а инвариант D-04 превращён из обзора кода в громкие красные тесты: parity счётчик↔listDevices.total, frozen-MSK граница, zero-default и лента — плюс выделенный smoke-dashboard**

## Performance

- **Duration:** 19 min
- **Started:** 2026-09-14T07:13:07Z
- **Completed:** 2026-09-14T07:32:27Z
- **Tasks:** 3 (all auto)
- **Files:** 2 created, 2 modified

## Accomplishments
- `warrantyPresetCounts(today = displayTodayUtc())` → {w30, w60, expired} and `nearestExpiringWarranties(limit = 5, today = displayTodayUtc())` → NearestExpiringWarranty[] added to `db/queries/devices.ts` directly in the dashboard-aggregates block beside `warrantyPredicate` — each count composes THE SAME typed operators (`isNotNull + gte/lte/lt + addDaysUtc + WARRANTY_WARN_DAYS`); N small counts, no raw sql, no CASE (D-04 co-location complete)
- Блок «Гарантия» on `/`: one divide-y card in the new `grid gap-8 sm:grid-cols-2 sm:gap-6` zone (warranty left/first, feed second) — three counter rows in D-04's locked order («Истекает ≤ 30 дней: N» → w30, «Истекает ≤ 60 дней: M» → w60, «Истекла: K» → expired), each a Link built by `buildDevicesQuery` with a full DeviceFilters (zero hand-concatenation), always rendered including «: 0»; «Ближайшие сроки» sub-header (14/600); top-5 nearest w60-alive rows (модель truncate + chevron; «гар. до » + `WarrantyDate variant="card"` warn-orange by construction); honest empty copy
- One `today = displayTodayUtc()` per render feeds `warrantyPresetCounts(today)`, `nearestExpiringWarranties(5, today)` and every `WarrantyDate` — three consumers, one Date
- `tests/dashboard-queries.test.ts` (17 tests): parity of every counter against `listDevices` totals through the public API (+ hand-known buckets 1/3/1 and type-sum == total); frozen MSK 00:30 boundary via `vi.setSystemTime` (day 0/60 in, 61 out, yesterday expired-only, NULL nowhere; nearest ordering + id tiebreaker + limit truncation); zero-default on the empty DB (empty GROUP BYs, total 0, eight keystone zeros); feed contract (tie → higher id first, limit 10 on 12 events, null slots survive, fromId/toId + model/serial join correctness, movementEventLabel 7 types + raw fallback)
- `scripts/smoke-dashboard.mjs` on :3119: / without cookie → 307 /login; with cookie → 200 with «Дашборд», active nav, «Всего:», all three counter labels, sub-header, feed header, and deep-link href families `?type=` / `?status=` / `?warranty=w30|w60|expired`; fresh temp DB asserts «: 0» counters, «Нет техники с истекающей гарантией», «Перемещений пока нет» (Pitfall 8 as assertion); repeat run passes

## Task Commits

1. **Task 1: Блок «Гарантия» — счётчики-пресеты и топ-5 ближайших сроков (DASH-02, D-04)** - `92d6fda` (feat)
2. **Task 2: Wave-0 тесты — parity против listDevices, TZ-граница, zero-default, лента** - `5b1c6af` (test)
3. **Task 3: smoke-dashboard.mjs — периметр, render и deep-link пробы дашборда** - `0f1c703` (test)

**Plan metadata:** pending (docs commit follows this summary)

## Files Created/Modified
- `db/queries/devices.ts` — warrantyPresetCounts + nearestExpiringWarranties + WarrantyPresetCounts/NearestExpiringWarranty types, zero new imports (operator vocabulary already in the module)
- `app/(app)/page.tsx` — warranty block (WarrantyTopRow, WARRANTY_COUNTERS, warrantyCounterHref), blocks zone grid, imports ChevronRight/WarrantyDate/formatWarrantyDate + the two new queries
- `tests/dashboard-queries.test.ts` — NEW, 4 groups / 17 tests, shared temp-SQLite bootstrap, custody-action fixtures
- `scripts/smoke-dashboard.mjs` — NEW, smoke-devices harness clone on :3119, fresh-DB assertions

## Decisions Made
- Counter text renders as one template literal (`${label} ${count}`, labels carry the colon) — single static text node per row keeps the smoke needles contiguous despite React SSR `<!-- -->` splitting
- Zero-default test group ordered FIRST in the file with all later groups seeding in `beforeAll` — honest empty-DB assertions on the shared temp DB without a second bootstrap
- smoke-dashboard seeds nothing: the fully fresh DB converts Pitfall 8 from a caveat into assertions
- TZ tests freeze the clock per test (`vi.useFakeTimers` + `vi.setSystemTime(MSK_0030)`, `afterEach(useRealTimers)`) around the default-parameter clock of the new queries and `warrantyPredicate` alike; boundary fixtures use absolute dates so seeding stays clock-independent

## Deviations from Plan

None — plan executed exactly as written. No Rule 1–3 auto-fixes were needed; the threat-model mitigations (requireSession-first, builder-only hrefs, no second warranty math, no new packages) are all in the plan's own contract and verified.

## Acceptance-Criteria Clarifications

1. **`grep -c "displayTodayUtc" app/(app)/page.tsx` == 1 is unsatisfiable with a named import** (the import line necessarily contains the name → 2 matches). The criterion's intent — ONE computation per render — holds exactly: `grep -c "displayTodayUtc()" app/(app)/page.tsx` == 1, and the single `today` is passed to all three consumers. No code contortion (aliasing/star-import) was introduced for the literal count.
2. All other Task 1/2/3 acceptance greps pass verbatim (export counts, WARRANTY_WARN_DAYS >= 2, addDaysUtc >= 3, Ближайшие сроки == 1, negative greps `/devices?` == 0 and `warrantyState(` == 0, listDevices >= 13, setSystemTime family, 3119/warranty=w/expired/Перемещений пока нет in the smoke).

## Issues Encountered
- First run of the TZ group failed on MY fixture math, not the code: the id-tiebreaker pair seeded at +16 days legitimately falls inside the w30 window too — expected membership sets updated to include it (strengthens the test). Green on re-run; committed in `5b1c6af`.
- The throwaway live-check script's first version asserted counter numbers with a React-split-only regex; the template-literal rows render one contiguous text node (`Истекает ≤ 30 дней: 2`), confirmed by direct SSR dump. Throwaway scripts deleted after use.
- Pre-existing working-tree modifications (.planning/config.json, package.json/package-lock.json with a playwright devDep) belong to the orchestrator environment and were deliberately left out of the task commits (same discipline as 06-01).

## Verification Results
- `npx vitest run` — 19 files / 295 tests green (baseline 278/18 preserved exactly, +17 new)
- `npm run build` — green; `node scripts/smoke-devices.mjs` exit 0 (step 8 dashboard markers intact)
- `node scripts/smoke-dashboard.mjs` — exit 0 twice (temp dirs don't collide)
- Isolated live check (seeded temp DB, port 3123, killed by PID): counters 2/3/1 on hand-seeded fixtures, top-5 soonest-first excluding +70/expired/NULL, warn orange only, all three preset hrefs
- Task 2 acceptance: `grep -c "listDevices" >= 4` (13), `listRecentMovements >= 1` (7), `setSystemTime family >= 1` (12), `describe|it( >= 8` (22)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 6 is now feature-complete (DASH-01..03): the dashboard is the full D-02 screen — tiles, «Гарантия» and feed; Wave-0 fixtures 06-VALIDATION closed (parity, feed ordering, TZ boundary)
- Remaining for end-of-phase: held-out visual checks (UI Considerations backstops — truncation/title behavior, hover/focus anatomy) and the seeded-DB manual probe «клик по счётчику открывает список с тем же числом» (plan verification item)
- Known deferred from 06-01 is now closed: tile/count parity against listDevices is pinned by this plan's tests

---
*Phase: 06-dashboard*
*Completed: 2026-09-14*

## Self-Check: PASSED

All 4 task files exist on disk; task commits `92d6fda`, `5b1c6af`, `0f1c703` present in git log; all verify commands green (vitest 295/19, build, both smokes, acceptance greps, isolated live check).
