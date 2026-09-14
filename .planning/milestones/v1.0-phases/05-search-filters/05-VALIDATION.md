---
phase: 5
slug: search-filters
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-04
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing project suite, temp-SQLite per test) |
| **Config file** | existing vitest config (project root) |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds (184 tests baseline — live-measure, baselines rot) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01 T1 | 01 | 1 | FIND-01 | T-05-01/02 | UDF-fold search; bound params; LIKE escape + 100-char cap | unit (temp SQLite) | `npx vitest run tests/device-search.test.ts` | ⬜ W0 (plan 01) | ⬜ pending |
| 05-01 T2 | 01 | 1 | FIND-04 | T-05-02 | homoglyph fixture completeness; whitespace; wildcards literal | unit | `npx vitest run tests/device-search.test.ts tests/normalize.test.ts` | ⬜ W0 (plan 01) | ⬜ pending |
| 05-02 T1 | 02 | 2 | WAR-01/FIND-03 | T-05-04 | inclusive 60-day boundary; DISPLAY_TZ boundaries; bound Date operands | unit (frozen clocks) | `npx vitest run tests/warranty.test.ts tests/devices-queries.test.ts` | ⬜ W0 (plan 02) | ⬜ pending |
| 05-02 T2 | 02 | 2 | FIND-02/FIND-03 | T-05-04/05 | NULL-safe RAM SQL; dept join semantics; degrade-to-all; count/rows parity | unit | `npx vitest run tests/devices-queries.test.ts` | ⬜ extend | ⬜ pending |
| 05-02 T3 | 02 | 2 | FIND-03/D-08..D-14 | T-05-06 | islands push full query string; Select-not-combobox | unit + source grep | `npx vitest run` + greps per plan | ⬜ plan 02 | ⬜ pending |
| 05-03 T1 | 03 | 3 | WAR-01 | T-05-07/08 | one warrantyState source; tokens #248A3D/#FF9500 | unit + source grep | `npx vitest run tests/devices-queries.test.ts` + greps | ⬜ plan 03 | ⬜ pending |
| 05-03 T2 | 03 | 3 | WAR-01 | T-05-08 | listIssuedByEmployee warrantyUntil contract | unit | `npx vitest run tests/movements-queries.test.ts` | ⬜ extend | ⬜ pending |
| 05-04 T1 | 04 | 4 | D-18 (FIND-03) | T-05-09/10/11/12 | requireSession-first; shared parser; BOM+«;» | source grep + unit | greps + `npx vitest run tests/devices-queries.test.ts` | ⬜ plan 04 | ⬜ pending |
| 05-04 T2 | 04 | 4 | D-18 | T-05-10 | formula-injection tab-prefix matrix; full-filter parity; no CSV dep | unit | `npx vitest run tests/csv-export.test.ts` | ⬜ W0 (plan 04) | ⬜ pending |
| 05-05 T1 | 05 | 3 | UI-03 | T-05-13 | full combined filter < 200 ms @ ≥500 rows | perf unit | `npx vitest run tests/devices-perf.test.ts` | ⬜ W0 (plan 05) | ⬜ pending |
| 05-05 T2 | 05 | 3 | UI-03 | T-05-14 | seed guards intact; ~400 rows; warranty spread | CLI + sqlite3 | `DATABASE_PATH=<tmp> node scripts/seed.mjs` + counts | ⬜ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Homoglyph typing fixture (С↔C, О↔O, …) as shared test data — closes STATE.md blocker; fixture completeness proven, not assumed (RESEARCH §Validation Architecture) → seeded as plan 05-01 Task 2 (tests/homoglyphs-fixture.ts + tests/device-search.test.ts)
- [x] Warranty boundary fixtures: day 59/60/61 relative to MSK-today, NULL warrantyUntil → seeded as plan 05-02 Task 1 (tests/warranty.test.ts, frozen clocks)
- [x] Perf timing test for combined filters at ≥500 seeded rows (generous threshold; RESEARCH measured 0.9 ms @ 500) → seeded as plan 05-05 Task 1 (tests/devices-perf.test.ts)

*Existing vitest temp-SQLite infrastructure covers the rest. The three fixtures ride the wave-ordered plans that create the code they exercise (fixture needs the search predicate; warranty tests need lib/warranty.ts; perf needs the full filter set) — no separate Wave-0 plan.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live-search feel (debounce ~300 мс, «мгновенно») | UI-03 | Subjective latency feel | Type in search box on seeded dev DB; results update without Enter, no flicker |
| Filter bar layout on narrow viewport | UI-03/WAR-01 | Visual | Narrow browser window; controls stack, no overflow |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
