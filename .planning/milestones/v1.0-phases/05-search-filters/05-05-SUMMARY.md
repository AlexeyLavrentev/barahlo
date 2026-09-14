---
phase: 05-search-filters
plan: 05
subsystem: perf-and-seed
tags: [vitest, performance-regression, sqlite, seed-fixtures, warranty-date-math, ui-03]

# Dependency graph
requires:
  - phase: 05-search-filters
    plan: 02
    provides: "the combined listDevices where-builder (q + type + status + department + warranty + RAM) this plan measures, lib/warranty displayTodayUtc/addDaysUtc for exact warn-band anchors"
  - phase: 05-search-filters
    plan: 03
    provides: "warrantyUntil on the listDevices row select (widened DeviceListItemWithCover) — kept intact by the perf assertions"
  - phase: 01-foundation
    provides: "vitest temp-SQLite harness (DATABASE_PATH before @/db import, applyMigrations via db.$client), seed.mjs mulberry32 core + double guard"
provides:
  - "tests/devices-perf.test.ts — the UI-03 automated regression gate: in-test deterministic ≥500-row bulk seed + full-combination timing tripwire (avg < 200 ms, worst < 1 s) + raw-SQL count/page-walk honesty assertions"
  - "scripts/seed.mjs at production-like scale (200/80/50/70 ≈ 400) with all four warranty states and Cyrillic-searchable models — UAT-ready dev fixtures"
affects: [05-04 csv export (can swap the perf test's raw-SQL count mirror for exportDevices — documented equivalent), 05-VALIDATION end-of-phase human check (reseed + «мгновенно» at ~400 rows)]

# Tech tracking
tech-stack:
  added: [] # zero new packages (T-05-SC — no supply-chain surface)
  patterns:
    - "Perf tripwire shape: warm-up ×3 → 200 timed runs → assert AVERAGE < generous ceiling + a per-run outlier guard; measured avg/worst printed to runner output for drift tracking, never a hardcoded benchmark number"
    - "Honest timing: total must equal a hand-written raw SQL count over the SAME where composition (search OR-fold through the norm() UDF, employees join, inclusive w60 window as unix seconds, NULL-safe D-07 RAM term) and a full paged walk must yield exactly total rows"
    - "Deterministic in-test bulk seed by index arithmetic (i % k rotations across type/status/warranty/ram) — no PRNG, warn-band anchors pinned to displayTodayUtc() so they match warrantyPredicate exactly"

key-files:
  created:
    - tests/devices-perf.test.ts
  modified:
    - scripts/seed.mjs

key-decisions:
  - "The timing honesty anchor is a raw SQL count over the SAME WHERE composition (primary wording): this plan runs in wave 3 before plan 04's exportDevices exists — once merged, calling it instead is equivalent (the swap is documented in the test)"
  - "Measured ceiling discipline (A6): avg < 200 ms vs measured 0.757 ms (~260× headroom) + worst < 1 s — a flaky-tight test would train people to ignore it; the gate exists to catch N+1s and dropped indexes, not to benchmark"
  - "Seed warranty nudge limited to the one bucket empty BY CONSTRUCTION: ~5% NULL («без гарантии», D-16/edge 9) via chance(0.05); the warn band landed naturally non-empty (20 devices) so no purchase-date nudge was needed — mulberry32 determinism preserved and re-verified across two fresh seeds"
  - "Full-match rows every 24th device (25 of 600) make every filter dimension active at once AND push total past pageSize, so the pagination math is exercised at scale, not on a single-page edge"

patterns-established:
  - "perf: console.info of avg/worst inside the timing test — the tripwire stays observable run-over-run while the assertion stays generous"
  - "seed verification against a temp DB = DATABASE_PATH=<mktemp> npx drizzle-kit migrate && DATABASE_PATH=<mktemp> node scripts/seed.mjs (the seed assumes a migrated schema; never touches the dev DB)"

requirements-completed: [UI-03]

coverage:
  - id: D1
    description: "UI-03/edge 13: the FULL combined filtered query at ≥500 rows is machine-proven instant — avg 0.757 ms / worst 2.267 ms @ 600 rows over 200 runs under a generous 200 ms ceiling, with correctness (raw count + paged walk) making the timing honest"
    requirement: UI-03
    verification:
      - kind: unit
        ref: "tests/devices-perf.test.ts#listDevices perf — full combined filter at ≥500 rows (UI-03) > averages well under the 200 ms ceiling with a 1 s outlier guard"
        status: pass
      - kind: unit
        ref: "tests/devices-perf.test.ts#listDevices perf — full combined filter at ≥500 rows (UI-03) > total equals a raw SQL count over the same WHERE; pagination stays server-side"
        status: pass
    human_judgment: true
    rationale: "The felt «мгновенно» while paging/filtering/searching the real dev registry at ~400 rows is the documented manual-only end-of-phase check (05-VALIDATION.md human_verify_mode: end-of-phase); the automated gate now backs it permanently"
  - id: D2
    description: "Seeded dev fixtures at production-like scale: 200/80/50/70 = 400 devices, all four warranty states present (expired 175 / warn 20 / ok 180 / none 25 relative to seed day), Cyrillic models searchable, deterministic, double guard intact"
    requirement: UI-03
    verification:
      - kind: grep
        ref: "Plan verify SEED-SCALE-OK: temp-DB counts — total 400, expired non-zero, Cyrillic non-zero; plus live bucket counts 175/20/180/25 and DETERMINISM-OK across two fresh seeds; guards verified firing (exit 1, both messages)"
        status: pass
    human_judgment: false

# Metrics
duration: 11min
completed: 2026-09-04
status: complete
---

# Phase 5 Plan 5: Perf Gate + Seed at Real Scale — «всё это летает на сотнях устройств» Summary

**UI-03 turned into a permanent tripwire: the full combined filter query (q + type + status + department + warranty + RAM over the joined tables) machine-proven instant at 600 rows — avg 0.757 ms over 200 timed runs under a generous 200 ms ceiling — and the dev seed scaled to 400 devices (200/80/50/70) with all four warranty states for human acceptance at real scale.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-09-04T19:26:47Z
- **Completed:** 2026-09-04T19:38:00Z
- **Tasks:** 2/2 (tracer + auto)
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- **The UI-03 automated gate exists (tracer):** `tests/devices-perf.test.ts` seeds 600 devices in-test (deterministic index arithmetic — all four types, all four statuses, warranty across null/past/warn/far-future UTC midnights pinned to `displayTodayUtc()`, ramUpgraded across null/0/1, 4 employees across 2 departments, `PERF-{i}-AB` serials, Cyrillic+Latin models) and times `listDevices` with every filter dimension active at once: **avg 0.757 ms, worst 2.267 ms over 200 runs** — ~260× headroom under the 200 ms ceiling, plus a 1 s per-run outlier guard (A6: generous, so CI noise can never normalize a red run).
- **The timing is honest:** `total` must equal a hand-written raw SQL count over the SAME where composition (the search OR-fold through the same `norm()` UDF `openDb` registers, the employees leftJoin, the inclusive w60 window bound as unix seconds, the NULL-safe D-07 RAM term), and a full paged walk must yield exactly `total` rows with every page ≤ pageSize — server-side pagination semantics proven at scale (total 25 > pageSize 20 → 2 pages).
- **Seed at real scale:** `DEVICE_COUNTS` → { laptop: 200, monitor: 80, dock: 50, peripheral: 70 }. Verified against a migrated TEMP database: total 400 exactly, per-type 200/80/50/70, Cyrillic-searchable models present (18), statuses 270 assigned / 130 in stock. The dev DB itself was never touched.
- **All four warranty states naturally present:** expired 175 / warn-band 20 / ok 180 / none NULL 25 relative to the seed day — the only required nudge was the ~5% NULL slice (the «без гарантии» state was impossible under the old always-warranty line); the warn band landed non-empty naturally, so no purchase-date redistribution was needed.
- **Determinism + guards re-proven (T-05-14):** two fresh seeds produce byte-identical device rows (mulberry32 draw order preserved); production refusal and non-empty-DB refusal both still fire with exit 1 and their original messages — guard lines untouched (byte-identical).

## Task Commits

1. **Task 1: Perf regression gate — full combined filter at 600 rows under 200 ms (tracer)** - `53b26c8` (feat)
2. **Task 2: Seed at production-like scale — 400 devices with full warranty spread** - `6ca8cca` (feat)

**Plan metadata:** (this commit) docs: complete plan

## Files Created/Modified
- `tests/devices-perf.test.ts` — NEW: the UI-03 gate on the existing temp-SQLite harness (DATABASE_PATH before `@/db`, dynamic imports, `applyMigrations(db.$client)`); bulk seed + warm-up + 200 timed runs + raw-count/paged-walk correctness; prints measured avg/worst
- `scripts/seed.mjs` — DEVICE_COUNTS → 200/80/50/70; warranty nudge `chance(0.05) ? null : purchaseDate + pick([1,2,3]) * YEAR` with rationale comment; everything else (guards, mulberry32 core, serial/movement multipliers) untouched

## Decisions Made
- **Raw SQL count over the same WHERE is the honesty anchor.** Wave 3 runs before plan 04's `exportDevices` exists, so the plan's primary wording is a hand-written unpaged count mirroring every predicate — including the `norm()` UDF fold the SQL layer cannot spell natively. The test documents that swapping in `exportDevices` later is equivalent.
- **25 full-match rows (every 24th device).** Beyond proving the filters compose, this pushes `total` past `pageSize` so pages > 1 and the walk/clamp math runs against a real multi-page result — a single-page match could hide an offset bug.
- **Measured numbers printed, not asserted.** `console.info` of avg/worst makes drift visible run-over-run; the pass/fail lines stay the generous A6 assertions (0.757 ms measured vs 200 ms allowed).
- **NULL slice is the whole seed change.** The warn band's expected population at 400 rows (~14) made purchase-date nudging unnecessary — measured 20. Smallest diff that satisfies «all four warranty states naturally present».

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's seed-verify command needs the documented migrate step first**
- **Found during:** Task 2 (verify)
- **Issue:** `DATABASE_PATH=<mktemp>/seed.db node scripts/seed.mjs` fails on a fresh file — the seed assumes a migrated schema (`SqliteError: no such table: devices` at guard 2); the documented flow is `npx drizzle-kit migrate` then seed (README step 2)
- **Fix:** verification procedure only — prepend `DATABASE_PATH="$TMP_SEED" npx drizzle-kit migrate` before the seed run. No code change; the guards and the script's dev-DB behavior are untouched
- **Files modified:** none (procedure)
- **Commit:** n/a

**2. [Rule 2 - Missing critical] The «none: NULL» warranty bucket was empty by construction**
- **Found during:** Task 2 (spread verification — the plan requires all four buckets non-empty; the old line always wrote `warranty_until`)
- **Issue:** with no NULL-warranty devices, the seeded registry could never exercise the «без гарантии» state (edge 9) or its filter/color NULL semantics during UAT
- **Fix:** the plan-sanctioned distribution nudge — `chance(0.05) ? null : …` (~25 devices at 400), draw order kept deterministic; all four buckets then verified live (175/20/180/25)
- **Files modified:** scripts/seed.mjs
- **Commit:** 6ca8cca

### Documented interpretations (no code deviation)
- **Console output in a test:** the timing test prints its measured avg/worst — observability of the tripwire, no repo lint rule prohibits it; assertions unchanged.
- **Repair/moved statuses absent from the seed:** the seed only ever produced in_stock/assigned; out of this plan's scope (its must-haves name warranty states, scale, and Cyrillic coverage — all delivered).

**Total deviations:** 2 auto-fixed (1× Rule 3, 1× Rule 2)
**Impact on plan:** none — each fix is the minimal consequence of the plan's own contracts (documented migrate flow; «all four warranty states naturally present»).

## Issues Encountered
None beyond the two deviations above — both verifies passed on their second formulation; no flakiness observed in the timing test across repeated runs.

## User Setup Required

The **dev database still holds the old 80-device fixtures** — the seed refuses non-empty databases by design (idempotent-by-refusal). To see the registry at the new scale, delete and reseed once (end-of-phase human-check includes this):
```bash
rm data/app.db   # + WAL/SHM if present
npx drizzle-kit migrate && DATABASE_PATH=./data/app.db node scripts/seed.mjs
```
Then page/filter/search /devices by hand — «мгновенно» at ~400 rows (05-VALIDATION.md manual checks).

## Next Phase Readiness
- **Plan 04 (CSV)** can proceed after this: the perf gate measures `listDevices` directly (explicitly independent of `exportDevices`); when the export refactor lands, the test's raw-SQL count mirror may be swapped for it (documented in-test as equivalent).
- **End-of-phase human check** owns: the one-time dev reseed (above), the felt «мгновенно» at ~400 rows, and the visual items from plans 02/03.
- Full suite green: **252 tests / 17 files** (baseline after 05-03 was 250 / 16 — +1 file, +2 tests from the perf gate); `tsc --noEmit` clean; `eslint tests/devices-perf.test.ts` clean.

---
*Phase: 05-search-filters*
*Completed: 2026-09-04*

## Self-Check: PASSED

- SUMMARY exists: .planning/phases/05-search-filters/05-05-SUMMARY.md
- Created files exist on disk: tests/devices-perf.test.ts; modified: scripts/seed.mjs
- Commits verified in git log: 53b26c8 (Task 1 tracer), 6ca8cca (Task 2)
- Perf gate re-run green: avg 0.757 ms / worst 2.267 ms @ 600 rows; suite 252/17 green
- Seed spread re-verified live: total 400, buckets 175/20/180/25, Cyrillic 18, guards fire exit 1, DETERMINISM-OK
