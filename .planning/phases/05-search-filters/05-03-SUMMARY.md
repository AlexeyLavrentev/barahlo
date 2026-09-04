---
phase: 05-search-filters
plan: 03
subsystem: warranty-ui
tags: [react-server-components, design-tokens, warranty-date-math, tailwind-theme, nextjs-16, react-19]

# Dependency graph
requires:
  - phase: 05-search-filters
    plan: 02
    provides: "lib/warranty.ts (warrantyState/WARRANTY_WARN_DAYS=60 inclusive/displayTodayUtc — the ONE calculation), devices.warrantyUntil on DeviceRow"
  - phase: 05-search-filters
    plan: 01
    provides: "the /devices page skeleton and listDevices where-builder the colored rows render into"
  - phase: 03-device-registry
    provides: "the two-line row recipe, device card FieldRow/Value + StatusPill tint discipline, UTC-midnight dateFormat convention"
  - phase: 04-custody
    provides: "listIssuedByEmployee two-step issued+latest query and the employee-card issued line-2 shape"
provides:
  - "lib/warranty-date.tsx — WarrantyDate server component (list/card variants) + formatWarrantyDate: the ONE colored-render path for all three WAR-01 sites"
  - "--color-warranty-ok: #248A3D / --color-warranty-warn: #FF9500 @theme tokens (expired reuses --color-destructive #D70015 — D-17 один красный)"
  - "warrantyUntil in the listDevices row select (DeviceListItemWithCover widened) and in listIssuedByEmployee + IssuedDeviceView"
  - "the select-widening contract test (Date round-trips, null stays null) in tests/movements-queries.test.ts"
  - "host-tz-independent date tests: isoDaysFromNow/C7 pinned to the DISPLAY_TZ wall clock"
affects: [05-04 csv export (CSV warranty column can reuse formatWarrantyDate), 05-VALIDATION end-of-phase visual check, v2 warranty tile]

# Tech tracking
tech-stack:
  added: [] # zero new packages (T-05-SC — no supply-chain surface)
  patterns:
    - "One server component, three render sites: WarrantyDate computes warrantyState(value, today) with today passed down once per page render — never per row"
    - "Colored text only: the component inherits the local text role (14/400 lists, 16/400 card) and changes ONLY color — no pill/background/bold/icon"
    - "@theme literal-hex tokens with inline UI-SPEC rationale comments; expired deliberately token-less (reuses --color-destructive)"

key-files:
  created:
    - lib/warranty-date.tsx
  modified:
    - app/globals.css
    - db/queries/devices.ts
    - db/queries/movements.ts
    - app/(app)/devices/page.tsx
    - app/(app)/(card)/devices/[id]/page.tsx
    - app/(app)/(card)/employees/[id]/page.tsx
    - tests/movements-queries.test.ts

key-decisions:
  - "One WarrantyDate + one warrantyState + one WARRANTY_WARN_DAYS = 60 inclusive boundary serve all three D-16 sites — a filter hit can never render green (edge 8), divergence is unrepresentable by construction (T-05-08 mitigate)"
  - "Colors: ok #248A3D (checker D3 rec, NOT the system-green draft — resolution 2), warn #FF9500 (locked D-17), expired reuses #D70015 — no second red token exists"
  - "«без гарантии» renders NO state anywhere: list segments omitted (separator included), device card shows «—» uncolored (edge 9)"
  - "listIssuedByEmployee widened with ONE select field (Pitfall 9) — the compiler error at the component would have been the wiring signal; no any-widening"

patterns-established:
  - "WarrantyDate list variant renders the WHOLE « · гар. до {dd.mm.yyyy}» segment (leading separator included) in the state color inside the truncate'd line; the row title carries the same segment via the shared formatWarrantyDate"
  - "WarrantyDate card variant colors the date value only beneath the untouched label; «—» keeps the existing missing-value rule (text-ink-secondary)"

requirements-completed: [WAR-01]

coverage:
  - id: D1
    description: "WAR-01/D-16 literal: exactly three colored render sites — registry row line 2, device card «Гарантия до» value, employee-card issued line 2 — all through ONE WarrantyDate and ONE warrantyState calculation; text color only"
    requirement: WAR-01
    verification:
      - kind: grep
        ref: "PLAN-VERIFY-OK gate: both tokens with exact hexes, warrantyUntil in both selects, variant=\"list\" at both list sites, variant=\"card\" at the device card, zero #34C759 in globals.css; tsc --noEmit clean; next build compiled"
        status: pass
      - kind: unit
        ref: "tests/movements-queries.test.ts#listIssuedByEmployee — warrantyUntil widening (WAR-01 site 3, plan 05-03): Date round-trips, null stays null"
        status: pass
    human_judgment: true
    rationale: "The rendered color/typography (green vs orange vs red on real rows, segment not wrapping the truncate'd line) is the documented manual-only check at end-of-phase per 05-VALIDATION.md (human_verify_mode: end-of-phase) — RSC output cannot be asserted from the vitest node environment"
  - id: D2
    description: "Edge 9: warrantyUntil NULL renders as «no state» — the «гар. до …» segment is omitted in both lists (separator included), the device card shows «—», nothing is ever colored"
    requirement: WAR-01
    verification:
      - kind: unit
        ref: "tests/movements-queries.test.ts#listIssuedByEmployee — warrantyUntil widening: the null-warranty issued row returns warrantyUntil null (the component's null branches render null / «—» on top of this contract)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Edge 8 continuity: the color shares the filter's WARRANTY_WARN_DAYS = 60 inclusive boundary through the same warrantyState() — a device found by «Истекает ≤ 60 дней» can never render green; expiring today renders warn"
    requirement: WAR-01
    verification:
      - kind: grep
        ref: "lib/warranty-date.tsx imports warrantyState from '@/lib/warranty' (the plan-02 module) — no second calculation exists; boundaries pinned by tests/warranty.test.ts (day 0/59/60/61, MSK 00:30 pair)"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-09-04
status: complete
---

# Phase 5 Plan 3: Warranty Color Everywhere — «увидел истекающую гарантию» Summary

**Warranty state colored at exactly the three D-16 render sites through ONE WarrantyDate server component and the ONE inclusive 60-day warrantyState calculation — tokens #248A3D / #FF9500 / #D70015, «без гарантии» never colored, listIssuedByEmployee widened so the employee card can color too.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-04T19:00:52Z
- **Completed:** 2026-09-04T19:16:36Z
- **Tasks:** 2/2 (tracer + auto) + 1 pre-task blocking fix
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments
- **WAR-01 taken literally (D-16):** one `WarrantyDate` server component (no client JS) now colors the warranty date in the registry row line 2 (« · гар. до 12.03.2027» as the final segment), the device card «Гарантия до» value (16/400, label untouched), and the employee card's issued line 2 («{серийник mono} · выдано {дата} · гар. до {дата}»).
- **One calculation, three sites:** the component calls the plan-02 `warrantyState(value, today)` with `today = displayTodayUtc()` computed ONCE per page render and passed down — the color's boundaries ARE the filter's boundaries (`WARRANTY_WARN_DAYS = 60` inclusive, expiring today = warn), so a «Истекает ≤ 60 дней» hit can never render green (edge 8, T-05-08 mitigation by construction).
- **The locked palette:** `--color-warranty-ok: #248A3D` (contrast-safe Apple green, checker D3 rec — not the system-green draft, resolution 2) and `--color-warranty-warn: #FF9500` joined the `@theme` block with rationale comments; «истекла» deliberately got NO token — it reuses `--color-destructive` #D70015, the one red shared with «Списать» (D-17). Text color only — no pill, background, bold or icon anywhere.
- **Edge 9 honored everywhere:** a null `warrantyUntil` renders NO state — the list segment (leading separator included) is omitted and the line stays byte-identical to phase 3/4, the device card shows the uncolored «—», and nothing is ever colored.
- **The data plumbing the component cannot fake (Pitfall 9):** `listDevices` rows and `listIssuedByEmployee` (+ `IssuedDeviceView`) now select `warrantyUntil`; the movements contract is pinned by a test (a UTC-midnight Date round-trips the timestamp column, null stays null).
- **Overflow discipline (UI-SPEC):** the registry row's Link title now carries «гар. до …» (via the shared module-level UTC formatter) only when the segment actually renders — line 2 stays `truncate`, the appended segment never wraps the row.

## Task Commits

1. **Pre-task blocking fix: movement-schema date tests pinned to the DISPLAY_TZ wall clock** - `c9c87bc` (test — Rule 3, see Deviations)
2. **Task 1: End-to-end warranty color — registry rows show «гар. до 12.03.2027» in state color** - `991d122` (feat — tracer; re-verified end-to-end before expansion)
3. **Task 2: Card sites — device card «Гарантия до» colored value + employee-card issued list segment** - `9e1edaa` (feat)

**Plan metadata:** (this commit) docs: complete plan

## Files Created/Modified
- `lib/warranty-date.tsx` — NEW server component: `WarrantyDate({ value, today, variant: 'list' | 'card' })` + exported `formatWarrantyDate`; module-level UTC `Intl` instance; state→class map ok/warn/expired, none → null/«—»
- `app/globals.css` — exactly two new `@theme` tokens with inline UI-SPEC rationale comments (the only CSS edit of the phase)
- `db/queries/devices.ts` — `warrantyUntil` added to the `listDevices` row select; `DeviceListItemWithCover` widened (see Deviations 2); covers batch and RU-sort untouched
- `db/queries/movements.ts` — `IssuedDeviceView` widened + ONE select field in `listIssuedByEmployee`; two-step issued+latest structure untouched
- `app/(app)/devices/page.tsx` — `today` computed once per render; `<WarrantyDate variant="list">` appended after the holder segment; title array extended conditionally (null-filtered join)
- `app/(app)/(card)/devices/[id]/page.tsx` — «Гарантия до» FieldRow value swapped for `variant="card"`; superseded phase-3 «no coloring yet» comment replaced with the WAR-01 rationale
- `app/(app)/(card)/employees/[id]/page.tsx` — issued line 2 gains the `variant="list"` segment after «выдано {дата}»; `today` computed once in `IssuedSection`
- `tests/movements-queries.test.ts` — NEW describe: the select-widening contract (Date + null); plus the pre-task DISPLAY_TZ pinning of `isoDaysFromNow`/C7 assertions

## Decisions Made
- **Single component + single calculation is the whole design** (D-16 literal, T-05-08): `WarrantyDate` imports `warrantyState` from `lib/warranty` — no parallel color logic exists; the frozen-clock tests of plan 02 pin the shared boundary.
- **Expired has no token.** `--color-destructive` (#D70015) is reused so the system keeps exactly one red (D-17); the CSS documents this next to the two new tokens.
- **`formatWarrantyDate` exported from the component module.** The registry row's `title` attribute needs the same dd.mm.yyyy UTC rendering as the visible span — one Intl instance serves both, so tooltip and text can never disagree.
- **Type widening where the compiler demands it.** The plan cited `DeviceRow` as already carrying `warrantyUntil`; the actual list-row type is `DeviceListItemWithCover`, which needed the field added (see Deviations 2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Movement-schema date tests were host-clock dependent (pre-task commit `c9c87bc`)**
- **Found during:** plan baseline (before Task 1) — the full suite ran 2 failing tests on this host
- **Issue:** `isoDaysFromNow` and the C7 assertion used host-LOCAL date getters; the app contract (and the schema under test) validate against DISPLAY_TZ Europe/Moscow. This host is UTC+5 (Asia/Yekaterinburg), so every run between 00:00–02:00 local resolves «today» to Moscow's TOMORROW — the D-01 future-date guard legitimately rejected «today», and the C7 backdate assertion read a day that differs by the +2h offset. CR-01's bug class, in test infrastructure.
- **Fix:** the helper derives yyyy-mm-dd from `Date.now() + N·86400_000` formatted in DISPLAY_TZ (en-CA); the C7 assertion compares the stored instant's DISPLAY_TZ day against the submitted iso. Product code untouched.
- **Files modified:** tests/movements-queries.test.ts
- **Commit:** c9c87bc

**2. [Rule 3 - Blocking] `DeviceListItemWithCover` widened with `warrantyUntil: Date | null`**
- **Found during:** Task 1
- **Issue:** the plan said «type DeviceRow already carries it — no type change needed», but `listDevices` returns `DeviceListItemWithCover` (not `DeviceRow`); without the field the page's `row.warrantyUntil` is a compile error — exactly the Pitfall-9 signal, on the query side.
- **Fix:** added the field to `DeviceListItemWithCover` (the honest list-row contract); `DeviceRow` untouched.
- **Files modified:** db/queries/devices.ts
- **Commit:** 991d122

**3. [Rule 1 - Bug] Task 1's `! grep 34C759` gate tripped on my own rationale comment**
- **Found during:** Task 1 verify
- **Issue:** the token's inline comment read «…NOT #34C759» — the guard greps for the hex's absence anywhere in globals.css, and my comment contained it.
- **Fix:** reworded the comment («the darker text-safe green, not the system-green A1 draft»); the hex now appears nowhere in the file. No code change.
- **Files modified:** app/globals.css
- **Commit:** 991d122

### Documented interpretations (no code deviation)
- The tracer gate was re-run in-place per auto mode (auto_advance): Task 1's `<verify>` re-executed green (42 devices-queries tests + all greps + `tsc --noEmit`) before Task 2 started.

**Total deviations:** 3 auto-fixed (1× Rule 3 pre-task, 1× Rule 3 in-task, 1× Rule 1 comment)
**Impact on plan:** none — each fix is the minimal consequence of the plan's own contracts (DISPLAY_TZ discipline, Pitfall 9, the verify grep).

## Issues Encountered
- One transient full-suite failure (single test, 250-test run at 00:12 local) immediately after the tz-pin fix — not reproducible: 6 consecutive green runs followed, including the movements file standalone (53/53). Consistent with the documented ±1h hour-boundary race in the C7 test; the suite is green at the recorded verification time. No action taken beyond monitoring.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- Plan 04 (CSV) consumes: `parseDevicesSearchParams` unchanged; if the CSV gains a warranty column it can reuse `formatWarrantyDate` (module-level UTC formatter) — no second date formatter needed.
- Plan 05 (perf): the registry rows now carry one extra column in the page-20 select — no added query, no added join.
- End-of-phase human-check (05-VALIDATION.md) owns the visual items this plan deliberately leaves manual: the four-state colors on real rows/cards, segment truncation with long holders, «—» on «без гарантии» cards.
- Full suite green: 250 tests / 16 files (baseline after 05-02 was 249 / 16); `tsc --noEmit` clean; `npx next build` compiled successfully.

---
*Phase: 05-search-filters*
*Completed: 2026-09-04*

## Self-Check: PASSED

- SUMMARY exists: .planning/phases/05-search-filters/05-03-SUMMARY.md
- All 8 task files exist on disk (1 created, 7 modified)
- Commits verified in git log: c9c87bc (pre-task tz-pin fix), 991d122 (Task 1 tracer), 9e1edaa (Task 2)
- Full suite: 250 tests / 16 files green; `tsc --noEmit` clean; `npx next build` compiled successfully
